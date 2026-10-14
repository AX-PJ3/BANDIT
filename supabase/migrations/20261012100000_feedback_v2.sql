-- 10/12 팀 피드백 중 답과 확인할 변경을 표와 함수에 맞춰요 (착수 안내 v2, SIL-65).
--
-- 1. 답: 저장하는 값은 관계, 알았나, 관계없는 이유, 답한 곳, 답한 시각이에요.
--    답한 곳은 터미널과 앱 두 곳이에요. 답 취소를 없애고 확인할 변경 하나에 답은 하나만 둬요.
--    확인에 쓴 시간(elapsed_seconds)은 비워 둬도 돼요.
-- 2. 확인할 변경: 상태는 대기, 답함, 대체됨, 자동 닫힘 네 가지예요.
--    on_standard_version_saved()가 확인할 변경을 만들어요. 마지막으로 본 버전과 값이 같아지면(되돌림) 자동으로 닫아요.
--
-- 바꾸지 않은 것 (정민님 결정, 10/12)
-- - 기준 저장 필수 칸 검사는 그대로예요. AI가 PR에서 찾은 변경은 근거가 꼭 있어야 해요 (20261009300000_always_on_per_version.sql).
-- - 이슈(번호 형식, 담당자 바뀜 옮기기, 받는 사람 없음)는 알림 기능이 생길 때까지 그대로 둬요 (20261009200000_wiki_compat.sql).
--
-- 팀 DB에 아직 답·확인할 변경이 없어서 옮길 데이터는 없어요. 이미 올린 마이그레이션은 고치지 않아요.

-- ---------------------------------------------------------------------------
-- 1. 답
-- ---------------------------------------------------------------------------

-- 답 취소 칸을 읽는 뷰를 먼저 지우고, 칸을 정리한 뒤 다시 만들어요 (7절).
drop view public.answer_records;
drop view public.affected_checks;

drop function public.cancel_answer(uuid, text, text);
drop index public.answers_one_open_per_check;

alter table public.answers
  drop constraint answers_cancel_fields,
  drop column cancelled_at,
  drop column cancelled_by,
  drop column cancel_reason,
  drop constraint answers_channel,
  add constraint answers_channel check (channel in ('terminal', 'app')),
  add constraint answers_one_per_check unique (pending_check_id);

comment on table public.answers is
  '답. 확인할 변경 하나에 하나예요. 지우거나 고치지 않아요. 주 지표 "몰랐다"는 affected and known = false인 줄을 세요.';
comment on column public.answers.channel is '답한 곳: terminal(터미널) / app(앱)';
comment on column public.answers.elapsed_seconds is '확인에 쓴 시간(초). 저장하지 않아도 돼요(null)';

-- 답은 지우거나 고칠 수 없어요. 취소 표시도 없어졌어요.
create or replace function public.guard_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    hint = 'FORBIDDEN',
    message = '답은 지우거나 고칠 수 없어요.';
end;
$$;

-- 답 저장. 바뀐 점: 답한 곳은 터미널·앱 두 곳이고, 답 취소 칸이 없어졌어요 (인자는 그대로라 권한도 그대로예요).
create or replace function public.save_answer(
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

-- ---------------------------------------------------------------------------
-- 2. 확인할 변경: 상태 네 가지, 마지막으로 본 버전
-- ---------------------------------------------------------------------------

alter table public.pending_checks
  drop constraint pending_checks_status,
  add constraint pending_checks_status check (status in ('pending', 'answered', 'superseded', 'auto_closed')),
  drop constraint pending_checks_closed_at,
  add constraint pending_checks_closed_at check ((status = 'pending') = (closed_at is null));

-- 같은 기준·같은 이슈에 대기는 하나뿐이에요. 새 버전이 오면 이전 대기는 닫혀요 (notify.pending.merge-versions).
create unique index pending_checks_one_open on public.pending_checks (standard_id, issue_key) where status = 'pending';

comment on table public.pending_checks is
  '확인할 변경. 기준 버전 1개와 이슈 1개마다 한 줄이에요 (notify.pending.one-per-issue). on_standard_version_saved()가 만들고, 지우지 않아요.';
comment on column public.pending_checks.status is
  'pending(대기) / answered(답함) / superseded(새 버전으로 대체됨) / auto_closed(자동 닫힘: 되돌려서 마지막으로 본 값과 같아짐)';
comment on column public.pending_checks.last_seen_version is
  '마지막으로 본 버전. 새 버전의 값이 이 버전의 값과 같으면 되돌림이라 자동으로 닫아요. 화면은 이 버전과 지금 버전을 비교해 보여 줘요';

-- 기준이 새 버전으로 저장되면(save_standard, revert_standard) 같은 트랜잭션에서 불려요.
-- 기준과 이어진 이슈마다:
--   1. 마지막으로 본 버전을 정해요: 대기 줄이 이어받은 버전 → 이 이슈에서 답한 버전과 담당자가 직접 저장한 버전 중 최신
--      → 바로 앞 버전
--   2. 새 버전의 값이 마지막으로 본 값과 같으면 되돌림이에요 (notify.pending.close-on-revert)
--   3. 이전 대기 줄은 닫아요: 되돌림이면 자동 닫힘, 아니면 대체됨 (notify.pending.merge-versions)
--   4. 새 대기 줄을 만들어요. 담당자가 없거나(notify.pending.no-owner, 착수 안내), 바꾼 본인이거나(notify.target.skip-author),
--      되돌림이면 만들지 않아요. 완료된 이슈에도 만들어요 (notify.target.include-done)
-- 여기서 실패하면 저장도 함께 취소돼요.
create or replace function public.on_standard_version_saved(p_standard_id text, p_version integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_saved public.standard_versions;
  v_issue record;
  v_open public.pending_checks;
  v_seen integer;
  v_back boolean;
begin
  select * into v_saved from public.standard_versions where standard_id = p_standard_id and version = p_version;

  for v_issue in
    select i.key, i.assignee
    from public.issue_standards as l
    join public.issues as i on i.key = l.issue_key
    where l.standard_id = p_standard_id
    order by i.key
  loop
    select * into v_open
    from public.pending_checks
    where standard_id = p_standard_id and issue_key = v_issue.key and status = 'pending'
    for update;

    v_seen := coalesce(
      v_open.last_seen_version,
      greatest(
        (select max(c.version) from public.pending_checks as c
         where c.standard_id = p_standard_id and c.issue_key = v_issue.key and c.status = 'answered'),
        (select max(v.version) from public.standard_versions as v
         where v.standard_id = p_standard_id and v.version < p_version and v.changed_by = v_issue.assignee)
      ),
      nullif(p_version - 1, 0)
    );
    v_back := exists (
      select 1 from public.standard_versions
      where standard_id = p_standard_id and version = v_seen and value = v_saved.value
    );

    if v_open.id is not null then
      update public.pending_checks
      set status = case when v_back then 'auto_closed' else 'superseded' end, closed_at = now()
      where id = v_open.id;
    end if;

    continue when v_issue.assignee is null;
    continue when v_issue.assignee = v_saved.changed_by;
    continue when v_back;

    insert into public.pending_checks (standard_id, version, issue_key, recipient, last_seen_version)
    values (p_standard_id, p_version, v_issue.key, v_issue.assignee, v_seen);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 읽기 뷰: 답 취소 칸을 빼고 다시 만들어요
-- ---------------------------------------------------------------------------

-- 응답 기록 (data.response.columns). `sil export`가 이 뷰로 14칸 표를 만들어요.
-- 바뀐 내용의 "이전 값"은 마지막으로 본 버전의 값, 없으면 바로 앞 버전 값이에요.
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
  a.channel
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
where a.affected;

revoke all on table public.answer_records, public.affected_checks from anon, authenticated;
grant select on table public.answer_records, public.affected_checks to anon, authenticated;
