-- 팀 위키 호환 SQL 검사 (20261009200000_wiki_compat.sql)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/compat.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- 검사 이름 앞의 괄호는 그 규칙이 적힌 팀 위키 기준 ID예요.

begin;

create function pg_temp.hint_of(statement text)
returns text
language plpgsql
as $$
declare
  v_hint text;
begin
  execute statement;
  return 'OK';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlstate);
end;
$$;

create function pg_temp.message_of(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return 'OK';
exception when others then
  return sqlerrm;
end;
$$;

-- 함수 결과(jsonb)를 꺼내 보는 도우미
create function pg_temp.result_of(statement text)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  execute statement into v_result;
  return v_result;
end;
$$;

create function pg_temp.expect(label text, actual text, expected text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception '검사 실패: % (기대: %, 실제: %)', label, expected, actual;
  end if;
  raise notice '✔ %', label;
end;
$$;

create function pg_temp.expect_contains(label text, actual text, part text)
returns void
language plpgsql
as $$
begin
  if actual is null or strpos(actual, part) = 0 then
    raise exception '검사 실패: % (''%''이(가) 없음, 실제: %)', label, part, actual;
  end if;
  raise notice '✔ %', label;
end;
$$;

-- 검사용 영역과 기준은 사람이 먼저 만들어 둬요.
select public.save_standard(
  p_id => 'test.compat.notice', p_title => '알림 제목 길이', p_value => '40자 이하', p_reason => '잘림',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '부건'
);

-- ---------------------------------------------------------------------------
-- A. 기준 ID와 저장 결과
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'A1 (data.standard.id-format) ID가 네 부분이면 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.too.long', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_actor => 'human', p_source => 'meeting')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A1 (data.standard.id-format) 영역에 숫자가 있으면 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test2.compat.area', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_actor => 'human', p_source => 'meeting')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A1 표에 직접 넣어도 ID 형식을 막는다',
  pg_temp.hint_of($$insert into public.standards (id, area, title, current_version) values ('test.compat.a.b', 'test', '제목', 1)$$),
  '23514'
);
select pg_temp.expect(
  'A2 (data.changelog.format) 저장 결과에 이전 값과 저장 시각이 있다',
  (select (r ->> 'previousValue') || ' | ' || (r ? 'savedAt')::text
   from pg_temp.result_of($$select public.save_standard(p_id => 'test.compat.notice', p_title => '알림 제목 길이', p_value => '32자 이하', p_reason => 'Windows에서 잘림', p_always_on => false, p_base_version => 1, p_actor => 'human', p_source => 'figma', p_changed_by => '부건')$$) as r),
  '40자 이하 | true'
);
select pg_temp.expect(
  'A2 새 기준은 이전 값이 없다',
  (select coalesce(r ->> 'previousValue', '없음')
   from pg_temp.result_of($$select public.save_standard(p_id => 'test.compat.fresh', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_actor => 'human', p_source => 'meeting')$$) as r),
  '없음'
);
select pg_temp.expect(
  'A2 되돌리기 결과에도 이전 값이 있다',
  (select (r ->> 'previousValue') || ' → v' || (r ->> 'version')
   from pg_temp.result_of($$select public.revert_standard(p_id => 'test.compat.notice', p_to_version => 1, p_reason => '회의에서 되돌림', p_base_version => 2, p_actor => 'human', p_source => 'meeting', p_changed_by => '호윤')$$) as r),
  '32자 이하 → v3'
);

-- ---------------------------------------------------------------------------
-- B. AI 안전 규칙
-- ---------------------------------------------------------------------------
select pg_temp.expect_contains(
  'B1 (detect.change.no-new-area) AI는 새 영역을 만들지 않는다',
  pg_temp.message_of($$select public.save_standard(p_id => 'brandnew.topic.rule', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0)$$),
  '새 영역은 사람이 정해요'
);
select pg_temp.expect(
  'B1 AI는 있는 기준의 영역도 새 영역으로 바꾸지 않는다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.notice', p_title => '알림 제목 길이', p_value => '30자 이하', p_reason => '이유', p_always_on => false, p_base_version => 3, p_area => '새영역')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'B1 AI는 있는 영역 안에서는 새 기준을 만든다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.by-ai', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0)$$),
  'OK'
);
select pg_temp.expect(
  'B2 (detect.change.evidence) PR에서 찾은 변경은 근거가 없으면 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.by-ai', p_title => '제목', p_value => '새 값', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 1, p_source => 'code', p_ai_detected => true)$$),
  'VALIDATION_FAILED'
);
select public.save_standard(p_id => 'test.compat.busy', p_title => '제목', p_value => '값 1', p_reason => '이유', p_always_on => false, p_base_version => 0, p_actor => 'human', p_source => 'meeting');
select public.save_standard(p_id => 'test.compat.busy', p_title => '제목', p_value => '값 2', p_reason => 'PR', p_always_on => false, p_base_version => 1, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #1 a.ts:1');
select public.save_standard(p_id => 'test.compat.busy', p_title => '제목', p_value => '값 3', p_reason => 'PR', p_always_on => false, p_base_version => 2, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #2 a.ts:2');
select pg_temp.expect(
  'B3 (detect.safety.repeat-limit) 하루에 두 번 넘게 바꾸려 하면 사람에게 넘긴다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.busy', p_title => '제목', p_value => '값 4', p_reason => 'PR', p_always_on => false, p_base_version => 3, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #3 a.ts:3')$$),
  'CHANGE_LIMIT'
);
select pg_temp.expect(
  'B3 사람이 고치는 것은 막지 않는다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.busy', p_title => '제목', p_value => '값 4', p_reason => '회의', p_always_on => false, p_base_version => 3, p_actor => 'human', p_source => 'meeting')$$),
  'OK'
);

-- ---------------------------------------------------------------------------
-- C. 충돌 보류 (detect.conflict.hold)
-- ---------------------------------------------------------------------------
-- test.compat.notice는 지금 v3이에요. 경하님의 AI가 v1을 보고 고쳤다고 해요.
select pg_temp.expect(
  'C1 오래된 버전을 보고 고치면 저장하지 않는다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.notice', p_title => '알림 제목 길이', p_value => '36자 이하', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 1, p_changed_by => '경하')$$),
  'VERSION_CONFLICT'
);
create temp table held as
select pg_temp.result_of($$select public.hold_conflict(p_id => 'test.compat.notice', p_base_version => 1, p_title => '알림 제목 길이', p_value => '36자 이하', p_reason => 'PR에서 바뀜', p_changed_by => '경하')$$) as r;
select pg_temp.expect(
  'C1 저장되지 못한 변경을 보류로 남긴다',
  (select (r ->> 'held') || ' | v' || (r ->> 'currentVersion') from held),
  'true | v3'
);
select pg_temp.expect(
  'C1 같은 사람이 같은 변경을 또 보내면 보류는 하나',
  (select (r ->> 'conflictId') from pg_temp.result_of($$select public.hold_conflict(p_id => 'test.compat.notice', p_base_version => 1, p_title => '알림 제목 길이', p_value => '36자 이하', p_reason => 'PR에서 바뀜', p_changed_by => '경하')$$) as r)
    || ' / ' || (select count(*)::text from public.conflicts where standard_id = 'test.compat.notice'),
  (select r ->> 'conflictId' from held) || ' / 1'
);
select pg_temp.expect(
  'C2 지금 버전과 내용이 같으면 충돌이 아니다',
  (select r ->> 'held' from pg_temp.result_of($$select public.hold_conflict(p_id => 'test.compat.notice', p_base_version => 1, p_title => '알림 제목 길이', p_value => '40자 이하', p_changed_by => '신지')$$) as r),
  'false'
);
select pg_temp.expect(
  'C3 지금 버전을 보고 보내면 보류하지 않고 save_standard로 안내',
  pg_temp.hint_of($$select public.hold_conflict(p_id => 'test.compat.notice', p_base_version => 3, p_title => '제목', p_value => '값')$$),
  'VALIDATION_FAILED'
);
-- 주의: 저장과 확인은 문장을 나눠요. 한 문장에 두면 Postgres가 확인 쿼리를 먼저 실행할 수 있어요.
select pg_temp.expect(
  'C4 같은 사람이 최신 버전을 보고 다시 저장한다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.compat.notice', p_title => '알림 제목 길이', p_value => '36자 이하', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 3, p_changed_by => '경하')$$),
  'OK'
);
select pg_temp.expect(
  'C4 그 사람이 남긴 보류는 정리된다',
  (select status || ':' || resolution from public.conflicts where standard_id = 'test.compat.notice'),
  'resolved:v4로 다시 저장함'
);
select public.hold_conflict(p_id => 'test.compat.notice', p_base_version => 3, p_title => '알림 제목 길이', p_value => '38자 이하', p_reason => '다른 의견', p_changed_by => '신지');
select pg_temp.expect(
  'C5 사람이 보류를 정리한다 (어떻게 정했는지 남김)',
  pg_temp.hint_of($$select public.resolve_conflict(p_conflict_id => (select id from public.conflicts where proposed_by = '신지'), p_resolution => '회의에서 36자로 정함', p_resolved_by => '호윤')$$),
  'OK'
);
select pg_temp.expect(
  'C5 정리한 보류는 다시 정리하지 않는다',
  pg_temp.hint_of($$select public.resolve_conflict(p_conflict_id => (select id from public.conflicts where proposed_by = '신지'), p_resolution => '또', p_resolved_by => '호윤')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'C6 보류 기록은 지울 수 없다',
  pg_temp.hint_of($$delete from public.conflicts$$),
  'FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- D. 답 저장 (notify.answer.*)
-- ---------------------------------------------------------------------------
-- 이슈 셋: #31 완료(민수), #32 담당자 없음, #33 진행 중(신지). 확인할 변경을 만드는 규칙은 feedback_v2.test.sql에서 보고,
-- 여기서는 답 규칙만 보려고 직접 넣어요.
select public.save_issue(p_key => '#31', p_title => '터미널 알림', p_assignee => '민수', p_status => 'done', p_standard_ids => array['test.compat.notice']);
select public.save_issue(p_key => '#32', p_title => '담당자 없는 이슈', p_standard_ids => array['test.compat.notice']);
select public.save_issue(p_key => '#33', p_title => '앱 화면', p_assignee => '신지', p_standard_ids => array['test.compat.notice']);
insert into public.pending_checks (standard_id, version, issue_key, recipient, last_seen_version)
values ('test.compat.notice', 4, '#31', '민수', 1), ('test.compat.notice', 4, '#32', null, null), ('test.compat.notice', 4, '#33', '신지', 3);

select pg_temp.expect_contains(
  'D1 빠진 칸을 한 번에 알려 준다',
  pg_temp.message_of($$select public.save_answer()$$),
  '확인할 변경(pendingCheckId), 답한 사람(answeredBy), 관계있다/관계없다(affected), 답한 곳(channel)'
);
select pg_temp.expect_contains(
  'D2 (notify.answer.two-questions) 관계있다면 알았다/몰랐다를 꼭 받는다',
  pg_temp.message_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#31'), p_answered_by => '민수', p_affected => true, p_channel => 'terminal')$$),
  '알았다/몰랐다(known)'
);
select pg_temp.expect_contains(
  'D3 (notify.answer.unrelated-reason) 관계없다면 이유를 한 줄 받는다',
  pg_temp.message_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#33'), p_answered_by => '신지', p_affected => false, p_channel => 'app')$$),
  '관계없다 이유'
);
select pg_temp.expect(
  'D4 받은 사람만 답한다',
  pg_temp.hint_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#31'), p_answered_by => '부건', p_affected => true, p_known => true, p_channel => 'app')$$),
  'FORBIDDEN'
);
select pg_temp.expect_contains(
  'D5 (notify.pending.no-owner) 담당자 없음은 답할 수 없고 담당자를 정하라고 알려 준다',
  pg_temp.message_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#32'), p_answered_by => '민수', p_affected => true, p_known => true, p_channel => 'app')$$),
  '담당자를 정하면'
);
select pg_temp.expect(
  'D6 (notify.answer.reopen-done) 완료된 이슈에 관계있다 + 다시 열기면 진행 중으로 바꾼다',
  (select (r ->> 'issueReopened') || ' | ' || (r ->> 'issueStatus')
   from pg_temp.result_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#31'), p_answered_by => '민수', p_affected => true, p_known => false, p_rework_note => '터미널 제목 자르기 다시 하기', p_channel => 'terminal', p_elapsed_seconds => 41, p_reopen_issue => true)$$) as r),
  'true | in_progress'
);
select pg_temp.expect(
  'D6 답하면 확인할 변경은 답함으로 닫힌다',
  (select status || ':' || (closed_at is not null)::text from public.pending_checks where issue_key = '#31')
    || ' / ' || (select status from public.issues where key = '#31'),
  'answered:true / in_progress'
);
select pg_temp.expect_contains(
  'D7 (notify.answer.one-place) 다른 곳에서 또 답하면 이미 답한 곳을 알려 준다',
  pg_temp.message_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#31'), p_answered_by => '민수', p_affected => true, p_known => true, p_channel => 'app')$$),
  '이미 터미널에서 답한'
);
select pg_temp.expect(
  'D7 그때 코드는 PENDING_CLOSED',
  pg_temp.hint_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#31'), p_answered_by => '민수', p_affected => true, p_known => true, p_channel => 'terminal')$$),
  'PENDING_CLOSED'
);
select pg_temp.expect_contains(
  'D8 (notify.channel.three) 답한 곳은 터미널과 앱 두 곳이다',
  pg_temp.message_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#33'), p_answered_by => '신지', p_affected => false, p_unaffected_reason => '앱 화면에는 알림 제목이 없음', p_channel => 'slack')$$),
  '답한 곳은 terminal(터미널) 또는 app(앱)이에요'
);
select pg_temp.expect(
  'D9 관계없다 + 이유 한 줄을 저장한다 (확인에 쓴 시간은 비워도 된다)',
  pg_temp.hint_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#33'), p_answered_by => '신지', p_affected => false, p_unaffected_reason => '앱 화면에는 알림 제목이 없음', p_channel => 'app')$$),
  'OK'
);
select pg_temp.expect(
  'D10 답 취소는 없다 (착수 안내 v2)',
  (select (to_regprocedure('public.cancel_answer(uuid, text, text)') is null)::text)
    || ' / ' || (select count(*)::text from information_schema.columns where table_name = 'answers' and column_name like 'cancel%'),
  'true / 0'
);
select pg_temp.expect(
  'D11 답은 서비스 키나 SQL 편집기로도 지울 수 없다',
  pg_temp.hint_of($$delete from public.answers$$),
  'FORBIDDEN'
);
select pg_temp.expect(
  'D11 답의 내용은 고칠 수 없다',
  pg_temp.hint_of($$update public.answers set known = true where answered_by = '민수'$$)
    || ' / ' || pg_temp.hint_of($$update public.answers set channel = 'terminal' where answered_by = '신지'$$),
  'FORBIDDEN / FORBIDDEN'
);
select pg_temp.expect(
  'D12 확인할 변경은 지울 수 없다',
  pg_temp.hint_of($$delete from public.pending_checks$$),
  'FORBIDDEN'
);
select pg_temp.expect(
  'D13 상태는 대기·답함·대체됨·자동 닫힘 네 가지이고, 대기에는 닫힌 시각이 없다',
  pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient, status) values ('test.compat.notice', 3, '#33', '신지', 'on_hold')$$)
    || ' / ' || pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient, status) values ('test.compat.notice', 3, '#33', '신지', 'answer_cancelled')$$)
    || ' / ' || pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient, status, closed_at) values ('test.compat.notice', 3, '#33', '신지', 'pending', now())$$),
  '23514 / 23514 / 23514'
);

-- ---------------------------------------------------------------------------
-- E. 담당자가 바뀌면 (notify.pending.owner-change)
-- ---------------------------------------------------------------------------
create temp table moved as
select '#32' as issue_key, pg_temp.result_of($$select public.save_issue(p_key => '#32', p_title => '담당자 없는 이슈', p_assignee => '경하', p_standard_ids => array['test.compat.notice'])$$) as r
union all
select '#31', pg_temp.result_of($$select public.save_issue(p_key => '#31', p_title => '터미널 알림', p_assignee => '부건', p_standard_ids => array['test.compat.notice'])$$);
select pg_temp.expect(
  'E1 담당자 없던 이슈에 담당자를 정하면 남은 확인할 변경이 그 사람에게 간다',
  (select r ->> 'movedChecks' from moved where issue_key = '#32')
    || ' / ' || (select recipient from public.pending_checks where issue_key = '#32'),
  '1 / 경하'
);
select pg_temp.expect(
  'E2 이미 답한 확인할 변경과 이전 담당자의 답은 그대로 둔다',
  (select r ->> 'movedChecks' from moved where issue_key = '#31')
    || ' / ' || (select recipient from public.pending_checks where issue_key = '#31')
    || ' / ' || (select answered_by from public.answers a join public.pending_checks c on c.id = a.pending_check_id where c.issue_key = '#31'),
  '0 / 민수 / 민수'
);
select pg_temp.expect(
  'E3 (copy.term.standard v2) 이슈 저장 문구는 "결정 사항"이라고 쓴다',
  pg_temp.message_of($$select public.save_issue(p_key => '#40', p_title => '제목', p_standard_ids => array['test.compat.nothing'])$$),
  '이슈 #40에 연결할 결정 사항 test.compat.nothing이(가) 위키에 없어요. 결정 사항을 먼저 저장하거나 ID를 확인해 주세요.'
);

-- ---------------------------------------------------------------------------
-- F. 읽기 뷰와 Realtime
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'F1 (data.response.columns) 응답 기록에 이전 값(마지막으로 본 버전)과 지금 값, 다시 할 일이 있다',
  (select previous_value || ' → ' || value || ' | ' || changed_by || ' | ' || answered_by || ' | ' || rework_note
   from public.answer_records where issue_key = '#31'),
  '40자 이하 → 36자 이하 | 경하 | 민수 | 터미널 제목 자르기 다시 하기'
);
select pg_temp.expect(
  'F2 (notify.answer.next-run-context) 관계있다고 답한 기준을 사람별로 꺼낸다',
  (select string_agg(answered_by || ':' || issue_key, ',' order by issue_key) from public.affected_checks where standard_id = 'test.compat.notice'),
  '민수:#31'
);
select pg_temp.expect(
  'F3 (app.notify.realtime) 확인할 변경은 Realtime으로 나간다',
  (select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pending_checks')::text),
  'true'
);

-- ---------------------------------------------------------------------------
-- G. 공용 키(anon) 권한
-- ---------------------------------------------------------------------------
select public.save_issue(p_key => '#41', p_title => '공용 키 검사', p_assignee => '부건', p_standard_ids => array['test.compat.notice']);
insert into public.pending_checks (standard_id, version, issue_key, recipient) values ('test.compat.notice', 4, '#41', '부건');

set local role anon;
select pg_temp.expect(
  'G1 공용 키로 답을 저장한다',
  pg_temp.hint_of($$select public.save_answer(p_pending_check_id => (select id from public.pending_checks where issue_key = '#41'), p_answered_by => '부건', p_affected => true, p_known => true, p_channel => 'app')$$),
  'OK'
);
select pg_temp.expect('G2 공용 키로 답을 직접 고칠 수 없다', pg_temp.hint_of($$update public.answers set known = false$$), '42501');
select pg_temp.expect('G2 공용 키로 보류를 직접 넣을 수 없다', pg_temp.hint_of($$insert into public.conflicts (standard_id, base_version, current_version, title, value, proposed_by_actor, source) values ('test.compat.notice', 1, 2, '제목', '값', 'ai', 'code')$$), '42501');
select pg_temp.expect('G3 공용 키로 응답 기록과 보류를 읽는다', (select (count(*) > 0)::text from public.answer_records) || ' / ' || (select (count(*) > 0)::text from public.conflicts), 'true / true');
select pg_temp.expect('G4 공용 키로 검사용 함수는 부를 수 없다', pg_temp.hint_of($$select public.guard_answers()$$), '42501');
reset role;

do $$ begin raise notice '팀 위키 호환 SQL 검사를 모두 통과했어요'; end $$;

rollback;
