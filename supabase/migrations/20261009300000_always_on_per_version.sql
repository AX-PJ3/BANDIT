-- 항상 적용을 기준 버전마다 남겨요 (착수 안내 7 "데이터 항목 목록 v2": 결정 사항은 버전마다 한 줄, 항상 적용 포함).
--
-- 1. standard_versions에 always_on 칸을 더해요. 이미 쌓인 버전은 그 기준의 지금 값으로 채워요.
--    standards.always_on은 최신 버전 값을 옮겨 둔 칸으로 남겨요. 목차와 "항상 적용 10개" 검사가 이 칸을 빨리 읽어요.
--    폐기(deprecate_standard)는 새 버전 없이 이 칸만 false로 바꿔요. 그래서 폐기된 기준만 두 값이 다를 수 있어요.
-- 2. save_standard는 새 버전 줄에 always_on을 함께 넣어요.
-- 3. revert_standard는 그 버전의 항상 적용까지 되돌려요. 되돌려서 항상 적용이 11개가 되면 거절해요 (ALWAYS_ON_LIMIT).
--
-- 이미 올린 마이그레이션은 고치지 않아요. 바뀐 함수는 여기서 다시 만들어요 (인자는 그대로라 권한도 그대로예요).

-- ---------------------------------------------------------------------------
-- 1. 항상 적용을 버전마다 남기기
-- ---------------------------------------------------------------------------

alter table public.standard_versions add column always_on boolean;

-- 이미 쌓인 버전은 그 기준의 지금 값으로 채워요. 이 마이그레이션 전에는 버전마다 남기지 않아서 알 수 있는 값이 이것뿐이에요.
-- 버전 표는 고칠 수 없게 막혀 있어서(standard_versions_no_change) 이 한 번만 막기를 잠깐 풀었다가 다시 걸어요.
alter table public.standard_versions disable trigger standard_versions_no_change;
update public.standard_versions as v
set always_on = s.always_on
from public.standards as s
where s.id = v.standard_id;
alter table public.standard_versions enable trigger standard_versions_no_change;

alter table public.standard_versions alter column always_on set not null;

comment on column public.standard_versions.always_on is
  '항상 적용. 버전마다 남겨요 (데이터 항목 목록 v2). 이 마이그레이션 전 버전은 그때 기준의 값으로 채웠어요';
comment on column public.standards.always_on is
  '최신 버전의 항상 적용을 옮겨 둔 칸이에요. 목차와 10개 제한 검사가 읽어요. 저장·되돌리기 함수가 함께 바꾸고, 폐기하면 false가 돼요';

-- ---------------------------------------------------------------------------
-- 2. save_standard: 항상 적용을 버전에도 남겨요
-- ---------------------------------------------------------------------------

-- 20261009200000_wiki_compat.sql과 같고, 새 버전 줄에 always_on을 함께 넣는 것만 달라요.
create or replace function public.save_standard(
  p_id text default null,
  p_title text default null,
  p_value text default null,
  p_reason text default null,
  p_always_on boolean default null,
  p_base_version integer default null,
  p_evidence text default null,
  p_scope jsonb default null,
  p_area text default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null,
  p_ai_detected boolean default false,
  p_locked boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_id text := btrim(p_id);
  v_title text := btrim(p_title);
  v_value text := btrim(p_value);
  v_reason text := btrim(p_reason);
  v_evidence text := nullif(btrim(p_evidence), '');
  v_area text := nullif(btrim(p_area), '');
  v_changed_by text := nullif(btrim(p_changed_by), '');
  v_ai_detected boolean := coalesce(p_ai_detected, false);
  v_scope jsonb;
  v_current public.standards;
  v_latest public.standard_versions;
  v_final_area text;
  v_version integer;
  v_revert_to integer;
  v_recent integer;
  v_saved_at timestamptz;
begin
  -- 1. 필수 칸 5개: 빈 칸을 한 번에 모아서 알려 줘요
  if nullif(v_id, '') is null then v_missing := array_append(v_missing, 'ID(id)'); end if;
  if nullif(v_title, '') is null then v_missing := array_append(v_missing, '제목(title)'); end if;
  if nullif(v_value, '') is null then v_missing := array_append(v_missing, '값(value)'); end if;
  if nullif(v_reason, '') is null then v_missing := array_append(v_missing, '이유(reason)'); end if;
  if p_always_on is null then v_missing := array_append(v_missing, '항상 적용(alwaysOn: 예/아니오)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject(
      'VALIDATION_FAILED',
      format(
        '%s이(가) 비어 있어서 저장하지 않았어요. 모르는 칸은 지어내지 말고 사람에게 물어본 뒤 다시 저장해 주세요.',
        array_to_string(v_missing, ', ')
      )
    );
  end if;
  perform public.check_actor_and_source(p_actor, p_source);
  if p_base_version is null or p_base_version < 0 then
    perform public.reject('VALIDATION_FAILED', 'baseVersion은 0 이상이어야 해요. 새 기준이면 0, 고치는 거면 get_standard에서 본 버전이에요.');
  end if;
  if v_ai_detected and v_evidence is null then
    perform public.reject(
      'VALIDATION_FAILED',
      'PR에서 찾은 변경은 근거가 있어야 해요. PR 번호와 판단에 쓴 바뀐 코드 줄을 근거(evidence)에 적어 주세요 (detect.change.evidence).'
    );
  end if;

  -- 2. 저장만 하는 칸: 적용 범위는 모양만 확인하고, 비어 있으면 null로 둬요
  if not public.is_blank_scope(p_scope) then
    v_scope := public.normalize_scope(p_scope);
    if v_scope is null then
      perform public.reject(
        'VALIDATION_FAILED',
        '적용 범위는 { code, api, screen, doc } 모양이고, 각 칸은 빈칸이 아닌 글자 목록이어야 해요. 모르면 비워 두세요.'
      );
    end if;
  end if;
  if p_locked is not null and p_actor <> 'human' then
    perform public.reject('VALIDATION_FAILED', '잠금은 사람만 바꿀 수 있어요. 잠금 칸은 비워 두고 저장해 주세요.');
  end if;

  select * into v_current from public.standards where id = v_id for update;
  v_final_area := coalesce(v_area, v_current.area, split_part(v_id, '.', 1));

  -- 3. AI는 사람이 만든 영역 안에서만 기준을 만들고 고쳐요
  if p_actor = 'ai' and not exists (select 1 from public.standards where area = v_final_area) then
    perform public.reject(
      'VALIDATION_FAILED',
      format('영역 %s은(는) 아직 없어요. 새 영역은 사람이 정해요. 있는 영역 안에서 저장하거나 사람에게 물어봐 주세요 (detect.change.no-new-area).', v_final_area)
    );
  end if;

  if v_current.id is null then
    -- 4-a. 새 기준
    if p_base_version <> 0 then
      perform public.reject(
        'NOT_FOUND',
        format('기준 %s이(가) 없어요. 새 기준이면 baseVersion을 0으로, 있는 기준을 고치는 거면 search_standards로 ID를 먼저 확인해 주세요.', v_id)
      );
    end if;
    if v_id !~ '^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$' then
      perform public.reject(
        'VALIDATION_FAILED',
        format('기준 ID는 영역.주제.규칙 세 부분이고 영어 소문자, 숫자, 하이픈만 써요. 예: app.notify.title-length (받은 값: %s)', v_id)
      );
    end if;
    if p_always_on then
      perform public.check_always_on_room(v_id);
    end if;
    begin
      insert into public.standards (id, area, title, always_on, locked, current_version)
      values (v_id, v_final_area, v_title, p_always_on, coalesce(p_locked, false), 1);
    exception when unique_violation then
      perform public.reject(
        'VERSION_CONFLICT',
        format('기준 %s을(를) 다른 사람이 방금 만들었어요. get_standard로 내용을 보고, 고칠 게 있으면 그 버전을 baseVersion으로 다시 저장해 주세요.', v_id)
      );
    end;
    v_version := 1;
  else
    -- 4-b. 새 버전
    perform public.check_editable(v_current, p_base_version, p_actor);
    select * into v_latest
    from public.standard_versions
    where standard_id = v_id and version = v_current.current_version;

    if v_latest.title = v_title and v_latest.value = v_value and v_latest.scope is not distinct from v_scope
      and v_final_area = v_current.area
      and p_always_on = v_current.always_on then
      perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 바뀐 내용이 없어서 새 버전을 만들지 않았어요.', v_id));
    end if;
    if v_ai_detected then
      select count(*) into v_recent
      from public.standard_versions
      where standard_id = v_id and version >= 2 and source <> 'wiki' and created_at > now() - interval '24 hours';
      if v_recent >= 2 then
        perform public.reject(
          'CHANGE_LIMIT',
          format('기준 %s은(는) 최근 24시간 안에 이미 %s번 바뀌었어요. 더 고치지 말고 사람에게 물어 주세요 (detect.safety.repeat-limit).', v_id, v_recent)
        );
      end if;
    end if;
    if p_always_on and not v_current.always_on then
      perform public.check_always_on_room(v_id);
    end if;

    v_version := v_current.current_version + 1;
    -- 앞선 버전과 값이 같아지면 되돌림으로 남겨요 (detect.change.revert-mark)
    if v_latest.value <> v_value then
      select max(version) into v_revert_to
      from public.standard_versions
      where standard_id = v_id and version < v_current.current_version and value = v_value;
    end if;

    update public.standards
    set
      title = v_title,
      area = v_final_area,
      always_on = p_always_on,
      locked = coalesce(p_locked, locked),
      current_version = v_version,
      updated_at = now()
    where id = v_id;
  end if;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope, always_on,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source, ai_detected
  )
  values (
    v_id, v_version, v_title, v_value, v_reason, v_evidence, v_scope, p_always_on,
    v_changed_by, p_actor, v_revert_to is not null, v_revert_to, p_source, v_ai_detected
  )
  returning created_at into v_saved_at;

  -- 같은 사람이 보류해 둔 변경을 이번에 다시 저장했으면 그 보류는 정리된 거예요
  update public.conflicts
  set status = 'resolved', resolution = format('v%s로 다시 저장함', v_version), resolved_by = v_changed_by, resolved_at = now()
  where standard_id = v_id and status = 'held' and proposed_by is not distinct from v_changed_by;

  perform public.on_standard_version_saved(v_id, v_version);

  return jsonb_build_object(
    'standardId', v_id,
    'version', v_version,
    'isRevert', v_revert_to is not null,
    'revertedToVersion', v_revert_to,
    'previousValue', v_latest.value,
    'savedAt', v_saved_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. revert_standard: 그 버전의 항상 적용까지 되돌려요
-- ---------------------------------------------------------------------------

-- 20261009200000_wiki_compat.sql과 같고, 바뀐 곳은 항상 적용이에요.
-- - 되돌릴 버전의 always_on을 기준과 새 버전에 함께 넣어요
-- - 그래서 항상 적용으로 돌아가면 10개 제한을 확인해요
-- - "이미 같은 내용" 검사에 항상 적용도 넣어요
create or replace function public.revert_standard(
  p_id text,
  p_to_version integer,
  p_reason text,
  p_base_version integer,
  p_evidence text default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.standards;
  v_target public.standard_versions;
  v_latest public.standard_versions;
  v_version integer;
  v_saved_at timestamptz;
begin
  if nullif(btrim(p_reason), '') is null then
    perform public.reject('VALIDATION_FAILED', '되돌리는 이유(reason)가 비어 있어서 되돌리지 않았어요. 사람에게 이유를 물어본 뒤 다시 해 주세요.');
  end if;
  perform public.check_actor_and_source(p_actor, p_source);

  select * into v_current from public.standards where id = p_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('기준 %s이(가) 없어요. search_standards로 ID를 먼저 확인해 주세요.', p_id));
  end if;
  perform public.check_editable(v_current, p_base_version, p_actor);

  select * into v_target from public.standard_versions where standard_id = p_id and version = p_to_version;
  if not found or p_to_version >= v_current.current_version then
    perform public.reject(
      'VALIDATION_FAILED',
      format('되돌릴 버전 v%s이(가) 없어요. 지금은 v%s이고, 그보다 앞선 버전으로만 되돌릴 수 있어요.', coalesce(p_to_version::text, '없음'), v_current.current_version)
    );
  end if;

  select * into v_latest from public.standard_versions where standard_id = p_id and version = v_current.current_version;
  if v_latest.title = v_target.title and v_latest.value = v_target.value and v_latest.scope is not distinct from v_target.scope
    and v_latest.always_on = v_target.always_on then
    perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 지금 내용이 이미 v%s과 같아요.', p_id, p_to_version));
  end if;
  if v_target.always_on and not v_current.always_on then
    perform public.check_always_on_room(p_id);
  end if;

  v_version := v_current.current_version + 1;
  update public.standards
  set title = v_target.title, always_on = v_target.always_on, current_version = v_version, updated_at = now()
  where id = p_id;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope, always_on,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source
  )
  values (
    p_id, v_version, v_target.title, v_target.value, btrim(p_reason),
    coalesce(nullif(btrim(p_evidence), ''), format('v%s로 되돌림', p_to_version)),
    v_target.scope, v_target.always_on, nullif(btrim(p_changed_by), ''), p_actor, true, p_to_version, p_source
  )
  returning created_at into v_saved_at;

  perform public.on_standard_version_saved(p_id, v_version);

  return jsonb_build_object(
    'standardId', p_id,
    'version', v_version,
    'isRevert', true,
    'revertedToVersion', p_to_version,
    'previousValue', v_latest.value,
    'savedAt', v_saved_at
  );
end;
$$;
