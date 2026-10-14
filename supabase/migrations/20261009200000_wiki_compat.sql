-- 팀 위키(team-wiki/)의 기준과 저장소를 맞춰요.
--
-- 팀 위키는 사람과 AI가 함께 지키는 기준이에요. 위키에 적힌 규칙 중 DB가 지킬 수 있는 것은
-- 여기서 함수와 제약으로 막아요. 그래야 MCP, 바뀐 기준 찾기, 앱 어디서 저장해도 같은 규칙이 지켜져요.
-- 괄호 안은 그 규칙이 적힌 위키 기준 ID예요.
--
-- 1. 이름을 용어.md의 "코드 이름"에 맞춰요: pending_changes → pending_checks, relation → affected, knew → known
-- 2. 기준 ID는 정확히 세 부분이에요 (data.standard.id-format, check_wiki.py와 같은 규칙)
-- 3. save_standard: AI 안전 규칙 3가지 (detect.change.no-new-area, detect.change.evidence, detect.safety.repeat-limit)
--    결과에 이전 값과 저장 시각을 더해 CHANGELOG 한 줄을 만들 수 있게 해요 (work.wiki.changelog, data.changelog.format)
-- 4. 충돌 보류: conflicts 표와 hold_conflict, resolve_conflict (detect.conflict.hold)
-- 5. 확인할 변경: 상태에 "답 취소"를 더하고, 담당자 없음을 받고, 담당자가 바뀌면 옮겨요
--    (data.pending.status-values, notify.pending.no-owner, notify.pending.owner-change)
-- 6. 답: save_answer, cancel_answer. 답한 사람, 다시 할 일 칸을 더해요 (notify.answer.*, data.response.columns)
-- 7. 읽기 뷰 두 개: answer_records(응답 기록 14칸 재료), affected_checks("관계있다" 답)
-- 8. 앱이 바로 알림을 띄우도록 확인할 변경을 Realtime으로 내보내요 (app.notify.realtime)
--
-- 이미 올린 마이그레이션은 고치지 않아요. 바뀐 함수는 여기서 다시 만들어요.

-- ---------------------------------------------------------------------------
-- 1. 이름: 용어.md "코드 이름"을 따라요
-- ---------------------------------------------------------------------------

alter table public.pending_changes rename to pending_checks;
alter table public.pending_checks rename constraint pending_changes_pkey to pending_checks_pkey;
alter table public.pending_checks rename constraint pending_changes_issue_key_fkey to pending_checks_issue_key_fkey;
alter table public.pending_checks rename constraint pending_changes_standard_id_version_fkey to pending_checks_standard_id_version_fkey;
alter table public.pending_checks rename constraint pending_changes_last_seen_version to pending_checks_last_seen_version;
alter table public.pending_checks rename constraint pending_changes_one_per_issue to pending_checks_one_per_issue;
alter table public.pending_checks rename constraint pending_changes_recipient_not_blank to pending_checks_recipient_not_blank;
alter table public.pending_checks rename constraint pending_changes_status to pending_checks_status;
alter index public.pending_changes_recipient_status rename to pending_checks_recipient_status;

alter table public.answers rename column pending_change_id to pending_check_id;
alter table public.answers rename constraint answers_pending_change_id_fkey to answers_pending_check_id_fkey;
alter table public.answers rename column knew to known;
alter table public.answers rename column unrelated_reason to unaffected_reason;

-- 관계있다/관계없다는 글자 대신 참/거짓 하나로 둬요 (affected)
alter table public.answers drop constraint answers_relation_fields, drop constraint answers_relation;
alter table public.answers add column affected boolean;
update public.answers set affected = (relation = 'related');
alter table public.answers alter column affected set not null, drop column relation;

-- ---------------------------------------------------------------------------
-- 2. 기준 ID는 정확히 세 부분 (영역은 영문 소문자만)
-- ---------------------------------------------------------------------------

alter table public.standards
  drop constraint standards_id_format,
  add constraint standards_id_format check (id ~ '^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$');

-- ---------------------------------------------------------------------------
-- 3. 충돌 보류 (detect.conflict.hold)
-- ---------------------------------------------------------------------------

-- 같은 버전을 보고 두 사람이 서로 다르게 고치면, 늦게 저장한 쪽은 저장되지 않아요 (VERSION_CONFLICT).
-- 그 변경을 버리지 않고 여기에 "보류"로 남겨요. 사람이 정할 때까지 담당자에게 알리지 않아요.
create table public.conflicts (
  id uuid primary key default gen_random_uuid(),
  standard_id text not null references public.standards (id),
  base_version integer not null constraint conflicts_base_version check (base_version >= 1),
  current_version integer not null,
  title text not null constraint conflicts_title_not_blank check (btrim(title) <> ''),
  value text not null constraint conflicts_value_not_blank check (btrim(value) <> ''),
  reason text,
  evidence text,
  scope jsonb,
  proposed_by text,
  proposed_by_actor text not null constraint conflicts_actor check (proposed_by_actor in ('ai', 'human')),
  source text not null
    constraint conflicts_source check (source in ('code', 'ai_chat', 'figma', 'meeting', 'slack', 'wiki')),
  ai_detected boolean not null default false,
  status text not null default 'held' constraint conflicts_status check (status in ('held', 'resolved')),
  resolution text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conflicts_resolved_fields check (
    (status = 'held' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null and resolution is not null and btrim(resolution) <> '')
  )
);

comment on table public.conflicts is
  '충돌. 같은 버전의 기준에 늦게 들어와 저장되지 못한 변경을 보류로 남겨요. 사람이 정하면 resolve_conflict로 닫아요 (detect.conflict.hold).';
comment on column public.conflicts.base_version is '보낸 사람이 보고 고친 버전';
comment on column public.conflicts.current_version is '보냈을 때 이미 저장돼 있던 최신 버전';

create index conflicts_held on public.conflicts (standard_id) where status = 'held';

create trigger conflicts_no_delete
  before delete on public.conflicts
  for each row execute function public.forbid_change();

-- 저장되지 못한 변경을 보류로 남겨요. core의 saveStandard가 VERSION_CONFLICT를 받으면 불러요.
-- 지금 버전과 내용이 같으면 충돌이 아니라서 남기지 않아요. 같은 사람이 같은 내용을 또 보내면 한 번만 남겨요.
create function public.hold_conflict(
  p_id text default null,
  p_base_version integer default null,
  p_title text default null,
  p_value text default null,
  p_reason text default null,
  p_evidence text default null,
  p_scope jsonb default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null,
  p_ai_detected boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.standards;
  v_latest public.standard_versions;
  v_title text := btrim(p_title);
  v_value text := btrim(p_value);
  v_by text := nullif(btrim(p_changed_by), '');
  v_conflict_id uuid;
begin
  if nullif(v_title, '') is null or nullif(v_value, '') is null then
    perform public.reject('VALIDATION_FAILED', '보류할 변경의 제목과 값이 비어 있어요.');
  end if;
  perform public.check_actor_and_source(p_actor, p_source);

  select * into v_current from public.standards where id = btrim(p_id);
  if not found then
    perform public.reject('NOT_FOUND', format('기준 %s이(가) 없어요.', p_id));
  end if;
  if p_base_version is null or p_base_version < 1 or p_base_version >= v_current.current_version then
    perform public.reject(
      'VALIDATION_FAILED',
      format('충돌이 아니에요. 지금 버전 v%s을(를) baseVersion으로 save_standard를 불러 주세요.', v_current.current_version)
    );
  end if;

  select * into v_latest
  from public.standard_versions
  where standard_id = v_current.id and version = v_current.current_version;
  if v_latest.title = v_title and v_latest.value = v_value then
    return jsonb_build_object('held', false, 'conflictId', null, 'currentVersion', v_current.current_version);
  end if;

  select id into v_conflict_id
  from public.conflicts
  where standard_id = v_current.id and status = 'held' and base_version = p_base_version
    and value = v_value and proposed_by is not distinct from v_by;

  if v_conflict_id is null then
    insert into public.conflicts (
      standard_id, base_version, current_version, title, value, reason, evidence, scope,
      proposed_by, proposed_by_actor, source, ai_detected
    )
    values (
      v_current.id, p_base_version, v_current.current_version, v_title, v_value,
      nullif(btrim(p_reason), ''), nullif(btrim(p_evidence), ''),
      case when public.is_blank_scope(p_scope) then null else public.normalize_scope(p_scope) end,
      v_by, p_actor, p_source, coalesce(p_ai_detected, false)
    )
    returning id into v_conflict_id;
  end if;

  return jsonb_build_object('held', true, 'conflictId', v_conflict_id, 'currentVersion', v_current.current_version);
end;
$$;

-- 사람이 보류를 정리해요. 어떻게 정했는지(resolution)를 꼭 남겨요.
create function public.resolve_conflict(
  p_conflict_id uuid default null,
  p_resolution text default null,
  p_resolved_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict public.conflicts;
begin
  if p_conflict_id is null or nullif(btrim(p_resolution), '') is null then
    perform public.reject('VALIDATION_FAILED', '보류 번호(conflictId)와 어떻게 정했는지(resolution)가 있어야 해요.');
  end if;
  select * into v_conflict from public.conflicts where id = p_conflict_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('보류 %s이(가) 없어요.', p_conflict_id));
  end if;
  if v_conflict.status <> 'held' then
    perform public.reject('VALIDATION_FAILED', '이미 정리한 보류예요.');
  end if;
  update public.conflicts
  set status = 'resolved', resolution = btrim(p_resolution), resolved_by = nullif(btrim(p_resolved_by), ''), resolved_at = now()
  where id = p_conflict_id;
  return jsonb_build_object('conflictId', p_conflict_id, 'status', 'resolved');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. save_standard: 위키 규칙을 더해요 (인자는 그대로라 권한도 그대로예요)
-- ---------------------------------------------------------------------------

-- v2(20261009100000)에서 바뀐 점
-- - 기준 ID는 정확히 세 부분 (data.standard.id-format)
-- - AI는 새 영역을 만들지 않아요 (detect.change.no-new-area)
-- - PR에서 찾은 변경(p_ai_detected)은 근거가 있어야 하고 (detect.change.evidence),
--   최근 24시간 안에 이미 두 번 바뀐 기준은 더 고치지 않아요 (detect.safety.repeat-limit)
-- - 결과에 이전 값(previousValue)과 저장 시각(savedAt)을 돌려줘요. CHANGELOG 한 줄을 만들 때 써요
-- - 같은 사람이 보류(conflicts)해 둔 변경을 다시 저장하면 그 보류를 닫아요
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
    standard_id, version, title, value, reason, evidence, scope,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source, ai_detected
  )
  values (
    v_id, v_version, v_title, v_value, v_reason, v_evidence, v_scope,
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

-- revert_standard도 이전 값과 저장 시각을 돌려줘요 (인자는 그대로)
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
  if v_latest.title = v_target.title and v_latest.value = v_target.value and v_latest.scope is not distinct from v_target.scope then
    perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 지금 내용이 이미 v%s과 같아요.', p_id, p_to_version));
  end if;

  v_version := v_current.current_version + 1;
  update public.standards
  set title = v_target.title, current_version = v_version, updated_at = now()
  where id = p_id;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source
  )
  values (
    p_id, v_version, v_target.title, v_target.value, btrim(p_reason),
    coalesce(nullif(btrim(p_evidence), ''), format('v%s로 되돌림', p_to_version)),
    v_target.scope, nullif(btrim(p_changed_by), ''), p_actor, true, p_to_version, p_source
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

-- ---------------------------------------------------------------------------
-- 5. 확인할 변경: 상태 4가지 + 자동 닫힘, 담당자 없음, 담당자 바뀜
-- ---------------------------------------------------------------------------

-- 상태 (data.pending.status-values): 대기 / 답함 / 새 버전으로 대체됨 / 답 취소
-- 자동 닫힘(auto_closed)은 착수 안내 v2의 예외예요. 되돌려서 담당자가 마지막으로 본 값과 같아지면 닫아요.
-- 대기와 답 취소는 "아직 답을 기다리는" 상태라서 닫힌 시각이 없어요.
alter table public.pending_checks
  alter column recipient drop not null,
  drop constraint pending_checks_recipient_not_blank,
  add constraint pending_checks_recipient_not_blank check (recipient is null or btrim(recipient) <> ''),
  drop constraint pending_checks_status,
  add constraint pending_checks_status
    check (status in ('pending', 'answered', 'superseded', 'answer_cancelled', 'auto_closed')),
  add constraint pending_checks_closed_at check ((status in ('pending', 'answer_cancelled')) = (closed_at is null));

comment on table public.pending_checks is
  '확인할 변경. 기준 버전 1개와 이슈 1개마다 한 줄이에요 (notify.pending.one-per-issue). 지우지 않아요.';
comment on column public.pending_checks.recipient is
  '받는 사람 이름 (이슈 담당자). 담당자가 없으면 null(담당자 없음)이고, 담당자가 정해지면 save_issue가 채워요';
comment on column public.pending_checks.status is
  'pending(대기) / answered(답함) / superseded(새 버전으로 대체됨) / answer_cancelled(답 취소, 다시 답을 기다림) / auto_closed(자동 닫힘)';
comment on column public.pending_checks.last_seen_version is
  '받는 사람이 마지막으로 확인한 버전. 화면은 이 버전과 지금 버전을 비교해 보여 줘요 (notify.pending.merge-versions)';

create trigger pending_checks_no_delete
  before delete on public.pending_checks
  for each row execute function public.forbid_change();

-- 이슈 저장. v2와 같고, 담당자가 바뀌면 아직 답하지 않은 확인할 변경을 새 담당자에게 옮겨요.
-- 이전 담당자의 답은 그대로 둬요 (notify.pending.owner-change). 담당자를 비우면 담당자 없음(null)으로 둬요.
create or replace function public.save_issue(
  p_key text default null,
  p_title text default null,
  p_standard_ids text[] default null,
  p_assignee text default null,
  p_status text default 'in_progress'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(p_key);
  v_title text := btrim(p_title);
  v_assignee text := nullif(btrim(p_assignee), '');
  v_ids text[];
  v_missing text[] := '{}';
  v_unknown text[];
  v_previous public.issues;
  v_moved integer := 0;
begin
  select array_agg(distinct btrim(i.item) order by btrim(i.item))
  into v_ids
  from unnest(coalesce(p_standard_ids, '{}')) as i (item)
  where nullif(btrim(i.item), '') is not null;

  if nullif(v_key, '') is null then v_missing := array_append(v_missing, '이슈 번호(key)'); end if;
  if nullif(v_title, '') is null then v_missing := array_append(v_missing, '이슈 제목(title)'); end if;
  if v_ids is null then v_missing := array_append(v_missing, '연결된 기준 ID(standardIds, 1개 이상)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject('VALIDATION_FAILED', format('%s이(가) 비어 있어서 이슈를 저장하지 않았어요.', array_to_string(v_missing, ', ')));
  end if;
  if p_status is null or p_status not in ('in_progress', 'done') then
    perform public.reject(
      'VALIDATION_FAILED',
      format('이슈 상태는 in_progress(진행 중) 또는 done(완료)이어야 해요 (받은 값: %s).', coalesce(p_status, '없음'))
    );
  end if;

  select array_agg(i.id order by i.id)
  into v_unknown
  from unnest(v_ids) as i (id)
  where not exists (select 1 from public.standards as s where s.id = i.id);
  if v_unknown is not null then
    perform public.reject(
      'NOT_FOUND',
      format('이슈 %s에 연결할 기준 %s이(가) 위키에 없어요. 기준을 먼저 저장하거나 ID를 확인해 주세요.', v_key, array_to_string(v_unknown, ', '))
    );
  end if;

  select * into v_previous from public.issues where key = v_key for update;

  insert into public.issues (key, title, assignee, status)
  values (v_key, v_title, v_assignee, p_status)
  on conflict (key) do update
  set title = excluded.title, assignee = excluded.assignee, status = excluded.status, updated_at = now();

  delete from public.issue_standards where issue_key = v_key and standard_id <> all (v_ids);
  insert into public.issue_standards (issue_key, standard_id)
  select v_key, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;

  if v_previous.key is not null and v_previous.assignee is distinct from v_assignee then
    update public.pending_checks
    set recipient = v_assignee
    where issue_key = v_key and status in ('pending', 'answer_cancelled') and recipient is distinct from v_assignee;
    get diagnostics v_moved = row_count;
  end if;

  return jsonb_build_object(
    'issueKey', v_key,
    'created', v_previous.key is null,
    'standardIds', to_jsonb(v_ids),
    'movedChecks', v_moved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 답: 저장과 취소 (notify.answer.*)
-- ---------------------------------------------------------------------------

alter table public.answers
  drop constraint answers_pending_change_id_key,
  drop constraint answers_channel,
  add constraint answers_channel check (channel in ('terminal', 'app', 'slack')),
  add column answered_by text constraint answers_answered_by_not_blank check (answered_by is null or btrim(answered_by) <> ''),
  add column rework_note text constraint answers_rework_note_not_blank check (rework_note is null or btrim(rework_note) <> ''),
  add column cancelled_at timestamptz,
  add column cancelled_by text,
  add column cancel_reason text,
  add constraint answers_affected_fields check (
    (affected and known is not null and unaffected_reason is null)
    or (not affected and known is null and rework_note is null and unaffected_reason is not null and btrim(unaffected_reason) <> '')
  ),
  add constraint answers_unaffected_reason_length check (unaffected_reason is null or char_length(unaffected_reason) <= 100),
  add constraint answers_rework_only_unknown check (rework_note is null or known = false),
  add constraint answers_cancel_fields check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (cancelled_at is not null and cancel_reason is not null and btrim(cancel_reason) <> '')
  );

-- 확인할 변경 하나에 살아 있는 답은 하나예요. 취소한 답은 남겨 두고 다시 답할 수 있어요 (notify.answer.one-place, cancel).
create unique index answers_one_open_per_check on public.answers (pending_check_id) where cancelled_at is null;

comment on table public.answers is
  '답. 지우거나 고치지 않고, 잘못한 "관계없다" 답은 취소 표시만 해요. 주 지표 "몰랐다"는 affected and known = false and cancelled_at is null인 줄이에요.';
comment on column public.answers.affected is '관계있다(true) / 관계없다(false)';
comment on column public.answers.known is '알았다(true) / 몰랐다(false). 관계있다일 때만 값이 있어요';
comment on column public.answers.unaffected_reason is '관계없다 이유 한 줄 (100자 이하). 관계없다일 때 꼭 받아요 (notify.answer.unrelated-reason)';
comment on column public.answers.rework_note is '모르고 계속했다면 다시 할 일. 몰랐다일 때만 (data.response.columns)';
comment on column public.answers.answered_by is '답한 사람 이름. 담당자가 바뀌어도 이 답은 그대로예요';
comment on column public.answers.channel is '답한 곳: terminal(터미널) / app(앱) / slack(Slack DM)';
comment on column public.answers.elapsed_seconds is '알림을 연 순간부터 마지막 답을 고를 때까지 걸린 초 (data.response.check-seconds)';

-- 답은 지우지 않아요. 고칠 수 있는 건 "취소 표시" 한 번뿐이에요.
create function public.guard_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.cancelled_at is null
    and new.cancelled_at is not null
    and (new.id, new.pending_check_id, new.affected, new.known, new.unaffected_reason, new.rework_note,
         new.channel, new.elapsed_seconds, new.answered_at, new.answered_by)
      is not distinct from
        (old.id, old.pending_check_id, old.affected, old.known, old.unaffected_reason, old.rework_note,
         old.channel, old.elapsed_seconds, old.answered_at, old.answered_by)
  then
    return new;
  end if;
  raise exception using
    errcode = 'P0001',
    hint = 'FORBIDDEN',
    message = '답은 지우거나 고칠 수 없어요. 잘못한 "관계없다" 답은 cancel_answer로 취소 표시만 해요 (notify.answer.cancel).';
end;
$$;

create trigger answers_guard
  before update or delete on public.answers
  for each row execute function public.guard_answers();
create trigger answers_no_truncate
  before truncate on public.answers
  for each statement execute function public.forbid_change();

-- 답을 저장해요. 터미널, 앱, Slack 어디서 불러도 같아요.
-- - 관계있다면 알았다/몰랐다를, 관계없다면 이유 한 줄을 꼭 받아요 (notify.answer.two-questions, unrelated-reason)
-- - 한 곳에서 답하면 확인할 변경이 "답함"으로 닫혀서, 다른 곳에서 또 답하면 PENDING_CLOSED로 알려요 (notify.answer.one-place)
-- - 받은 사람만 답할 수 있어요. 담당자 없음이면 답할 수 없어요 (notify.pending.no-owner)
-- - p_reopen_issue: 완료된 이슈에 관계있다고 답하면서 다시 열기로 하면 진행 중으로 바꿔요 (notify.answer.reopen-done)
create function public.save_answer(
  p_pending_check_id uuid default null,
  p_answered_by text default null,
  p_affected boolean default null,
  p_known boolean default null,
  p_unaffected_reason text default null,
  p_rework_note text default null,
  p_channel text default null,
  p_elapsed_seconds integer default null,
  p_reopen_issue boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_by text := nullif(btrim(p_answered_by), '');
  v_reason text := nullif(btrim(p_unaffected_reason), '');
  v_rework text := nullif(btrim(p_rework_note), '');
  v_channel text := nullif(btrim(p_channel), '');
  v_check public.pending_checks;
  v_previous public.answers;
  v_issue public.issues;
  v_answer_id uuid;
  v_reopened boolean := false;
begin
  if p_pending_check_id is null then v_missing := array_append(v_missing, '확인할 변경(pendingCheckId)'); end if;
  if v_by is null then v_missing := array_append(v_missing, '답한 사람(answeredBy)'); end if;
  if p_affected is null then v_missing := array_append(v_missing, '관계있다/관계없다(affected)'); end if;
  if p_affected and p_known is null then v_missing := array_append(v_missing, '알았다/몰랐다(known)'); end if;
  if not p_affected and v_reason is null then v_missing := array_append(v_missing, '관계없다 이유(unaffectedReason, 한 줄)'); end if;
  if v_channel is null then v_missing := array_append(v_missing, '답한 곳(channel)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject('VALIDATION_FAILED', format('%s이(가) 비어 있어서 답을 저장하지 않았어요.', array_to_string(v_missing, ', ')));
  end if;
  if v_channel not in ('terminal', 'app', 'slack') then
    perform public.reject('VALIDATION_FAILED', format('답한 곳은 terminal, app, slack 중 하나예요 (받은 값: %s).', v_channel));
  end if;
  if not p_affected and (p_known is not null or v_rework is not null or coalesce(p_reopen_issue, false)) then
    perform public.reject('VALIDATION_FAILED', '관계없다면 알았다/몰랐다, 다시 할 일, 이슈 다시 열기는 비워 두세요.');
  end if;
  if p_affected and v_reason is not null then
    perform public.reject('VALIDATION_FAILED', '관계있다면 관계없다 이유는 비워 두세요.');
  end if;
  if v_rework is not null and p_known is distinct from false then
    perform public.reject('VALIDATION_FAILED', '다시 할 일은 "몰랐다"고 답할 때만 적어요.');
  end if;
  if char_length(v_reason) > 100 then
    perform public.reject('VALIDATION_FAILED', '관계없다 이유는 100자 이하 한 줄로 적어요.');
  end if;
  if p_elapsed_seconds is not null and p_elapsed_seconds < 0 then
    perform public.reject('VALIDATION_FAILED', '확인 시간(elapsedSeconds)은 0초 이상이에요.');
  end if;

  select * into v_check from public.pending_checks where id = p_pending_check_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('확인할 변경 %s이(가) 없어요.', p_pending_check_id));
  end if;
  if v_check.status = 'answered' then
    select * into v_previous from public.answers where pending_check_id = v_check.id and cancelled_at is null;
    perform public.reject(
      'PENDING_CLOSED',
      format(
        '이미 %s에서 답한 확인할 변경이에요. 다시 답하지 않아도 돼요.',
        case v_previous.channel when 'terminal' then '터미널' when 'app' then '앱' when 'slack' then 'Slack' else '다른 곳' end
      )
    );
  elsif v_check.status = 'superseded' then
    perform public.reject('PENDING_CLOSED', '같은 기준이 또 바뀌어서 최신 확인할 변경으로 합쳐졌어요. 최신 확인할 변경에 답해 주세요.');
  elsif v_check.status = 'auto_closed' then
    perform public.reject('PENDING_CLOSED', '기준이 마지막으로 확인한 값으로 되돌아가서 자동으로 닫혔어요. 답하지 않아도 돼요.');
  end if;
  if v_check.recipient is null then
    perform public.reject('VALIDATION_FAILED', '담당자 없는 이슈의 확인할 변경이에요. 이슈 담당자를 정하면 그 사람이 답해요.');
  end if;
  if v_check.recipient <> v_by then
    perform public.reject('FORBIDDEN', format('이 확인할 변경은 %s님에게 온 거예요. 받은 사람만 답할 수 있어요.', v_check.recipient));
  end if;

  insert into public.answers (
    pending_check_id, affected, known, unaffected_reason, rework_note, channel, elapsed_seconds, answered_by
  )
  values (v_check.id, p_affected, p_known, v_reason, v_rework, v_channel, p_elapsed_seconds, v_by)
  returning id into v_answer_id;

  update public.pending_checks set status = 'answered', closed_at = now() where id = v_check.id;

  select * into v_issue from public.issues where key = v_check.issue_key for update;
  if coalesce(p_reopen_issue, false) and v_issue.status = 'done' then
    update public.issues set status = 'in_progress', updated_at = now() where key = v_issue.key;
    v_reopened := true;
  end if;

  return jsonb_build_object(
    'answerId', v_answer_id,
    'pendingCheckId', v_check.id,
    'issueKey', v_check.issue_key,
    'issueStatus', case when v_reopened then 'in_progress' else v_issue.status end,
    'issueReopened', v_reopened
  );
end;
$$;

-- 잘못한 "관계없다" 답을 취소해요. 처음 답은 남기고 취소 표시만 한 뒤, 확인할 변경을 다시 열어요 (notify.answer.cancel).
create function public.cancel_answer(
  p_answer_id uuid default null,
  p_cancelled_by text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_answer public.answers;
  v_check public.pending_checks;
  v_reopened boolean := false;
begin
  if p_answer_id is null then v_missing := array_append(v_missing, '답(answerId)'); end if;
  if nullif(btrim(p_cancelled_by), '') is null then v_missing := array_append(v_missing, '취소하는 사람(cancelledBy)'); end if;
  if nullif(btrim(p_reason), '') is null then v_missing := array_append(v_missing, '취소 이유(reason)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject('VALIDATION_FAILED', format('%s이(가) 비어 있어서 취소하지 않았어요.', array_to_string(v_missing, ', ')));
  end if;

  select * into v_answer from public.answers where id = p_answer_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('답 %s이(가) 없어요.', p_answer_id));
  end if;
  if v_answer.cancelled_at is not null then
    perform public.reject('VALIDATION_FAILED', '이미 취소한 답이에요.');
  end if;
  if v_answer.affected then
    perform public.reject('VALIDATION_FAILED', '"관계있다" 답은 취소하지 않아요. 잘못한 "관계없다" 답만 취소할 수 있어요 (notify.answer.cancel).');
  end if;

  update public.answers
  set cancelled_at = now(), cancelled_by = btrim(p_cancelled_by), cancel_reason = btrim(p_reason)
  where id = v_answer.id;

  select * into v_check from public.pending_checks where id = v_answer.pending_check_id for update;
  if v_check.status = 'answered' then
    update public.pending_checks set status = 'answer_cancelled', closed_at = null where id = v_check.id;
    v_reopened := true;
  end if;

  return jsonb_build_object('answerId', v_answer.id, 'pendingCheckId', v_check.id, 'reopened', v_reopened);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 읽기 뷰
-- ---------------------------------------------------------------------------

-- 응답 기록 (data.response.columns). `sil export`가 이 뷰로 14칸 표를 만들어요.
-- 바뀐 내용의 "이전 값"은 받는 사람이 마지막으로 확인한 버전, 없으면 바로 앞 버전이에요.
create view public.answer_records
with (security_invoker = true)
as
select
  a.id as answer_id,
  a.answered_at,
  c.standard_id,
  c.version,
  coalesce(seen.value, prev.value) as previous_value,
  v.value,
  v.changed_by,
  v.changed_by_actor,
  v.ai_detected,
  v.evidence,
  c.issue_key,
  a.answered_by,
  a.affected,
  a.known,
  a.elapsed_seconds,
  a.unaffected_reason,
  a.rework_note,
  a.channel,
  a.cancelled_at
from public.answers as a
join public.pending_checks as c on c.id = a.pending_check_id
join public.standard_versions as v on v.standard_id = c.standard_id and v.version = c.version
left join public.standard_versions as seen on seen.standard_id = c.standard_id and seen.version = c.last_seen_version
left join public.standard_versions as prev on prev.standard_id = c.standard_id and prev.version = c.version - 1;

-- "관계있다"고 답한 확인할 변경. MCP가 다음 세션부터 이 기준을 작업 맥락에 넣어요 (notify.answer.next-run-context).
create view public.affected_checks
with (security_invoker = true)
as
select
  a.answered_by,
  c.standard_id,
  c.version,
  c.issue_key,
  i.status as issue_status,
  a.answered_at
from public.answers as a
join public.pending_checks as c on c.id = a.pending_check_id
join public.issues as i on i.key = c.issue_key
where a.affected and a.cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 8. Realtime과 권한
-- ---------------------------------------------------------------------------

-- 앱은 확인할 변경이 생기거나 닫히는 것을 바로 받아요. 별도 푸시 서버는 두지 않아요 (app.notify.realtime).
alter publication supabase_realtime add table public.pending_checks;

alter table public.conflicts enable row level security;
create policy "누구나 읽기" on public.conflicts for select to anon, authenticated using (true);

revoke all on table public.conflicts, public.answer_records, public.affected_checks from anon, authenticated;
grant select on table public.conflicts, public.answer_records, public.affected_checks to anon, authenticated;

revoke all on function
  public.guard_answers(),
  public.hold_conflict(text, integer, text, text, text, text, jsonb, text, text, text, boolean),
  public.resolve_conflict(uuid, text, text),
  public.save_answer(uuid, text, boolean, boolean, text, text, text, integer, boolean),
  public.cancel_answer(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.hold_conflict(text, integer, text, text, text, text, jsonb, text, text, text, boolean),
  public.resolve_conflict(uuid, text, text),
  public.save_answer(uuid, text, boolean, boolean, text, text, text, integer, boolean),
  public.cancel_answer(uuid, text, text)
to anon, authenticated;
