-- 저장소 v2 SQL 검사 (SIL-65 "다 됐다고 볼 조건")
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/v2.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- 하나라도 틀리면 '검사 실패: …'로 멈추고, 끝까지 가면 마지막 줄에 '저장소 v2 SQL 검사를 모두 통과했어요'가 보여요.

begin;

-- 거절 코드(hint, 없으면 SQLSTATE)를 꺼내 보는 도우미. 성공하면 'OK'
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

-- 거절 문구를 꺼내 보는 도우미. 성공하면 'OK'
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

-- 검사용 영역은 사람이 먼저 만들어 둬요. AI는 새 영역을 만들 수 없어요 (detect.change.no-new-area).
select public.save_standard(
  p_id => 'test.seed.area', p_title => '검사용 영역', p_value => '검사용 영역을 만든다', p_reason => '검사용',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human'
);

-- ---------------------------------------------------------------------------
-- A. 필수 칸은 ID, 제목, 값, 이유, 항상 적용 5개 (조건 3, 6)
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'A1 항상 적용이 비면 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.a', p_title => '제목', p_value => '값', p_reason => '이유', p_base_version => 0)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect_contains(
  'A2 빠진 칸을 한 번에 모두 알려 준다',
  pg_temp.message_of($$select public.save_standard(p_id => 'test.v2.a', p_base_version => 0)$$),
  '제목(title), 값(value), 이유(reason), 항상 적용(alwaysOn: 예/아니오)이(가) 비어 있어서'
);
select pg_temp.expect_contains(
  'A3 인자를 하나도 안 줘도 "함수 없음" 대신 빠진 칸을 알려 준다',
  pg_temp.message_of($$select public.save_standard()$$),
  'ID(id)'
);
select pg_temp.expect(
  'A4 근거와 적용 범위가 없어도 저장 (v1)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.minimal', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0)$$),
  'OK'
);
select pg_temp.expect(
  'A4 근거·적용 범위는 null, 영역은 ID 앞부분',
  (select (v.evidence is null)::text || ':' || (v.scope is null)::text || ':' || s.area
   from public.standards as s join public.standard_versions as v on v.standard_id = s.id
   where s.id = 'test.v2.minimal'),
  'true:true:test'
);
select pg_temp.expect(
  'A5 예전 위키의 근거·적용 범위(문서 포함)·출처 wiki를 그대로 저장',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'test.v2.full', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => true, p_base_version => 0,
    p_evidence => 'Linear SIL-43', p_scope => '{"code":["packages/app/src/notify/**"],"screen":["앱 알림"],"doc":["INDEX.md"]}',
    p_source => 'wiki', p_actor => 'human', p_changed_by => '팀 위키'
  )$$),
  'OK'
);
select pg_temp.expect(
  'A5 저장된 칸',
  (select v.evidence || ' | ' || (v.scope -> 'doc' ->> 0) || ' | ' || (v.scope -> 'api')::text || ' | ' || v.source || ' | ' || s.always_on
   from public.standards as s join public.standard_versions as v on v.standard_id = s.id
   where s.id = 'test.v2.full'),
  'Linear SIL-43 | INDEX.md | [] | wiki | true'
);
select pg_temp.expect(
  'A6 적용 범위 모양이 틀리면 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.badscope', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_scope => '{"code":"src"}')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A7 PR에서 찾은 변경은 근거가 없으면 거절 (detect.change.evidence)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.minimal', p_title => '제목', p_value => '새 값', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 1, p_source => 'code', p_ai_detected => true)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A7 AI가 찾았나를 저장 (PR에서 찾은 변경)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.minimal', p_title => '제목', p_value => '새 값', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 1, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #12 src/order.ts:3')$$),
  'OK'
);
select pg_temp.expect(
  'A7 v2는 AI가 찾음, v1은 아님 (목록 뷰에도 보임)',
  (select string_agg(version || ':' || ai_detected, ',' order by version) from public.standard_versions where standard_id = 'test.v2.minimal')
    || ' / ' || (select ai_detected::text from public.standards_latest where id = 'test.v2.minimal'),
  '1:false,2:true / true'
);
select pg_temp.expect(
  'A8 잠금은 AI가 정할 수 없음',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.lock', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_locked => true)$$),
  'VALIDATION_FAILED'
);
-- 주의: 저장과 확인은 문장을 나눠요. 한 문장에 두면 Postgres가 확인 쿼리를 먼저 실행할 수 있어요.
select pg_temp.expect(
  'A8 사람은 잠금 칸을 그대로 저장',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.lock', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0, p_locked => true, p_actor => 'human')$$),
  'OK'
);
select pg_temp.expect('A8 잠금이 예로 남는다', (select locked::text from public.standards where id = 'test.v2.lock'), 'true');
select pg_temp.expect(
  'A9 항상 적용만 바꿔도 새 버전',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.minimal', p_title => '제목', p_value => '새 값', p_reason => '항상 적용으로', p_always_on => true, p_base_version => 2)$$),
  'OK'
);

-- ---------------------------------------------------------------------------
-- B. 새 버전이 저장되면 같은 트랜잭션에서 on_standard_version_saved()를 불러요 (조건 9의 자리)
-- ---------------------------------------------------------------------------
create table pg_temp.saved_calls (standard_id text, version integer);
create or replace function public.on_standard_version_saved(p_standard_id text, p_version integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into pg_temp.saved_calls values (p_standard_id, p_version);
end;
$$;

select pg_temp.expect(
  'B1 저장 (v1)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.hook', p_title => '제목', p_value => '값 1', p_reason => '이유', p_always_on => false, p_base_version => 0)$$),
  'OK'
);
select pg_temp.expect('B1 저장하면 기준 ID와 새 버전으로 한 번 불린다', (select string_agg(standard_id || ' v' || version, ',') from pg_temp.saved_calls), 'test.v2.hook v1');
select public.save_standard(p_id => 'test.v2.hook', p_title => '제목', p_value => '값 2', p_reason => '이유', p_always_on => false, p_base_version => 1);
select pg_temp.expect(
  'B2 되돌리기 (v3)',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'test.v2.hook', p_to_version => 1, p_reason => '되돌림', p_base_version => 2)$$),
  'OK'
);
select pg_temp.expect(
  'B2 되돌려도 불린다',
  (select string_agg(standard_id || ' v' || version, ',' order by version) from pg_temp.saved_calls),
  'test.v2.hook v1,test.v2.hook v2,test.v2.hook v3'
);
select pg_temp.expect(
  'B3 버전 충돌로 거절',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.v2.hook', p_title => '제목', p_value => '값 3', p_reason => '이유', p_always_on => false, p_base_version => 1)$$),
  'VERSION_CONFLICT'
);
select pg_temp.expect('B3 거절된 저장에서는 불리지 않는다', (select count(*)::text from pg_temp.saved_calls), '3');

create or replace function public.on_standard_version_saved(p_standard_id text, p_version integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '알림 만들기 실패';
end;
$$;
select pg_temp.expect(
  'B4 알림 쪽이 실패하면 저장도 실패',
  pg_temp.message_of($$select public.save_standard(p_id => 'test.v2.hook', p_title => '제목', p_value => '값 4', p_reason => '이유', p_always_on => false, p_base_version => 3)$$),
  '알림 만들기 실패'
);
select pg_temp.expect(
  'B4 새 버전도 함께 취소된다 (빠짐없이)',
  (select current_version::text from public.standards where id = 'test.v2.hook')
    || ':' || (select count(*)::text from public.standard_versions where standard_id = 'test.v2.hook'),
  '3:3'
);
create or replace function public.on_standard_version_saved(p_standard_id text, p_version integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- C. 이슈와 기준 연결: save_issue (조건 1, 2)
-- ---------------------------------------------------------------------------
select pg_temp.expect_contains(
  'C1 빠진 칸을 알려 준다',
  pg_temp.message_of($$select public.save_issue(p_key => '#5')$$),
  '이슈 제목(title), 연결된 결정 사항 ID(standardIds, 1개 이상)'
);
select pg_temp.expect(
  'C2 위키에 없는 기준에는 연결하지 않음',
  pg_temp.hint_of($$select public.save_issue(p_key => '#5', p_title => '담당자에게 알리고 답 기록하기', p_standard_ids => array['test.v2.full', 'test.v2.nothing'])$$),
  'NOT_FOUND'
);
select pg_temp.expect(
  'C3 이슈 상태는 in_progress 또는 done',
  pg_temp.hint_of($$select public.save_issue(p_key => '#5', p_title => '제목', p_standard_ids => array['test.v2.full'], p_status => '진행 중')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'C4 새 이슈 저장 (기준 2개 연결)',
  (select (public.save_issue(p_key => '#5', p_title => '담당자에게 알리고 답 기록하기', p_assignee => '민수', p_standard_ids => array['test.v2.full', 'test.v2.minimal', 'test.v2.full']) ->> 'created')),
  'true'
);
select pg_temp.expect(
  'C4 연결은 겹치지 않고 2개',
  (select string_agg(standard_id, ',' order by standard_id) from public.issue_standards where issue_key = '#5'),
  'test.v2.full,test.v2.minimal'
);
select pg_temp.expect(
  'C5 같은 번호로 다시 저장하면 새로 만들지 않는다',
  (select (public.save_issue(p_key => '#5', p_title => '담당자에게 알리고 답 기록하기', p_assignee => null, p_status => 'done', p_standard_ids => array['test.v2.full']) ->> 'created')),
  'false'
);
select pg_temp.expect(
  'C5 제목·담당자·상태를 바꾸고 연결을 받은 목록과 같게 맞춘다',
  (select coalesce(assignee, '없음') || ':' || status from public.issues where key = '#5')
    || ' / ' || (select string_agg(standard_id, ',') from public.issue_standards where issue_key = '#5'),
  '없음:done / test.v2.full'
);
select public.save_issue(p_key => '#5', p_title => '담당자에게 알리고 답 기록하기', p_assignee => '민수', p_standard_ids => array['test.v2.full']);
select public.save_issue(p_key => '#7', p_title => '앱 알림과 나에게 온 변경 화면', p_assignee => '신지', p_standard_ids => array['test.v2.full']);

-- ---------------------------------------------------------------------------
-- D. 확인할 변경과 답 (조건 1). 여기서는 표 모양과 권한만 봐요 (B절에서 알림 자리를 비워 둬서 직접 넣어요).
--    확인할 변경을 만드는 규칙은 feedback_v2.test.sql, 답 저장 규칙(save_answer)은 compat.test.sql에서 봐요.
-- ---------------------------------------------------------------------------
insert into public.pending_checks (standard_id, version, issue_key, recipient)
values ('test.v2.full', 1, '#5', '민수'), ('test.v2.full', 1, '#7', '신지');
select pg_temp.expect(
  'D1 같은 기준 버전과 이슈로는 한 줄만',
  pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient) values ('test.v2.full', 1, '#5', '민수')$$),
  '23505'
);
select pg_temp.expect(
  'D2 없는 기준 버전으로는 만들 수 없음',
  pg_temp.hint_of($$insert into public.pending_checks (standard_id, version, issue_key, recipient, status, closed_at) values ('test.v2.full', 9, '#5', '민수', 'superseded', now())$$),
  '23503'
);
select pg_temp.expect(
  'D3 관계있다면 알았나가 꼭 있어야 함',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, channel, answered_by) select id, true, 'terminal', '민수' from public.pending_checks where issue_key = '#5'$$),
  '23514'
);
select pg_temp.expect(
  'D4 관계없다면 알았나는 비어 있어야 함',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, known, unaffected_reason, channel, answered_by) select id, false, true, '이유', 'app', '신지' from public.pending_checks where issue_key = '#7'$$),
  '23514'
);
insert into public.answers (pending_check_id, affected, known, channel, elapsed_seconds, answered_by)
select id, true, false, 'terminal', 42, '민수' from public.pending_checks where issue_key = '#5';
insert into public.answers (pending_check_id, affected, unaffected_reason, channel, answered_by)
select id, false, '터미널 화면만 다루는 작업이라 관계없음', 'app', '신지' from public.pending_checks where issue_key = '#7';
select pg_temp.expect(
  'D5 한 확인할 변경에는 답이 하나',
  pg_temp.hint_of($$insert into public.answers (pending_check_id, affected, known, channel, answered_by) select id, true, true, 'app', '민수' from public.pending_checks where issue_key = '#5'$$),
  '23505'
);
select pg_temp.expect(
  'D6 주 지표 "몰랐다" 개수를 답에서 바로 센다',
  (select count(*)::text from public.answers where affected and known = false),
  '1'
);

set local role anon;
select pg_temp.expect('D7 공용 키로 이슈를 읽을 수 있다', (select count(*)::text from public.issues where key in ('#5', '#7')), '2');
select pg_temp.expect('D7 공용 키로 이슈 표에 직접 쓸 수 없다', pg_temp.hint_of($$insert into public.issues (key, title) values ('#99', '직접')$$), '42501');
select pg_temp.expect('D7 공용 키로 연결을 지울 수 없다', pg_temp.hint_of($$delete from public.issue_standards$$), '42501');
select pg_temp.expect('D7 공용 키로 확인할 변경에 직접 쓸 수 없다', pg_temp.hint_of($$update public.pending_checks set status = 'answered'$$), '42501');
select pg_temp.expect('D7 공용 키로 답을 지울 수 없다', pg_temp.hint_of($$delete from public.answers$$), '42501');
select pg_temp.expect(
  'D7 공용 키로 save_issue를 부를 수 있다',
  pg_temp.hint_of($$select public.save_issue(p_key => '#12', p_title => '공용 키로 저장한 이슈', p_standard_ids => array['test.v2.full'])$$),
  'OK'
);
select pg_temp.expect('D7 공용 키로 알림 자리 함수를 직접 부를 수 없다', pg_temp.hint_of($$select public.on_standard_version_saved('test.v2.full', 1)$$), '42501');
reset role;

-- ---------------------------------------------------------------------------
-- E. 데모: 알림 제목 기준 v1 읽기 → v2 저장 → v1로 되돌리기 (조건 10, 착수 안내 "데모 예시")
-- ---------------------------------------------------------------------------
-- 예전 위키(team-wiki/앱-화면.md)에서 불러온 것과 같은 v1을 만들어요. 실제 팀 DB에서는 이미 있으면 아래 v1 저장만 거절돼요.
select pg_temp.hint_of($$select public.save_standard(
  p_id => 'app.notify.title-length', p_title => '앱 알림 제목은 40자 이하다',
  p_value => 'Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
  p_reason => '40자를 넘으면 Mac 알림 창에서 잘린다', p_always_on => false, p_base_version => 0,
  p_evidence => 'Linear SIL-43', p_scope => '{"code":["packages/app/src/notify/**"],"screen":["앱 알림"]}',
  p_source => 'wiki', p_actor => 'human', p_changed_by => '팀 위키'
)$$);

set local role anon;
select pg_temp.expect(
  'E1 v1 읽기 (공용 키)',
  (select current_version || ' | ' || title || ' | ' || value from public.standards_latest where id = 'app.notify.title-length'),
  '1 | 앱 알림 제목은 40자 이하다 | Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다'
);
select pg_temp.expect(
  'E2 v2 저장 (부건님의 에이전트가 32자 이하로)',
  pg_temp.hint_of($$select public.save_standard(
    p_id => 'app.notify.title-length', p_title => '앱 알림 제목은 32자 이하로 쓴다', p_value => '공백 포함 32자 이하',
    p_reason => 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림', p_always_on => false, p_base_version => 1,
    p_source => 'ai_chat', p_actor => 'ai', p_changed_by => '부건'
  )$$),
  'OK'
);
select pg_temp.expect(
  'E2 형식이 틀린 저장은 거절 (이유 없음)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'app.notify.title-length', p_title => '제목', p_value => '값', p_reason => ' ', p_always_on => false, p_base_version => 2)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'E3 v1로 되돌리기',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'app.notify.title-length', p_to_version => 1, p_reason => '데모 되돌리기', p_base_version => 2, p_actor => 'human', p_changed_by => '정민')$$),
  'OK'
);
select pg_temp.expect(
  'E3 v3은 v1의 값이고 "되돌림인가"가 예',
  (select version || ' | ' || value || ' | ' || is_revert || ' | ' || reverted_to_version
   from public.standard_versions where standard_id = 'app.notify.title-length' and version = 3),
  '3 | Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다 | true | 1'
);
select pg_temp.expect(
  'E4 버전 기록은 지워지지 않고 3줄',
  (select string_agg(version || ':' || changed_by, ',' order by version) from public.standard_versions where standard_id = 'app.notify.title-length'),
  '1:팀 위키,2:부건,3:정민'
);
reset role;

do $$ begin raise notice '저장소 v2 SQL 검사를 모두 통과했어요'; end $$;

rollback;
