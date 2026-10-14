-- 항상 적용 버전마다 SQL 검사 (20261009300000_always_on_per_version.sql)
-- 항상 적용은 버전마다 남기고, 되돌리면 그 값도 돌아와요 (착수 안내 7 데이터 항목 목록 v2).
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/always_on_per_version.test.sql
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.
-- 끝까지 가면 마지막 줄에 '항상 적용 버전마다 SQL 검사를 모두 통과했어요'가 보여요.

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

-- 기준을 저장하는 짧은 도우미. 기본은 사람이 저장해요 (AI는 새 영역을 만들 수 없어서)
create function pg_temp.save(
  p_id text, p_value text, p_base integer, p_always_on boolean, p_actor text default 'human'
)
returns text
language sql
as $$
  select pg_temp.hint_of(format(
    'select public.save_standard(p_id => %L, p_title => %L, p_value => %L, p_reason => %L, p_always_on => %L, p_base_version => %s, p_actor => %L)',
    p_id, p_value || ' (제목)', p_value, '검사 이유', p_always_on, p_base, p_actor
  ));
$$;

create function pg_temp.versions_of(p_id text)
returns text
language sql
as $$
  select string_agg(version || ':' || always_on, ',' order by version)
  from public.standard_versions where standard_id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- G. 항상 적용은 버전마다
-- ---------------------------------------------------------------------------
select pg_temp.expect('G1 v1 저장 (항상 적용 아님)', pg_temp.save('test.clean.flag', '첫 값', 0, false), 'OK');
select pg_temp.expect('G1 v2 저장 (항상 적용으로)', pg_temp.save('test.clean.flag', '둘째 값', 1, true), 'OK');
select pg_temp.expect('G1 항상 적용이 버전마다 남는다', pg_temp.versions_of('test.clean.flag'), '1:false,2:true');
select pg_temp.expect('G1 기준 표에는 최신 값', (select always_on::text from public.standards where id = 'test.clean.flag'), 'true');

select pg_temp.expect(
  'G2 v1로 되돌리기 (v3)',
  pg_temp.hint_of($q$select public.revert_standard(p_id => 'test.clean.flag', p_to_version => 1, p_reason => '검사', p_base_version => 2, p_actor => 'human')$q$),
  'OK'
);
select pg_temp.expect('G2 되돌리면 그 버전의 항상 적용도 돌아온다', pg_temp.versions_of('test.clean.flag'), '1:false,2:true,3:false');
select pg_temp.expect('G2 기준 표도 함께 바뀐다', (select always_on::text from public.standards where id = 'test.clean.flag'), 'false');

select pg_temp.expect('G3 항상 적용만 바꿔도 새 버전 (v4)', pg_temp.save('test.clean.flag', '첫 값', 3, true), 'OK');
select pg_temp.expect(
  'G3 항상 적용만 다른 버전으로도 되돌릴 수 있다 (v5)',
  pg_temp.hint_of($q$select public.revert_standard(p_id => 'test.clean.flag', p_to_version => 3, p_reason => '검사', p_base_version => 4, p_actor => 'human')$q$),
  'OK'
);
select pg_temp.expect(
  'G3 내용이 이미 같으면 되돌리지 않는다',
  pg_temp.hint_of($q$select public.revert_standard(p_id => 'test.clean.flag', p_to_version => 3, p_reason => '검사', p_base_version => 5, p_actor => 'human')$q$),
  'VALIDATION_FAILED'
);

-- 되돌려서 항상 적용이 11개가 되면 거절해요. 팀 DB에 이미 있는 항상 적용 기준 수에 맞춰 빈자리를 채워요.
select pg_temp.expect('G4 준비: v1 항상 적용', pg_temp.save('test.clean.room', '자리 값', 0, true), 'OK');
select pg_temp.expect('G4 준비: v2 항상 적용 아님', pg_temp.save('test.clean.room', '자리 새 값', 1, false), 'OK');
do $$
declare
  v_room integer := 10 - (select count(*) from public.standards where always_on and status = 'active');
begin
  for i in 1..v_room loop
    perform public.save_standard(
      p_id => format('test.clean.on-%s', i), p_title => '항상 적용 채우기', p_value => format('값 %s', i),
      p_reason => '검사', p_always_on => true, p_base_version => 0, p_actor => 'human'
    );
  end loop;
end;
$$;
select pg_temp.expect(
  'G4 항상 적용이 10개일 때 항상 적용 버전으로 되돌리면 거절',
  pg_temp.hint_of($q$select public.revert_standard(p_id => 'test.clean.room', p_to_version => 1, p_reason => '검사', p_base_version => 2, p_actor => 'human')$q$),
  'ALWAYS_ON_LIMIT'
);

select pg_temp.expect(
  'G5 항상 적용 칸은 비어 있을 수 없다',
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'standard_versions' and column_name = 'always_on'),
  'NO'
);
select pg_temp.expect(
  'G5 버전 표는 여전히 고칠 수 없다 (채우려고 잠깐 푼 막기가 다시 걸려 있다)',
  (pg_temp.hint_of($q$update public.standard_versions set value = '몰래' where standard_id = 'test.clean.flag'$q$) <> 'OK')::text,
  'true'
);

do $$ begin raise notice '항상 적용 버전마다 SQL 검사를 모두 통과했어요'; end $$;

rollback;
