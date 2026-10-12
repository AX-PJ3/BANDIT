-- 확인할 변경을 만드는 규칙을 팀 저장소 PR #7(@sil/notify의 createPendingChecks)과 똑같이 맞춰요 (SIL-67, SIL-77).
--
-- PR #7의 규칙은 팀 위키에 notify.pending.last-seen-order로 옮겨졌어요(10/12, PR #8).
-- 20261012100000_feedback_v2.sql의 on_standard_version_saved()와 다른 점은 두 가지예요.
--
-- 1. 마지막으로 본 버전을 정하는 순서 (notify.pending.last-seen-order)
--    전: 대기 줄이 이어받은 버전 → 답한 버전과 담당자가 직접 저장한 버전 중 최신 → 바로 앞 버전
--    후: 답한 건 중 가장 높은 버전 → 열린 건이 기억하는 버전 → 바로 앞 버전 (새로 생긴 기준이면 없음)
--    담당자가 직접 저장한 버전은 더 이상 "본 버전"으로 세지 않아요.
-- 2. 담당자가 없거나(notify.pending.no-owner) 바꾼 본인이면(notify.target.skip-author) 그 이슈는 통째로 건너뛰어요.
--    전에는 열린 대기 줄을 먼저 닫고 나서 건너뛰었어요. 이제는 열린 대기 줄도 그대로 둬요.
--
-- 함수 이름과 인자는 그대로라서 save_standard, revert_standard는 다시 만들지 않아요.
-- 이미 올린 마이그레이션은 고치지 않아요.

-- 기준이 새 버전으로 저장되면(save_standard, revert_standard) 같은 트랜잭션에서 불려요.
-- 기준과 이어진 이슈마다 (이슈 번호 순서):
--   1. 담당자가 없거나 바꾼 본인이면 건너뛰어요. 바꾼 사람을 모르면(null) 건너뛰지 않아요.
--   2. 마지막으로 본 버전을 정해요 (notify.pending.last-seen-order).
--   3. 새 값이 마지막으로 본 값과 같으면 새로 만들지 않고, 열린 대기 줄은 자동 닫힘으로 닫아요 (notify.pending.close-on-revert).
--   4. 아니면 열린 대기 줄은 대체됨으로 닫고(notify.pending.merge-versions), 새 대기 줄을 만들어요.
--      답한 뒤에 값이 바뀌어도 다시 만들어요 (notify.pending.renotify-after-answer). 완료된 이슈에도 만들어요 (notify.target.include-done).
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
  v_answered integer;
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
    continue when v_issue.assignee is null;
    continue when v_issue.assignee = v_saved.changed_by;

    select * into v_open
    from public.pending_checks
    where standard_id = p_standard_id and issue_key = v_issue.key and status = 'pending'
    for update;

    select max(c.version) into v_answered
    from public.pending_checks as c
    where c.standard_id = p_standard_id and c.issue_key = v_issue.key and c.status = 'answered';

    v_seen := case
      when v_answered is not null then v_answered
      when v_open.id is not null then v_open.last_seen_version
      else nullif(p_version - 1, 0)
    end;
    v_back := exists (
      select 1 from public.standard_versions
      where standard_id = p_standard_id and version = v_seen and value = v_saved.value
    );

    if v_open.id is not null then
      update public.pending_checks
      set status = case when v_back then 'auto_closed' else 'superseded' end, closed_at = now()
      where id = v_open.id;
    end if;

    continue when v_back;

    insert into public.pending_checks (standard_id, version, issue_key, recipient, last_seen_version)
    values (p_standard_id, p_version, v_issue.key, v_issue.assignee, v_seen);
  end loop;
end;
$$;

comment on column public.pending_checks.last_seen_version is
  '마지막으로 본 버전. 답한 건 중 가장 높은 버전 → 열린 건이 기억하는 버전 → 바로 앞 버전 순서로 정해요 (notify.pending.last-seen-order). 새 값이 이 버전의 값과 같으면 만들지 않고 열린 건은 자동으로 닫아요';
