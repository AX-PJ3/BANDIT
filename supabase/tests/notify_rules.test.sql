-- 확인할 변경 만들기 규칙 SQL 검사 (20261012200000_last_seen_order.sql)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/notify_rules.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- packages/notify/src/createPendingChecks.test.ts(팀 저장소 PR #7)의 12가지 장면을 DB 함수
-- on_standard_version_saved()로 똑같이 돌려요. 검사 이름 앞 번호가 그 테스트의 순서예요.
-- 이전 확인할 변경은 표에 직접 넣지 않고, 저장과 답으로 만들어요.

begin;

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

-- 한 기준·한 버전의 확인할 변경을 "이슈:받는 사람:마지막으로 본 버전:상태"로 이어 붙여요
create function pg_temp.checks_of(p_standard_id text, p_version integer)
returns text
language sql
as $$
  select coalesce(string_agg(issue_key || ':' || coalesce(recipient, '없음') || ':' || coalesce(last_seen_version::text, '-') || ':' || status, ', ' order by issue_key), '없음')
  from public.pending_checks
  where standard_id = p_standard_id and version = p_version;
$$;

-- 기준 v1을 사람이 만들어요 (호윤). 이슈를 아직 잇지 않아서 확인할 변경은 생기지 않아요.
create function pg_temp.create_standard(p_id text)
returns void
language sql
as $$
  select public.save_standard(
    p_id => p_id, p_title => '앱 알림 제목 길이', p_value => '공백 포함 40자 이하', p_reason => 'Mac 알림 창에서 잘림',
    p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
  );
$$;

-- 새 버전을 저장해요. p_changed_by가 바꾼 사람이에요.
create function pg_temp.save_value(p_id text, p_value text, p_changed_by text)
returns void
language sql
as $$
  select public.save_standard(
    p_id => p_id, p_title => '앱 알림 제목 길이', p_value => p_value, p_reason => '검사',
    p_always_on => false, p_base_version => (select current_version from public.standards where id = p_id),
    p_source => 'meeting', p_actor => 'human', p_changed_by => p_changed_by
  );
$$;

-- 한 기준·한 버전·한 이슈의 확인할 변경에 받는 사람이 답해요 (관계있다 · 몰랐다)
create function pg_temp.answer(p_id text, p_version integer, p_issue text)
returns void
language sql
as $$
  select public.save_answer(
    p_pending_check_id => (select id from public.pending_checks where standard_id = p_id and version = p_version and issue_key = p_issue),
    p_answered_by => (select recipient from public.pending_checks where standard_id = p_id and version = p_version and issue_key = p_issue),
    p_affected => true, p_known => false, p_channel => 'terminal'
  );
$$;

-- 착수 안내 "데모 예시: 알림 제목 길이" 이슈 다섯 개예요. 장면마다 기준을 따로 만들어요.
select pg_temp.create_standard(id)
from unnest(array[
  'test.pr7.demo', 'test.pr7.unknown-author', 'test.pr7.new', 'test.pr7.supersede', 'test.pr7.answered',
  'test.pr7.revert', 'test.pr7.revert-closed', 'test.pr7.not-last-seen', 'test.pr7.other'
]) as id;
select public.save_issue(p_key => '#5', p_title => '담당자에게 알리고 답 기록하기', p_assignee => '민수', p_standard_ids => array[
  'test.pr7.demo', 'test.pr7.supersede', 'test.pr7.answered', 'test.pr7.revert', 'test.pr7.revert-closed', 'test.pr7.not-last-seen'
]);
select public.save_issue(p_key => '#7', p_title => '앱 알림과 나에게 온 변경 화면', p_assignee => '신지', p_status => 'done', p_standard_ids => array['test.pr7.demo']);
select public.save_issue(p_key => '#9', p_title => '터미널 알림 문구', p_assignee => '부건', p_standard_ids => array['test.pr7.demo', 'test.pr7.unknown-author']);
select public.save_issue(p_key => '#11', p_title => '임시 서비스 이름 정하기', p_standard_ids => array['test.pr7.demo']);
select public.save_issue(p_key => '#13', p_title => '지표 화면', p_assignee => '신지', p_standard_ids => array['test.pr7.other']);

-- ---------------------------------------------------------------------------
-- 1~4, 12. 데모 예시: 부건님이 v2(32자)를 저장해요
-- ---------------------------------------------------------------------------
select pg_temp.save_value('test.pr7.other', '공백 포함 36자 이하', '부건');
select pg_temp.save_value('test.pr7.demo', '공백 포함 32자 이하', '부건');
select pg_temp.expect(
  '1 연결된 이슈의 담당자에게만 하나씩 만들고, 바꾼 본인(#9 부건)은 건너뛴다',
  (select string_agg(issue_key || ':' || recipient, ', ' order by issue_key) from public.pending_checks where standard_id = 'test.pr7.demo'),
  '#5:민수, #7:신지'
);
select pg_temp.expect(
  '2 만든 확인할 변경은 대기 상태이고 마지막으로 본 버전은 바로 앞 버전이다',
  pg_temp.checks_of('test.pr7.demo', 2),
  '#5:민수:1:pending, #7:신지:1:pending'
);
select pg_temp.expect(
  '3 완료된 이슈(#7)의 담당자에게도 만든다 (notify.target.include-done)',
  (select count(*)::text from public.pending_checks where standard_id = 'test.pr7.demo' and issue_key = '#7'),
  '1'
);
select pg_temp.expect(
  '4 담당자가 없는 이슈(#11)는 건너뛴다 (notify.pending.no-owner)',
  (select count(*)::text from public.pending_checks where issue_key = '#11'),
  '0'
);
select pg_temp.expect(
  '12-1 다른 기준의 확인할 변경은 건드리지 않는다',
  pg_temp.checks_of('test.pr7.other', 2),
  '#13:신지:1:pending'
);

-- ---------------------------------------------------------------------------
-- 5. 바꾼 사람을 모르면(null) 아무도 본인으로 건너뛰지 않는다
-- ---------------------------------------------------------------------------
select pg_temp.save_value('test.pr7.unknown-author', '공백 포함 32자 이하', null);
select pg_temp.expect(
  '5 바꾼 사람을 모르면(null) #9 부건에게도 만든다',
  pg_temp.checks_of('test.pr7.unknown-author', 2),
  '#9:부건:1:pending'
);

-- ---------------------------------------------------------------------------
-- 6. 새로 생긴 기준(v1)은 마지막으로 본 버전이 없다
-- ---------------------------------------------------------------------------
-- 이슈는 기준이 있어야 이을 수 있어서, 저장 흐름에서는 v1에 이어진 이슈가 없어요.
-- 그래서 이은 뒤 v1 저장 신호를 직접 다시 보내요.
select public.save_issue(p_key => '#15', p_title => '새 기준 이슈', p_assignee => '민수', p_standard_ids => array['test.pr7.new']);
select public.on_standard_version_saved('test.pr7.new', 1);
select pg_temp.expect(
  '6 새로 생긴 기준(v1)은 마지막으로 본 버전이 없다',
  pg_temp.checks_of('test.pr7.new', 1),
  '#15:민수:-:pending'
);

-- ---------------------------------------------------------------------------
-- 7. 답하기 전에 또 바뀜
-- ---------------------------------------------------------------------------
select pg_temp.save_value('test.pr7.supersede', '공백 포함 32자 이하', '부건');
select pg_temp.save_value('test.pr7.supersede', '공백 포함 30자 이하', '부건');
select pg_temp.expect(
  '7 이전 건을 대체됨으로 닫고, 새 건은 이전 건이 기억하는 마지막 본 버전을 잇는다',
  pg_temp.checks_of('test.pr7.supersede', 2) || ' / ' || pg_temp.checks_of('test.pr7.supersede', 3),
  '#5:민수:1:superseded / #5:민수:1:pending'
);

-- ---------------------------------------------------------------------------
-- 8. 답한 건이 있으면 그 버전이 마지막으로 본 버전
-- ---------------------------------------------------------------------------
select pg_temp.save_value('test.pr7.answered', '공백 포함 32자 이하', '부건');
select pg_temp.answer('test.pr7.answered', 2, '#5');
select pg_temp.save_value('test.pr7.answered', '공백 포함 30자 이하', '부건');
select pg_temp.expect(
  '8 답한 건이 있으면 그 버전이 마지막으로 본 버전이고, 답한 건은 닫지 않는다',
  pg_temp.checks_of('test.pr7.answered', 2) || ' / ' || pg_temp.checks_of('test.pr7.answered', 3),
  '#5:민수:1:answered / #5:민수:2:pending'
);

-- ---------------------------------------------------------------------------
-- 9. 되돌려서 마지막으로 본 값과 같아짐
-- ---------------------------------------------------------------------------
select pg_temp.save_value('test.pr7.revert', '공백 포함 32자 이하', '부건');
select pg_temp.save_value('test.pr7.revert', '공백 포함 40자 이하', '부건');
select pg_temp.expect(
  '9 열린 건을 자동 닫힘으로 닫고 새로 만들지 않는다 (notify.pending.close-on-revert)',
  pg_temp.checks_of('test.pr7.revert', 2) || ' / ' || pg_temp.checks_of('test.pr7.revert', 3),
  '#5:민수:1:auto_closed / 없음'
);

-- ---------------------------------------------------------------------------
-- 10. 되돌렸는데 열린 건이 없음
-- ---------------------------------------------------------------------------
-- 민수님이 v2(32자)에 답하고, 민수님이 직접 v3(30자)을 저장해요(본인이라 건너뜀).
-- 부건님이 v4를 다시 32자로 바꾸면 민수님이 마지막으로 본 값(답한 v2)과 같아요.
select pg_temp.save_value('test.pr7.revert-closed', '공백 포함 32자 이하', '부건');
select pg_temp.answer('test.pr7.revert-closed', 2, '#5');
select pg_temp.save_value('test.pr7.revert-closed', '공백 포함 30자 이하', '민수');
select pg_temp.save_value('test.pr7.revert-closed', '공백 포함 32자 이하', '부건');
select pg_temp.expect(
  '10 되돌렸는데 열린 건이 없으면 아무것도 만들지 않는다',
  (select string_agg(version || ':' || status, ', ' order by version) from public.pending_checks where standard_id = 'test.pr7.revert-closed'),
  '2:answered'
);

-- ---------------------------------------------------------------------------
-- 11. 값이 이전 버전과 같아도 마지막으로 본 값이 아니면 알린다
-- ---------------------------------------------------------------------------
-- 민수님이 v2에 답했고, v3은 다른 값, v4가 v1 값으로 돌아가요. v1은 민수님이 마지막으로 본 값이 아니에요.
select pg_temp.save_value('test.pr7.not-last-seen', '공백 포함 32자 이하', '부건');
select pg_temp.answer('test.pr7.not-last-seen', 2, '#5');
select pg_temp.save_value('test.pr7.not-last-seen', '공백 포함 30자 이하', '부건');
select pg_temp.save_value('test.pr7.not-last-seen', '공백 포함 40자 이하', '부건');
select pg_temp.expect(
  '11 v3 대기는 대체됨으로 닫고, v4 대기는 답한 v2를 마지막으로 본 버전으로 만든다',
  pg_temp.checks_of('test.pr7.not-last-seen', 3) || ' / ' || pg_temp.checks_of('test.pr7.not-last-seen', 4),
  '#5:민수:2:superseded / #5:민수:2:pending'
);
-- #7을 데모 기준에서 떼고 데모 기준 v3을 저장해요. #7은 이제 이어진 이슈가 아니에요.
select public.save_issue(p_key => '#7', p_title => '앱 알림과 나에게 온 변경 화면', p_assignee => '신지', p_status => 'done', p_standard_ids => array['test.pr7.other']);
select pg_temp.save_value('test.pr7.demo', '공백 포함 30자 이하', '부건');
select pg_temp.expect(
  '12-2 이어지지 않은 이슈의 확인할 변경은 건드리지 않는다 (#7의 v2 대기는 그대로, #5만 대체됨)',
  pg_temp.checks_of('test.pr7.demo', 2) || ' / ' || pg_temp.checks_of('test.pr7.demo', 3),
  '#5:민수:1:superseded, #7:신지:1:pending / #5:민수:1:pending'
);

do $$ begin raise notice '확인할 변경 만들기 규칙(PR #7) SQL 검사를 모두 통과했어요'; end $$;

rollback;
