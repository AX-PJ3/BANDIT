-- 반영함 표시 SQL 검사 (20261012400000_reflected.sql, data.pending.reflected, notify.check.reflected)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/reflected.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.

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
  return case when sqlstate = 'P0001' then coalesce(nullif(v_hint, ''), sqlstate) else sqlstate end;
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

-- 확인할 변경의 "상태:반영함:시각 있음"
create function pg_temp.state_of(p_issue text)
returns text
language sql
as $$
  select status || ':' || reflected || ':' || (reflected_at is not null)
  from public.pending_checks
  where standard_id = 'test.reflected.notice' and issue_key = p_issue
  order by version desc
  limit 1;
$$;

-- 결정 사항 v1(호윤) → 이슈 #71 민수(완료), #72 신지 → v2(부건)로 두 사람에게 확인할 변경이 생겨요
select public.save_standard(
  p_id => 'test.reflected.notice', p_title => '알림 제목 길이', p_value => '40자 이하', p_reason => 'Mac 알림 창에서 잘림',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
);
select public.save_issue(p_key => '#71', p_title => '터미널 알림', p_assignee => '민수', p_status => 'done', p_standard_ids => array['test.reflected.notice']);
select public.save_issue(p_key => '#72', p_title => '앱 화면', p_assignee => '신지', p_standard_ids => array['test.reflected.notice']);
select public.save_standard(
  p_id => 'test.reflected.notice', p_title => '알림 제목 길이', p_value => '32자 이하', p_reason => '운영체제 알림 창 기준',
  p_always_on => false, p_base_version => 1, p_source => 'meeting', p_actor => 'human', p_changed_by => '부건'
);

select pg_temp.expect('A1 새 확인할 변경은 반영함이 꺼져 있다', pg_temp.state_of('#71') || ' / ' || pg_temp.state_of('#72'), 'pending:false:false / pending:false:false');
select pg_temp.expect(
  'A2 답하기 전에는 반영함을 켤 수 없다',
  pg_temp.hint_of($$select public.save_reflected(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
    p_marked_by => '민수', p_reflected => true)$$),
  'VALIDATION_FAILED'
);

select public.save_answer(
  p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
  p_answered_by => '민수', p_affected => true, p_known => false, p_channel => 'terminal'
);

select pg_temp.expect(
  'A3 받은 사람이 아니면 켤 수 없다',
  pg_temp.hint_of($$select public.save_reflected(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
    p_marked_by => '신지', p_reflected => true)$$),
  'FORBIDDEN'
);
select pg_temp.expect(
  'A4 빠진 칸이 있으면 저장하지 않는다',
  pg_temp.hint_of($$select public.save_reflected(p_marked_by => '민수')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'A5 없는 확인할 변경',
  pg_temp.hint_of($$select public.save_reflected(p_pending_check_id => gen_random_uuid(), p_marked_by => '민수', p_reflected => true)$$),
  'NOT_FOUND'
);

-- 공용 키로 켜요
set local role anon;
select pg_temp.expect(
  'B1 답한 뒤 받은 사람은 공용 키로 반영함을 켠다',
  pg_temp.hint_of($$select public.save_reflected(
    p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
    p_marked_by => '민수', p_reflected => true)$$),
  'OK'
);
select pg_temp.expect(
  'B2 공용 키로 칸을 직접 고칠 수는 없다',
  pg_temp.hint_of($$update public.pending_checks set reflected = false$$),
  '42501'
);
reset role;

select pg_temp.expect('B3 켜면 반영한 시각이 생긴다', pg_temp.state_of('#71'), 'answered:true:true');

create temp table first_mark as
select reflected_at from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71';
select public.save_reflected(
  p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
  p_marked_by => '민수', p_reflected => true
);
select pg_temp.expect(
  'B4 다시 켜도 처음 표시한 시각을 그대로 둔다',
  ((select reflected_at from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71')
    = (select reflected_at from first_mark))::text,
  'true'
);

select public.save_reflected(
  p_pending_check_id => (select id from public.pending_checks where standard_id = 'test.reflected.notice' and issue_key = '#71'),
  p_marked_by => '민수', p_reflected => false
);
select pg_temp.expect(
  'C1 표시를 풀면 시각도 지우고, 완료된 이슈를 다시 열지 않는다 (notify.check.reflected)',
  pg_temp.state_of('#71') || ' / ' || (select status from public.issues where key = '#71'),
  'answered:false:false / done'
);
select pg_temp.expect(
  'C2 반영함과 반영한 시각은 함께 있거나 함께 없다',
  pg_temp.hint_of($$update public.pending_checks set reflected = true where issue_key = '#72' and standard_id = 'test.reflected.notice'$$),
  '23514'
);

do $$ begin raise notice '반영함 표시 SQL 검사를 모두 통과했어요'; end $$;

rollback;
