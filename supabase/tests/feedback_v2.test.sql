-- 10/12 팀 피드백 SQL 검사 (20261012100000_feedback_v2.sql)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/feedback_v2.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- A~C는 피드백 1~3번 순서예요. 4번(이슈)은 알림 기능이 생길 때까지 바꾸지 않아서, D는 담당자 없는 이슈가 지금 어떻게 되는지만 봐요.

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

-- 한 버전의 확인할 변경을 "이슈:받는 사람:마지막으로 본 버전:상태"로 이어 붙여요
create function pg_temp.checks_of(p_version integer)
returns text
language sql
as $$
  select coalesce(string_agg(issue_key || ':' || recipient || ':' || coalesce(last_seen_version::text, '-') || ':' || status, ', ' order by issue_key), '없음')
  from public.pending_checks
  where standard_id = 'test.feedback.notice' and version = p_version;
$$;

-- 기준 v1은 사람이 만들어요. 이슈 넷을 연결해요.
--   #51 민수(진행 중), #52 담당자 없음, #53 부건(진행 중, v2를 저장할 사람), #54 신지(완료)
select public.save_standard(
  p_id => 'test.feedback.notice', p_title => '알림 제목 길이', p_value => '40자 이하', p_reason => 'Mac 알림 창에서 잘림',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
);
select public.save_issue(p_key => '#51', p_title => '터미널 알림', p_assignee => '민수', p_standard_ids => array['test.feedback.notice']);
select public.save_issue(p_key => '#52', p_title => '담당자 없는 이슈', p_standard_ids => array['test.feedback.notice']);
select public.save_issue(p_key => '#53', p_title => '알림 문구', p_assignee => '부건', p_standard_ids => array['test.feedback.notice']);
select public.save_issue(p_key => '#54', p_title => '앱 화면', p_assignee => '신지', p_status => 'done', p_standard_ids => array['test.feedback.notice']);

-- ---------------------------------------------------------------------------
-- B. 확인할 변경 만들기 (피드백 2: 상태 네 가지, 마지막으로 본 버전)
-- ---------------------------------------------------------------------------
select public.save_standard(
  p_id => 'test.feedback.notice', p_title => '알림 제목 길이', p_value => '32자 이하', p_reason => 'Windows 알림 창에서 잘림',
  p_always_on => false, p_base_version => 1, p_source => 'figma', p_actor => 'human', p_changed_by => '부건'
);
select pg_temp.expect(
  'B1 새 버전이 저장되면 이슈마다 대기를 만들고, 마지막으로 본 버전은 바로 앞 버전 (#52 담당자 없음, #53 바꾼 본인은 건너뜀)',
  pg_temp.checks_of(2),
  '#51:민수:1:pending, #54:신지:1:pending'
);

select public.save_standard(
  p_id => 'test.feedback.notice', p_title => '알림 제목 길이', p_value => '36자 이하', p_reason => '두 운영체제의 중간값',
  p_always_on => false, p_base_version => 2, p_source => 'meeting', p_actor => 'human', p_changed_by => '경하'
);
select pg_temp.expect(
  'B2 또 바뀌면 이전 대기는 대체됨으로 닫힌다 (notify.pending.merge-versions)',
  pg_temp.checks_of(2),
  '#51:민수:1:superseded, #54:신지:1:superseded'
);
select pg_temp.expect(
  'B2 새 대기는 마지막으로 본 버전을 이어받는다 (#53은 열린 건도 답한 건도 없어서 바로 앞 버전 v2)',
  pg_temp.checks_of(3),
  '#51:민수:1:pending, #53:부건:2:pending, #54:신지:1:pending'
);
select pg_temp.expect(
  'B2 닫힌 줄에만 닫힌 시각이 있다',
  (select string_agg(status || ':' || closed::text, ',' order by status)
   from (select distinct status, closed_at is not null as closed from public.pending_checks where standard_id = 'test.feedback.notice') as t),
  'pending:false,superseded:true'
);

select public.save_answer(
  p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.feedback.notice' and version = 3 and issue_key = '#51'),
  p_answered_by => '민수', p_affected => true, p_known => false, p_channel => 'terminal'
);

-- v1로 되돌려요. 신지님은 v1을 마지막으로 봤고, 민수님은 v3에 답했고, 부건님은 v2를 봤어요.
select public.revert_standard(
  p_id => 'test.feedback.notice', p_to_version => 1, p_reason => '회의에서 되돌림', p_base_version => 3,
  p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
);
select pg_temp.expect(
  'B3 되돌려서 마지막으로 본 값과 같아지면 자동 닫힘, 아니면 대체됨 (notify.pending.close-on-revert)',
  pg_temp.checks_of(3),
  '#51:민수:1:answered, #53:부건:2:superseded, #54:신지:1:auto_closed'
);
select pg_temp.expect(
  'B3 자동 닫힌 사람에게는 새 대기가 없고, 답한 사람은 답한 버전이 마지막으로 본 버전',
  pg_temp.checks_of(4),
  '#51:민수:3:pending, #53:부건:2:pending'
);
select pg_temp.expect_contains(
  'B4 자동 닫힌 확인할 변경에는 답하지 않아도 된다',
  pg_temp.message_of($$select public.save_answer(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.feedback.notice' and version = 3 and issue_key = '#54'),
    p_answered_by => '신지', p_affected => true, p_known => true, p_channel => 'app'
  )$$),
  '자동으로 닫혔어요'
);
select pg_temp.expect(
  'B5 같은 기준·이슈에 대기는 하나뿐',
  pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient) values ('test.feedback.notice', 1, '#51', '민수')$$),
  '23505'
);
select pg_temp.expect(
  'B6 상태는 네 가지 (답 취소 없음)',
  pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient, status) values ('test.feedback.notice', 1, '#54', '신지', 'answer_cancelled')$$),
  '23514'
);

-- ---------------------------------------------------------------------------
-- A. 답 (피드백 1: 관계, 알았나, 관계없는 이유, 답한 곳, 답한 시각)
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'A1 관계없다 + 이유를 앱에서 저장한다 (확인에 쓴 시간은 비워도 된다)',
  pg_temp.hint_of($$select public.save_answer(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#53'),
    p_answered_by => '부건', p_affected => false, p_unaffected_reason => '문구만 다루는 작업이라 관계없음', p_channel => 'app'
  )$$),
  'OK'
);
select pg_temp.expect(
  'A1 저장 값: 관계 / 알았나 / 관계없는 이유 / 답한 곳 / 답한 시각',
  (select string_agg(
     case when a.affected then '관계있다' else '관계없다' end
       || ':' || case a.known when true then '알았다' when false then '몰랐다' else '-' end
       || ':' || coalesce(a.unaffected_reason, '-')
       || ':' || a.channel
       || ':' || (a.answered_at is not null)::text
       || ':' || coalesce(a.elapsed_seconds::text, '-'),
     ', ' order by c.issue_key)
   from public.answers as a join public.pending_checks as c on c.id = a.pending_check_id
   where c.standard_id = 'test.feedback.notice'),
  '관계있다:몰랐다:-:terminal:true:-, 관계없다:-:문구만 다루는 작업이라 관계없음:app:true:-'
);
select pg_temp.expect(
  'A2 "몰랐다" 지표는 관계있다 and 몰랐다인 답을 센다',
  (select count(*)::text from public.answers as a join public.pending_checks as c on c.id = a.pending_check_id
   where c.standard_id = 'test.feedback.notice' and a.affected and a.known = false),
  '1'
);
select pg_temp.expect(
  'A3 답한 곳은 터미널과 앱뿐 (slack 거절)',
  pg_temp.hint_of($$select public.save_answer(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#51'),
    p_answered_by => '민수', p_affected => true, p_known => true, p_channel => 'slack'
  )$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A3 표에 직접 넣어도 slack은 막는다',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, known, channel, answered_by)
    select id, true, true, 'slack', '민수' from public.pending_checks
    where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#51'$$),
  '23514'
);
select pg_temp.expect(
  'A4 관계없다면 알았나는 비어 있어야 한다',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, known, unaffected_reason, channel, answered_by)
    select id, false, false, '이유', 'app', '민수' from public.pending_checks
    where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#51'$$),
  '23514'
);
select pg_temp.expect(
  'A5 답 하나뿐: 같은 확인할 변경에 두 번째 답은 넣을 수 없다',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, unaffected_reason, channel, answered_by)
    select id, false, '또', 'terminal', '부건' from public.pending_checks
    where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#53'$$),
  '23505'
);

-- ---------------------------------------------------------------------------
-- C. 기준 저장 필수 칸 (피드백 3: ID, 제목, 값, 이유, 항상 적용 5개. 근거는 선택이고, PR에서 찾은 변경만 근거가 꼭 있어야 해요)
-- ---------------------------------------------------------------------------
select pg_temp.expect_contains(
  'C1 필수 칸 5개가 빠지면 한 번에 알려 준다',
  pg_temp.message_of($$select public.save_standard(p_base_version => 0)$$),
  'ID(id), 제목(title), 값(value), 이유(reason), 항상 적용(alwaysOn: 예/아니오)이(가) 비어 있어서'
);
select pg_temp.expect(
  'C2 (detect.change.evidence) AI가 PR에서 찾은 변경은 근거가 없으면 거절',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'test.feedback.by-ai', p_title => '제목', p_value => '값', p_reason => 'PR #12에서 바뀜',
    p_always_on => false, p_base_version => 0, p_source => 'code', p_ai_detected => true
  )$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'C3 근거를 넣으면 저장한다',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'test.feedback.by-ai', p_title => '제목', p_value => '값', p_reason => 'PR #12에서 바뀜',
    p_always_on => false, p_base_version => 0, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #12 a.ts:3'
  )$$),
  'OK'
);
select pg_temp.expect(
  'C4 PR에서 찾은 변경이 아니면 근거 없이 저장한다',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'test.feedback.by-ai', p_title => '제목', p_value => '새 값', p_reason => '대화에서 정함',
    p_always_on => false, p_base_version => 1
  )$$),
  'OK'
);
select pg_temp.expect(
  'C4 근거는 v1 있음, v2 비어 있음',
  (select string_agg(version || ':' || coalesce(evidence, '없음'), ',' order by version) from public.standard_versions where standard_id = 'test.feedback.by-ai'),
  '1:PR #12 a.ts:3,2:없음'
);

-- ---------------------------------------------------------------------------
-- D. 담당자 없는 이슈 (4번은 그대로: 만들 때는 건너뛰고, 담당자를 비우면 대기를 받는 사람 없음으로 옮겨요)
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'D2 담당자가 빈 이슈에는 확인할 변경이 하나도 없다',
  (select coalesce(assignee, '없음') from public.issues where key = '#52')
    || ' / ' || (select count(*)::text from public.pending_checks where issue_key = '#52'),
  '없음 / 0'
);
create temp table cleared as
select public.save_issue(p_key => '#51', p_title => '터미널 알림', p_standard_ids => array['test.feedback.notice']) as r;
select pg_temp.expect(
  'D3 (notify.pending.owner-change) 담당자를 비우면 대기는 받는 사람 없음으로 옮겨진다',
  (select r ->> 'movedChecks' from cleared)
    || ' / ' ||(select coalesce(recipient, '없음') || ':' || status from public.pending_checks where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#51'),
  '1 / 없음:pending'
);
select public.save_standard(
  p_id => 'test.feedback.notice', p_title => '알림 제목 길이', p_value => '30자 이하', p_reason => '모바일 알림까지 생각함',
  p_always_on => false, p_base_version => 4, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
);
select pg_temp.expect(
  'D3 담당자가 빈 이슈는 통째로 건너뛴다: 이전 대기도 그대로 두고 새 대기는 만들지 않는다 (PR #7과 같음)',
  (select status from public.pending_checks where standard_id = 'test.feedback.notice' and version = 4 and issue_key = '#51')
    || ' / ' || pg_temp.checks_of(5),
  'pending / #53:부건:4:pending, #54:신지:4:pending'
);

-- ---------------------------------------------------------------------------
-- E. 공용 키(anon)로 저장해도 같은 흐름
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.expect(
  'E1 공용 키로 저장해도 확인할 변경이 생긴다',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'test.feedback.notice', p_title => '알림 제목 길이', p_value => '28자 이하', p_reason => '공용 키 검사',
    p_always_on => false, p_base_version => 5, p_source => 'ai_chat', p_actor => 'ai', p_changed_by => '경하'
  )$$)
    || ' / ' || pg_temp.checks_of(6),
  'OK / #53:부건:4:pending, #54:신지:4:pending'
);
reset role;

-- ---------------------------------------------------------------------------
-- F. 담당자가 직접 저장한 버전 (notify.pending.last-seen-order, PR #7과 같음)
-- ---------------------------------------------------------------------------
-- 경하님이 v2(36자)를 저장해 부건님에게 대기가 생겨요. 부건님이 답하기 전에 직접 v3(32자)을 저장해요.
select public.save_standard(p_id => 'test.feedback.own', p_title => '제목', p_value => '40자', p_reason => '이유', p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤');
select public.save_issue(p_key => '#61', p_title => '알림 문구', p_assignee => '부건', p_standard_ids => array['test.feedback.own']);
select public.save_standard(p_id => 'test.feedback.own', p_title => '제목', p_value => '36자', p_reason => '이유', p_always_on => false, p_base_version => 1, p_source => 'meeting', p_actor => 'human', p_changed_by => '경하');
select public.save_standard(p_id => 'test.feedback.own', p_title => '제목', p_value => '32자', p_reason => '이유', p_always_on => false, p_base_version => 2, p_source => 'meeting', p_actor => 'human', p_changed_by => '부건');
select pg_temp.expect(
  'F1 바꾼 본인이면 열린 대기도 그대로 두고 새 대기는 만들지 않는다',
  (select string_agg(version || ':' || last_seen_version || ':' || status, ', ' order by version) from public.pending_checks where standard_id = 'test.feedback.own'),
  '2:1:pending'
);
-- 부건님이 v2에 답한 뒤 경하님이 v4를 다시 36자로 바꿔요.
-- 마지막으로 본 버전은 답한 v2예요. 직접 저장한 v3은 세지 않아서, v2와 같은 값인 v4는 알리지 않아요.
select public.save_answer(p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.feedback.own' and version = 2), p_answered_by => '부건', p_affected => true, p_known => true, p_channel => 'app');
select public.save_standard(p_id => 'test.feedback.own', p_title => '제목', p_value => '36자', p_reason => '이유', p_always_on => false, p_base_version => 3, p_source => 'meeting', p_actor => 'human', p_changed_by => '경하');
select pg_temp.expect(
  'F2 직접 저장한 버전은 마지막으로 본 버전으로 세지 않는다: 답한 v2와 값이 같은 v4는 새 대기 없음',
  (select string_agg(version || ':' || status, ', ' order by version) from public.pending_checks where standard_id = 'test.feedback.own'),
  '2:answered'
);

do $$ begin raise notice '팀 피드백 SQL 검사를 모두 통과했어요'; end $$;

rollback;
