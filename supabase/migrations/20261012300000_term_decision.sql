-- 사람에게 보이는 안내 문구의 "기준"을 "결정 사항"으로 바꿔요 (copy.term.standard v2, 팀 저장소 PR #11, SIL-83).
--
-- 팀 위키가 위키의 항목 하나를 "결정 사항"이라고 부르기로 했어요(적용 범위: 화면 전체).
-- 저장 함수가 돌려주는 거절 문구는 MCP 도구 결과로 그대로 사람에게 보여서 함께 바꿔요.
-- 함수 이름, 인자, 동작은 그대로예요. 아래 정의는 이전 마이그레이션까지 올린 DB에서 pg_get_functiondef로 꺼낸 것이고,
-- 문자열 안의 낱말만 바꿨어요. 코드 이름(standard, standards 표 등)과 주석은 그대로 둬요.
-- 이미 올린 마이그레이션은 고치지 않아요.

-- check_always_on_room(p_id text)
CREATE OR REPLACE FUNCTION public.check_always_on_room(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  -- 두 사람이 동시에 11번째를 넣지 못하게 잠깐 줄을 세워요.
  perform pg_advisory_xact_lock(hashtext('sil.always_on'));
  select count(*) into v_count
  from public.standards
  where always_on and status = 'active' and id <> p_id;
  if v_count >= 10 then
    perform public.reject(
      'ALWAYS_ON_LIMIT',
      format('항상 적용되는 결정 사항은 10개까지예요 (지금 %s개). 하나를 항상 적용에서 빼거나, 필요할 때 꺼내 읽는 결정 사항으로 저장해 주세요.', v_count)
    );
  end if;
end;
$function$;

-- check_editable(p_current standards, p_base_version integer, p_actor text)
CREATE OR REPLACE FUNCTION public.check_editable(p_current standards, p_base_version integer, p_actor text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_current.status = 'deprecated' then
    perform public.reject(
      'VALIDATION_FAILED',
      format(
        '결정 사항 %s은(는) 폐기됐어요%s. 폐기된 결정 사항은 고칠 수 없어요.',
        p_current.id,
        case when p_current.replaced_by is not null then format(' (대신 %s을(를) 써요)', p_current.replaced_by) else '' end
      )
    );
  end if;
  if p_current.locked and p_actor = 'ai' then
    perform public.reject(
      'STANDARD_LOCKED',
      format('결정 사항 %s은(는) 사람이 잠가 두어서 AI가 고칠 수 없어요. 바꿔야 한다면 사람에게 알려 주세요.', p_current.id)
    );
  end if;
  if p_base_version is distinct from p_current.current_version then
    perform public.reject(
      'VERSION_CONFLICT',
      format(
        '결정 사항 %s은(는) 그사이 v%s이(가) 됐어요 (보고 고친 버전은 v%s). get_standard로 최신 내용을 다시 보고, 사람에게 확인한 뒤 baseVersion %s로 다시 저장해 주세요.',
        p_current.id, p_current.current_version, coalesce(p_base_version::text, '없음'), p_current.current_version
      )
    );
  end if;
end;
$function$;

-- deprecate_standard(p_id text, p_reason text, p_base_version integer, p_replaced_by text, p_actor text, p_changed_by text)
CREATE OR REPLACE FUNCTION public.deprecate_standard(p_id text, p_reason text, p_base_version integer, p_replaced_by text DEFAULT NULL::text, p_actor text DEFAULT 'ai'::text, p_changed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current public.standards;
  v_replacement public.standards;
begin
  if nullif(btrim(p_reason), '') is null then
    perform public.reject('VALIDATION_FAILED', '폐기하는 이유(reason)가 비어 있어서 폐기하지 않았어요. 사람에게 이유를 물어본 뒤 다시 해 주세요.');
  end if;
  perform public.check_actor_and_source(p_actor, 'ai_chat');

  select * into v_current from public.standards where id = p_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('결정 사항 %s이(가) 없어요. search_standards로 ID를 먼저 확인해 주세요.', p_id));
  end if;
  perform public.check_editable(v_current, p_base_version, p_actor);

  if p_replaced_by is not null then
    select * into v_replacement from public.standards where id = p_replaced_by;
    if not found or v_replacement.status <> 'active' or p_replaced_by = p_id then
      perform public.reject(
        'VALIDATION_FAILED',
        format('대체할 결정 사항 %s이(가) 없거나 이미 폐기됐어요. 대체 결정 사항을 먼저 저장하거나 비워 두세요.', p_replaced_by)
      );
    end if;
  end if;

  update public.standards
  set
    status = 'deprecated',
    replaced_by = p_replaced_by,
    always_on = false,
    deprecated_reason = btrim(p_reason),
    deprecated_by = nullif(btrim(p_changed_by), ''),
    deprecated_at = now(),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object('standardId', p_id, 'status', 'deprecated', 'replacedBy', p_replaced_by);
end;
$function$;

-- forbid_change()
CREATE OR REPLACE FUNCTION public.forbid_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception using
    errcode = 'P0001',
    hint = 'FORBIDDEN',
    message = format(
      '%s 표는 %s 수 없어요. 결정 사항은 지우지 않고 폐기(deprecate_standard)로 바꾸고, 바뀐 내용은 새 버전으로 쌓아요.',
      tg_table_name,
      case tg_op when 'UPDATE' then '고칠' when 'DELETE' then '지울' else '비울' end
    );
end;
$function$;

-- hold_conflict(p_id text, p_base_version integer, p_title text, p_value text, p_reason text, p_evidence text, p_scope jsonb, p_source text, p_actor text, p_changed_by text, p_ai_detected boolean)
CREATE OR REPLACE FUNCTION public.hold_conflict(p_id text DEFAULT NULL::text, p_base_version integer DEFAULT NULL::integer, p_title text DEFAULT NULL::text, p_value text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_evidence text DEFAULT NULL::text, p_scope jsonb DEFAULT NULL::jsonb, p_source text DEFAULT 'ai_chat'::text, p_actor text DEFAULT 'ai'::text, p_changed_by text DEFAULT NULL::text, p_ai_detected boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform public.reject('NOT_FOUND', format('결정 사항 %s이(가) 없어요.', p_id));
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
$function$;

-- revert_standard(p_id text, p_to_version integer, p_reason text, p_base_version integer, p_evidence text, p_source text, p_actor text, p_changed_by text)
CREATE OR REPLACE FUNCTION public.revert_standard(p_id text, p_to_version integer, p_reason text, p_base_version integer, p_evidence text DEFAULT NULL::text, p_source text DEFAULT 'ai_chat'::text, p_actor text DEFAULT 'ai'::text, p_changed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform public.reject('NOT_FOUND', format('결정 사항 %s이(가) 없어요. search_standards로 ID를 먼저 확인해 주세요.', p_id));
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
    perform public.reject('VALIDATION_FAILED', format('결정 사항 %s은(는) 지금 내용이 이미 v%s과 같아요.', p_id, p_to_version));
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
$function$;

-- save_answer(p_pending_check_id uuid, p_answered_by text, p_affected boolean, p_known boolean, p_unaffected_reason text, p_rework_note text, p_channel text, p_elapsed_seconds integer, p_reopen_issue boolean)
CREATE OR REPLACE FUNCTION public.save_answer(p_pending_check_id uuid DEFAULT NULL::uuid, p_answered_by text DEFAULT NULL::text, p_affected boolean DEFAULT NULL::boolean, p_known boolean DEFAULT NULL::boolean, p_unaffected_reason text DEFAULT NULL::text, p_rework_note text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_elapsed_seconds integer DEFAULT NULL::integer, p_reopen_issue boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_channel not in ('terminal', 'app') then
    perform public.reject('VALIDATION_FAILED', format('답한 곳은 terminal(터미널) 또는 app(앱)이에요 (받은 값: %s).', v_channel));
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
    select * into v_previous from public.answers where pending_check_id = v_check.id;
    perform public.reject(
      'PENDING_CLOSED',
      format(
        '이미 %s에서 답한 확인할 변경이에요. 다시 답하지 않아도 돼요.',
        case v_previous.channel when 'terminal' then '터미널' when 'app' then '앱' else '다른 곳' end
      )
    );
  elsif v_check.status = 'superseded' then
    perform public.reject('PENDING_CLOSED', '같은 결정 사항이 또 바뀌어서 최신 확인할 변경으로 합쳐졌어요. 최신 확인할 변경에 답해 주세요.');
  elsif v_check.status = 'auto_closed' then
    perform public.reject('PENDING_CLOSED', '결정 사항이 마지막으로 확인한 값으로 되돌아가서 자동으로 닫혔어요. 답하지 않아도 돼요.');
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
$function$;

-- save_issue(p_key text, p_title text, p_standard_ids text[], p_assignee text, p_status text)
CREATE OR REPLACE FUNCTION public.save_issue(p_key text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_standard_ids text[] DEFAULT NULL::text[], p_assignee text DEFAULT NULL::text, p_status text DEFAULT 'in_progress'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_ids is null then v_missing := array_append(v_missing, '연결된 결정 사항 ID(standardIds, 1개 이상)'); end if;
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
      format('이슈 %s에 연결할 결정 사항 %s이(가) 위키에 없어요. 결정 사항을 먼저 저장하거나 ID를 확인해 주세요.', v_key, array_to_string(v_unknown, ', '))
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
$function$;

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
    if v_ai_detected then
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
