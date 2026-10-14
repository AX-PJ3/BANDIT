-- AI가 찾았나(ai_detected)를 에이전트 경로 T1에서도 쓸 수 있게 해요 (SIL-66, D61).
--
-- T1은 에이전트가 작업 중에 결정 사항과 다른 점을 먼저 알아채고 사람에게 물은 뒤 저장해요. 그래서 AI가 찾았나는 예예요.
-- 그런데 지금까지 save_standard는 AI가 찾았나가 예이기만 하면 PR 경로 규칙 두 가지를 걸었어요.
--   - 근거 필수 (detect.change.evidence): PR 번호와 바뀐 코드 줄. T1에는 PR이 없어요
--   - 24시간에 두 번까지 (detect.safety.repeat-limit): AI가 사람에게 묻지 않고 고치는 걸 막는 규칙. T1은 이미 사람에게 물어요
-- 그래서 두 규칙은 PR에서 찾은 변경(AI가 찾았나 예 + 출처 code)에만 걸어요. 거절 문구도 원래 "PR에서 찾은 변경"이라고 적혀 있어요.
-- 아래 정의는 20261012300000_term_decision.sql의 save_standard 그대로이고, v_from_pr 한 줄과 그걸 쓰는 두 곳만 바뀌었어요.
-- create or replace라서 실행 권한은 그대로예요. 이미 올린 마이그레이션은 고치지 않아요.

comment on column public.standard_versions.ai_detected is
  'AI가 찾았나. AI가 먼저 알아챈 변경이면 true: PR에서 찾았거나(출처 code) 작업 중에 먼저 물었거나(T1, 출처 ai_chat). 사람이 직접 바꾸면 false (D61)';

-- save_standard(p_id text, p_title text, p_value text, p_reason text, p_always_on boolean, p_base_version integer, p_evidence text, p_scope jsonb, p_area text, p_source text, p_actor text, p_changed_by text, p_ai_detected boolean, p_locked boolean)
CREATE OR REPLACE FUNCTION public.save_standard(p_id text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_value text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_always_on boolean DEFAULT NULL::boolean, p_base_version integer DEFAULT NULL::integer, p_evidence text DEFAULT NULL::text, p_scope jsonb DEFAULT NULL::jsonb, p_area text DEFAULT NULL::text, p_source text DEFAULT 'ai_chat'::text, p_actor text DEFAULT 'ai'::text, p_changed_by text DEFAULT NULL::text, p_ai_detected boolean DEFAULT false, p_locked boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- PR에서 찾은 변경 = AI가 찾았나 + 출처 code. T1(출처 ai_chat)은 사람에게 묻고 저장해서 들지 않아요 (D61)
  v_from_pr boolean := coalesce(p_ai_detected, false) and p_source is not distinct from 'code';
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
    perform public.reject('VALIDATION_FAILED', 'baseVersion은 0 이상이어야 해요. 새 결정 사항이면 0, 고치는 거면 get_standard에서 본 버전이에요.');
  end if;
  if v_from_pr and v_evidence is null then
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
        format('결정 사항 %s이(가) 없어요. 새 결정 사항이면 baseVersion을 0으로, 있는 결정 사항을 고치는 거면 search_standards로 ID를 먼저 확인해 주세요.', v_id)
      );
    end if;
    if v_id !~ '^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$' then
      perform public.reject(
        'VALIDATION_FAILED',
        format('결정 사항 ID는 영역.주제.규칙 세 부분이고 영어 소문자, 숫자, 하이픈만 써요. 예: app.notify.title-length (받은 값: %s)', v_id)
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
        format('결정 사항 %s을(를) 다른 사람이 방금 만들었어요. get_standard로 내용을 보고, 고칠 게 있으면 그 버전을 baseVersion으로 다시 저장해 주세요.', v_id)
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
      perform public.reject('VALIDATION_FAILED', format('결정 사항 %s은(는) 바뀐 내용이 없어서 새 버전을 만들지 않았어요.', v_id));
    end if;
    if v_from_pr then
      select count(*) into v_recent
      from public.standard_versions
      where standard_id = v_id and version >= 2 and source <> 'wiki' and created_at > now() - interval '24 hours';
      if v_recent >= 2 then
        perform public.reject(
          'CHANGE_LIMIT',
          format('결정 사항 %s은(는) 최근 24시간 안에 이미 %s번 바뀌었어요. 더 고치지 말고 사람에게 물어 주세요 (detect.safety.repeat-limit).', v_id, v_recent)
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
$function$;
