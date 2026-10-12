-- 위키 SQL 규칙 검사 (SIL-18 삭제 막기, SIL-19 형식 검사·잠금·되돌리기, SIL-15 동시 수정)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/wiki.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- 하나라도 틀리면 '검사 실패: …'로 멈추고, 끝까지 가면 마지막 줄에 '위키 SQL 검사를 모두 통과했어요'가 보여요.

begin;

-- 거절 코드(hint)를 꺼내 보는 도우미. 성공하면 'OK'
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

create function pg_temp.save(
  p_id text, p_value text, p_base integer,
  p_reason text default '이유', p_scope jsonb default '{"code":["src/**"]}', p_actor text default 'ai',
  p_always_on boolean default false, p_title text default null
)
returns text
language sql
as $$
  select pg_temp.hint_of(format(
    'select public.save_standard(p_id => %L, p_area => %L, p_title => %L, p_value => %L, p_reason => %L, p_evidence => %L, p_scope => %L::jsonb, p_base_version => %s, p_actor => %L, p_always_on => %L)',
    p_id, '테스트', coalesce(p_title, p_value || ' (제목)'), p_value, p_reason, '근거', p_scope, p_base, p_actor, p_always_on
  ));
$$;

-- 검사용 영역은 사람이 먼저 만들어 둬요. AI는 새 영역을 만들 수 없어요 (detect.change.no-new-area).
select public.save_standard(
  p_id => 'test.seed.area', p_title => '검사용 영역', p_value => '검사용 영역을 만든다', p_reason => '검사용',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human'
);
select public.save_standard(
  p_id => 'test.seed.korean-area', p_area => '테스트', p_title => '검사용 영역', p_value => '검사용 영역을 만든다',
  p_reason => '검사용', p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human'
);

-- ---------------------------------------------------------------------------
-- A. 공용 키(anon)는 읽기와 저장 함수만 (SIL-18)
-- ---------------------------------------------------------------------------
set local role anon;

do $$
begin
  begin
    delete from public.standards;
    raise exception '검사 실패: 공용 키로 기준을 지울 수 있어요';
  exception when insufficient_privilege then raise notice '✔ A1 공용 키로는 기준을 지울 수 없다';
  end;
  begin
    delete from public.standard_versions;
    raise exception '검사 실패: 공용 키로 기준 버전을 지울 수 있어요';
  exception when insufficient_privilege then raise notice '✔ A2 공용 키로는 기준 버전을 지울 수 없다';
  end;
  begin
    insert into public.standards (id, area, title, current_version) values ('test.sql.direct', '테스트', '직접', 1);
    raise exception '검사 실패: 공용 키로 표에 직접 쓸 수 있어요 (형식 검사를 건너뜀)';
  exception when insufficient_privilege then raise notice '✔ A3 공용 키로는 표에 직접 쓸 수 없다';
  end;
  begin
    update public.standards set locked = false;
    raise exception '검사 실패: 공용 키로 잠금을 풀 수 있어요';
  exception when insufficient_privilege then raise notice '✔ A4 공용 키로는 잠금을 풀 수 없다';
  end;
  begin
    perform public.reject('VALIDATION_FAILED', 'x');
    raise exception '검사 실패: 공용 키로 내부 함수를 부를 수 있어요';
  exception when insufficient_privilege then raise notice '✔ A5 공용 키로는 내부 검사 함수를 부를 수 없다';
  end;
  perform count(*) from public.standards_latest;
  raise notice '✔ A6 공용 키로 목록(standards_latest)을 읽을 수 있다';
  perform public.save_standard(
    p_id => 'test.sql.anon', p_area => '테스트', p_title => '공용 키 저장', p_value => '공용 키로 저장한 값',
    p_reason => '이유', p_evidence => '근거', p_scope => '{"code":["src/**"]}', p_base_version => 0,
    p_always_on => false
  );
  raise notice '✔ A7 공용 키로 save_standard를 부를 수 있다';
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- B. save_standard: 형식 검사, 버전 충돌, 되돌림 표시, 잠금
-- ---------------------------------------------------------------------------
select pg_temp.expect('B1 이유가 비면 거절', pg_temp.save('test.sql.coupon', '값', 0, p_reason => '  '), 'VALIDATION_FAILED');
-- B2·B5는 v2(SIL-65)에서 바뀌었어요: 적용 범위는 비어도 저장하고, 영역은 비우면 ID 앞부분으로 정해요.
select pg_temp.expect('B2 적용 범위가 비면 없는 것(null)으로 저장', pg_temp.save('test.sql.noscope', '값', 0, p_scope => '{}'), 'OK');
select pg_temp.expect('B2 적용 범위 칸이 null로 남는다', (select (scope is null)::text from public.standard_versions where standard_id = 'test.sql.noscope'), 'true');
select pg_temp.expect('B3 적용 범위에 모르는 칸이 있으면 거절', pg_temp.save('test.sql.coupon', '값', 0, p_scope => '{"files":["a"]}'), 'VALIDATION_FAILED');
select pg_temp.expect('B4 ID 모양이 틀리면 거절', pg_temp.save('Test.Coupon', '값', 0), 'VALIDATION_FAILED');
select pg_temp.expect(
  'B5 새 기준에 영역이 없으면 ID 앞부분으로 저장',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.sql.noarea', p_title => '제목', p_value => '값', p_reason => '이유', p_always_on => false, p_base_version => 0)$$),
  'OK'
);
select pg_temp.expect('B5 영역은 test', (select area from public.standards where id = 'test.sql.noarea'), 'test');
select pg_temp.expect('B6 새 기준 저장 (v1)', pg_temp.save('test.sql.coupon', '쿠폰 칸은 항상 있다', 0), 'OK');
select pg_temp.expect('B7 이미 있는 기준을 새 기준(base 0)으로 저장하면 충돌', pg_temp.save('test.sql.coupon', '다른 값', 0), 'VERSION_CONFLICT');
select pg_temp.expect('B8 새 버전 저장 (v2)', pg_temp.save('test.sql.coupon', '쿠폰 칸은 null일 수 있다', 1), 'OK');
select pg_temp.expect(
  'B8 기준 제목이 최신 버전 제목으로 바뀐다',
  (select title from public.standards where id = 'test.sql.coupon'),
  '쿠폰 칸은 null일 수 있다 (제목)'
);
select pg_temp.expect('B9 옛 버전(v1)을 보고 고치면 충돌 (동시 수정)', pg_temp.save('test.sql.coupon', '또 다른 값', 1), 'VERSION_CONFLICT');
select pg_temp.expect('B10 바뀐 게 없으면 새 버전을 만들지 않음', pg_temp.save('test.sql.coupon', '쿠폰 칸은 null일 수 있다', 2), 'VALIDATION_FAILED');
select pg_temp.expect('B11 v1과 같은 값으로 저장 (v3)', pg_temp.save('test.sql.coupon', '쿠폰 칸은 항상 있다', 2), 'OK');
select pg_temp.expect(
  'B11 v1과 값이 같아지면 되돌림으로 남는다',
  (select is_revert || ':' || reverted_to_version from public.standard_versions where standard_id = 'test.sql.coupon' and version = 3),
  'true:1'
);
update public.standards set locked = true where id = 'test.sql.coupon';
select pg_temp.expect('B12 잠긴 기준은 AI가 못 고침', pg_temp.save('test.sql.coupon', '잠긴 뒤 AI', 3), 'STANDARD_LOCKED');
select pg_temp.expect('B12 잠긴 기준도 사람은 고침 (v4)', pg_temp.save('test.sql.coupon', '잠긴 뒤 사람', 3, p_actor => 'human'), 'OK');
update public.standards set locked = false where id = 'test.sql.coupon';
select pg_temp.expect('B13 없는 기준을 고치려 하면 NOT_FOUND', pg_temp.save('test.sql.missing', '값', 2), 'NOT_FOUND');
select pg_temp.expect('B14 고친 주체가 이상하면 거절', pg_temp.save('test.sql.coupon', '값', 4, p_actor => 'robot'), 'VALIDATION_FAILED');

-- ---------------------------------------------------------------------------
-- C. revert_standard: 되돌림도 새 버전
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'C1 v2로 되돌리기 (v5)',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'test.sql.coupon', p_to_version => 2, p_reason => '회의에서 되돌림', p_base_version => 4)$$),
  'OK'
);
select pg_temp.expect(
  'C1 되돌린 버전은 v2의 제목·값과 되돌림 표시를 가진다',
  (select title || ' / ' || value || ' / ' || reverted_to_version || ' / ' || evidence from public.standard_versions where standard_id = 'test.sql.coupon' and version = 5),
  '쿠폰 칸은 null일 수 있다 (제목) / 쿠폰 칸은 null일 수 있다 / 2 / v2로 되돌림'
);
select pg_temp.expect(
  'C2 지금과 같은 버전으로는 되돌리지 않음',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'test.sql.coupon', p_to_version => 2, p_reason => '이유', p_base_version => 5)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'C3 없는 버전으로는 되돌리지 않음',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'test.sql.coupon', p_to_version => 9, p_reason => '이유', p_base_version => 5)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'C4 되돌리는 이유가 비면 거절',
  pg_temp.hint_of($$select public.revert_standard(p_id => 'test.sql.coupon', p_to_version => 1, p_reason => '', p_base_version => 5)$$),
  'VALIDATION_FAILED'
);

-- ---------------------------------------------------------------------------
-- D. 항상 적용 기준은 10개까지
-- ---------------------------------------------------------------------------
do $$
declare
  v_existing integer;
  v_hint text;
begin
  select count(*) into v_existing from public.standards where always_on and status = 'active';
  for i in 1..(10 - v_existing) loop
    v_hint := pg_temp.save(format('test.sql.always-%s', i), format('항상 %s', i), 0, p_always_on => true);
    if v_hint <> 'OK' then raise exception '검사 실패: 항상 적용 %번째 저장이 거절됐어요 (%)', v_existing + i, v_hint; end if;
  end loop;
  perform pg_temp.expect('D1 11번째 항상 적용 기준은 거절', pg_temp.save('test.sql.always-11', '항상 11', 0, p_always_on => true), 'ALWAYS_ON_LIMIT');
end;
$$;

-- ---------------------------------------------------------------------------
-- E. deprecate_standard: 지우지 않고 폐기
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  'E1 없는 기준으로 대체하면 거절',
  pg_temp.hint_of($$select public.deprecate_standard(p_id => 'test.sql.always-1', p_reason => '안 씀', p_base_version => 1, p_replaced_by => 'test.sql.nothing')$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'E2 폐기 (대체 기준 함께)',
  pg_temp.hint_of($$select public.deprecate_standard(p_id => 'test.sql.always-1', p_reason => '안 씀', p_base_version => 1, p_replaced_by => 'test.sql.coupon')$$),
  'OK'
);
select pg_temp.expect(
  'E2 폐기하면 항상 적용에서 빠지고 이유가 남는다',
  (select status || ':' || always_on || ':' || deprecated_reason || ':' || replaced_by from public.standards where id = 'test.sql.always-1'),
  'deprecated:false:안 씀:test.sql.coupon'
);
select pg_temp.expect('E3 폐기된 기준은 고칠 수 없음', pg_temp.save('test.sql.always-1', '되살리기', 1), 'VALIDATION_FAILED');

-- ---------------------------------------------------------------------------
-- F. 지우기·고치기는 서비스 키나 SQL 편집기(postgres)로도 막힘
-- ---------------------------------------------------------------------------
select pg_temp.expect('F1 기준은 지울 수 없음', pg_temp.hint_of($$delete from public.standards where id = 'test.sql.coupon'$$), 'FORBIDDEN');
select pg_temp.expect('F2 기준 버전은 고칠 수 없음', pg_temp.hint_of($$update public.standard_versions set value = 'x' where standard_id = 'test.sql.coupon'$$), 'FORBIDDEN');
select pg_temp.expect('F3 기준 버전은 지울 수 없음', pg_temp.hint_of($$delete from public.standard_versions where standard_id = 'test.sql.coupon'$$), 'FORBIDDEN');
select pg_temp.expect('F4 기준 버전 표는 비울 수 없음', pg_temp.hint_of($$truncate public.standard_versions cascade$$), 'FORBIDDEN');
select pg_temp.expect(
  'F5 목록 뷰는 최신 버전을 보여 준다',
  (select current_version || ':' || value from public.standards_latest where id = 'test.sql.coupon'),
  '5:쿠폰 칸은 null일 수 있다'
);

do $$ begin raise notice '위키 SQL 검사를 모두 통과했어요'; end $$;

rollback;
