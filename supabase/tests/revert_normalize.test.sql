-- 되돌림 글자 다듬기 SQL 검사 (20261015100000_revert_normalize.sql, SIL-104, detect.change.revert-mark)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/revert_normalize.test.sql
--   또는 Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run
--
-- 처음부터 끝까지 BEGIN … ROLLBACK 안에서 돌아요. 팀 DB에서 돌려도 흔적이 남지 않아요.

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

-- 사람이 결정 사항을 저장해요. 돌려받은 결과에서 되돌림 표시만 꺼내요
create function pg_temp.save(p_id text, p_value text, p_base_version integer)
returns text
language sql
as $$
  select (r ->> 'isRevert') || ':' || coalesce(r ->> 'revertedToVersion', '없음')
  from public.save_standard(
    p_id => p_id, p_title => '한 화면 알림 수', p_value => p_value, p_reason => '화면이 좁음',
    p_always_on => false, p_base_version => p_base_version, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
  ) as r;
$$;

select pg_temp.expect('N1 다듬기: 공백 글자를 모두 지운다', public.normalize_standard_value(E'  최대   4 개\t\n '), '최대4개');
select pg_temp.expect('N2 다듬기: 끝 마침표 여러 개와 。, 마침표 앞 공백', public.normalize_standard_value('4 개 .。.'), '4개');
select pg_temp.expect('N3 다듬기: 전각 숫자와 전각 마침표', public.normalize_standard_value('４ 개．'), '4개');
select pg_temp.expect('N4 다듬기: 가운데 마침표는 그대로', public.normalize_standard_value('v1.2'), 'v1.2');
select pg_temp.expect(
  'N5 다듬기: NBSP·전각 공백(U+3000)·BOM(U+FEFF)도 지운다',
  public.normalize_standard_value(chr(65279) || '최대' || chr(160) || '4' || chr(12288) || '개'),
  '최대4개'
);
select pg_temp.expect('N6 다듬기: "만 듦"과 "만듦"은 같다', public.normalize_standard_value('만 듦'), '만듦');
select pg_temp.expect('N7 다듬기: NFKC라서 "㎡"는 "m2"와 같다 (받아들인 차이)', public.normalize_standard_value('㎡'), 'm2');

-- R: "4개" → "5개" → "4 개." 는 v1로 되돌린 거예요
select pg_temp.save('test.revert.notify-count', '4개', 0);
select pg_temp.save('test.revert.notify-count', '5개', 1);
select pg_temp.expect(
  'R1 띄어쓰기·끝 마침표만 다르면 되돌림으로 표시하고 v1을 적는다',
  pg_temp.save('test.revert.notify-count', '4 개.', 2),
  'true:1'
);
select pg_temp.expect(
  'R2 저장된 값은 넣은 글자 그대로다 (다듬은 값이 아님)',
  (select value from public.standard_versions where standard_id = 'test.revert.notify-count' and version = 3),
  '4 개.'
);
select pg_temp.expect(
  'R3 버전 기록에도 되돌림과 v1이 남는다',
  (select is_revert || ':' || reverted_to_version from public.standard_versions where standard_id = 'test.revert.notify-count' and version = 3),
  'true:1'
);

-- F: 전각 숫자도 같은 값으로 봐요. 같은 값이 여러 버전이면 가장 큰 버전으로 적어요
select pg_temp.expect(
  'F1 전각 숫자 "５개"는 v2로 되돌린 것이다',
  pg_temp.save('test.revert.notify-count', '５개', 3),
  'true:2'
);
select pg_temp.expect(
  'F2 "４개"는 같은 값인 v1·v3 중 가장 큰 v3으로 되돌린 것이다',
  pg_temp.save('test.revert.notify-count', '４개', 4),
  'true:3'
);

-- D: 다른 값은 되돌림이 아니에요
select pg_temp.expect(
  'D1 처음 보는 값은 되돌림이 아니다',
  pg_temp.save('test.revert.notify-count', '6개', 5),
  'false:없음'
);
select pg_temp.expect(
  'D2 뜻이 같아도 글자가 다르면 DB는 되돌림으로 보지 않는다 (사람이 확인해서 옛 글자로 저장할 때만)',
  pg_temp.save('test.revert.notify-count', '네 개', 6),
  'false:없음'
);
select pg_temp.expect(
  'D3 지금 값과 다듬은 값이 같으면(마침표만 붙임) 되돌림으로 보지 않는다',
  pg_temp.save('test.revert.notify-count', '네 개.', 7),
  'false:없음'
);

do $$ begin raise notice '되돌림 글자 다듬기 SQL 검사를 모두 통과했어요'; end $$;

rollback;
