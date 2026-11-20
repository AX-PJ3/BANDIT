-- Supabase가 아닌 빈 Postgres에서 supabase/migrations를 올리기 전에 한 번 돌려요.
-- Supabase 프로젝트에 처음부터 있는 역할 3개와 Realtime publication을 만들어요. 이미 있으면 건너뛰어요.
--
-- 쓰는 곳: 매일 백업의 되살리기 시험(.github/workflows/backup.yml), 내 컴퓨터의 임시 Postgres로 SQL 검사하기
-- Supabase 프로젝트에서는 돌릴 필요가 없어요 (모두 이미 있어요).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
