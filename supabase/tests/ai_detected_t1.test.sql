-- AI가 찾았나 T1 SQL 검사 (20261014100000_ai_detected_t1.sql, SIL-66, D61)
--
-- 실행 (Docker 없이):
--   psql "<DB 연결 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/ai_detected_t1.test.sql
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

-- T1이 저장하는 모양: AI가 저장, 출처 AI 대화, AI가 찾았나 예, 근거 없음 (packages/t1/src/save-input.ts)
create function pg_temp.save_t1(p_value text, p_base_version integer)
returns text
language sql
as $$
  select pg_temp.hint_of(format(
    $f$select public.save_standard(p_id => 'test.t1.title-length', p_title => '알림 제목 길이', p_value => %L, p_reason => 'Windows 알림 창에서 잘림', p_always_on => false, p_base_version => %s, p_source => 'ai_chat', p_actor => 'ai', p_changed_by => '부건', p_ai_detected => true)$f$,
    p_value, p_base_version
  ));
$$;

-- 결정 사항 v1은 사람이 만들어요 (AI는 있는 영역 안에서만 저장해요)
select public.save_standard(
  p_id => 'test.t1.title-length', p_title => '알림 제목 길이', p_value => '40자 이하', p_reason => 'Mac 알림 창에서 잘림',
  p_always_on => false, p_base_version => 0, p_source => 'meeting', p_actor => 'human', p_changed_by => '호윤'
);

select pg_temp.expect(
  'A1 T1은 근거가 없어도 AI가 찾았나 예로 저장한다 (D61)',
  pg_temp.save_t1('32자 이하', 1),
  'OK'
);
select pg_temp.expect(
  'A2 저장한 버전: AI가 찾았나 예, 출처 AI 대화, 바꾼 주체 AI, 근거 없음',
  (select ai_detected || ':' || source || ':' || changed_by_actor || ':' || coalesce(evidence, '없음')
   from public.standard_versions where standard_id = 'test.t1.title-length' and version = 2),
  'true:ai_chat:ai:없음'
);
select pg_temp.expect(
  'A3 목록 뷰에도 AI가 찾았나 예로 보인다 (지표 "AI가 찾아 고친 수")',
  (select ai_detected::text from public.standards_latest where id = 'test.t1.title-length'),
  'true'
);

select pg_temp.save_t1('30자 이하', 2);
select pg_temp.expect(
  'A4 T1은 사람에게 묻고 저장하니 24시간에 세 번째도 막지 않는다 (detect.safety.repeat-limit는 PR 경로)',
  pg_temp.save_t1('28자 이하', 3),
  'OK'
);

select pg_temp.expect(
  'B1 PR에서 찾은 변경(출처 코드)은 여전히 근거가 없으면 거절 (detect.change.evidence)',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.t1.title-length', p_title => '알림 제목 길이', p_value => '26자 이하', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 4, p_source => 'code', p_ai_detected => true)$$),
  'VALIDATION_FAILED'
);
select pg_temp.expect(
  'B2 PR 경로의 하루 두 번 제한은 T1으로 바뀐 횟수도 센다',
  pg_temp.hint_of($$select public.save_standard(p_id => 'test.t1.title-length', p_title => '알림 제목 길이', p_value => '26자 이하', p_reason => 'PR에서 바뀜', p_always_on => false, p_base_version => 4, p_source => 'code', p_ai_detected => true, p_evidence => 'PR #30 src/notify.ts:12')$$),
  'CHANGE_LIMIT'
);

do $$ begin raise notice 'AI가 찾았나 T1 SQL 검사를 모두 통과했어요'; end $$;

rollback;
