-- 위키 표 2개(기준, 기준 버전)와 쓰기 함수예요.
-- SIL-14 Supabase 결정 · SIL-15 표 초안 · SIL-18 삭제 막기 · SIL-19 위키 도구
--
-- 권한 원칙
-- - 공용 키(publishable)는 읽기만 해요. 표에 직접 쓰거나 지울 수 없어요 (SIL-18).
-- - 쓰기는 save_standard, revert_standard, deprecate_standard 함수로만 해요.
--   형식 검사, 잠금, 버전 충돌 검사가 함수 안에 있어서 MCP 서버, 앱, GitHub Actions 어디서 불러도 같은 규칙이 지켜져요.
-- - 기준 버전은 고치거나 지울 수 없고, 기준은 지울 수 없어요. 서비스 키나 SQL 편집기로도 막아요 (트리거).
--
-- 함수가 거절할 때는 hint에 우리 에러 코드(@sil/core의 SilErrorCode)를 넣어요.
-- message는 AI가 그대로 읽는 한국어 문장이라서, 다음에 무엇을 하면 되는지까지 적어요.
--
-- 나머지 표 5개(사람, 이슈와 기준 연결, 확인할 변경, 응답, 코드 확인 기록)는 10/12 SIL-15 확정 뒤 다음 마이그레이션에서 만들어요.

-- ---------------------------------------------------------------------------
-- 적용 범위 검사
-- ---------------------------------------------------------------------------

-- 적용 범위는 { code: [...], api: [...], screen: [...] } 모양이고, 셋 중 하나 이상에 값이 있어야 해요.
create function public.is_valid_scope(scope jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(scope) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(scope) as k (key)
      where k.key not in ('code', 'api', 'screen')
    )
    and not exists (
      select 1
      from (values ('code'), ('api'), ('screen')) as k (key)
      where scope ? k.key
        and (
          jsonb_typeof(scope -> k.key) <> 'array'
          or exists (
            select 1 from jsonb_array_elements(scope -> k.key) as e (item)
            where jsonb_typeof(e.item) <> 'string' or btrim(e.item #>> '{}') = ''
          )
        )
    )
    and (
      select sum(case when jsonb_typeof(scope -> k.key) = 'array' then jsonb_array_length(scope -> k.key) else 0 end)
      from (values ('code'), ('api'), ('screen')) as k (key)
    ) > 0,
    false
  );
$$;

-- 빠진 칸을 빈 목록으로 채워 늘 같은 모양으로 저장해요. 올바르지 않으면 null이에요.
create function public.normalize_scope(scope jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when public.is_valid_scope(t.normalized) then t.normalized end
  from (
    select jsonb_build_object(
      'code', coalesce(scope -> 'code', '[]'::jsonb),
      'api', coalesce(scope -> 'api', '[]'::jsonb),
      'screen', coalesce(scope -> 'screen', '[]'::jsonb)
    ) as normalized
    where jsonb_typeof(scope) = 'object'
      and not exists (
        select 1 from jsonb_object_keys(scope) as k (key)
        where k.key not in ('code', 'api', 'screen')
      )
  ) as t;
$$;

-- ---------------------------------------------------------------------------
-- 표
-- ---------------------------------------------------------------------------

create table public.standards (
  id text primary key
    constraint standards_id_format check (id ~ '^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){2,}$'),
  area text not null constraint standards_area_not_blank check (btrim(area) <> ''),
  title text not null constraint standards_title_not_blank check (btrim(title) <> ''),
  always_on boolean not null default false,
  status text not null default 'active'
    constraint standards_status check (status in ('active', 'deprecated')),
  replaced_by text references public.standards (id),
  deprecated_reason text,
  deprecated_by text,
  deprecated_at timestamptz,
  locked boolean not null default false,
  current_version integer not null constraint standards_current_version check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standards_not_replaced_by_self check (replaced_by is distinct from id),
  constraint standards_deprecated_has_reason check (status = 'active' or deprecated_reason is not null)
);

comment on table public.standards is
  '기준 (표 2/7). 기준 하나의 바뀌지 않는 부분이에요. 값은 standard_versions에 쌓여요. 지우지 않고 폐기(status)로만 바꿔요.';
comment on column public.standards.id is '영역.주제.규칙 모양. 한 번 정하면 바뀌지 않아요. 예: order.coupon.nullable';
comment on column public.standards.title is '최신 버전의 제목이에요. 버전마다의 제목은 standard_versions.title에 있어요 (SIL-57).';
comment on column public.standards.current_version is '최신 버전 번호. 저장할 때 baseVersion과 비교해서 동시 수정을 막아요 (SIL-15).';

create table public.standard_versions (
  standard_id text not null references public.standards (id),
  version integer not null constraint standard_versions_version check (version >= 1),
  title text not null constraint standard_versions_title_not_blank check (btrim(title) <> ''),
  value text not null constraint standard_versions_value_not_blank check (btrim(value) <> ''),
  reason text not null constraint standard_versions_reason_not_blank check (btrim(reason) <> ''),
  evidence text not null constraint standard_versions_evidence_not_blank check (btrim(evidence) <> ''),
  scope jsonb not null constraint standard_versions_scope check (public.is_valid_scope(scope)),
  changed_by text,
  changed_by_actor text not null constraint standard_versions_actor check (changed_by_actor in ('ai', 'human')),
  is_revert boolean not null default false,
  reverted_to_version integer,
  source text not null
    constraint standard_versions_source check (source in ('code', 'ai_chat', 'figma', 'meeting', 'slack')),
  created_at timestamptz not null default now(),
  primary key (standard_id, version),
  constraint standard_versions_revert check (
    (is_revert and reverted_to_version is not null and reverted_to_version < version)
    or (not is_revert and reverted_to_version is null)
  )
);

comment on table public.standard_versions is
  '기준 버전 (표 3/7). 기준이 바뀔 때마다 한 줄씩 쌓여요. 고치거나 지울 수 없어요.';
comment on column public.standard_versions.is_revert is '새 값이 앞선 버전의 값과 같으면 true ([Spec] 담당자에게 알리기 예외 3)';

-- 기준마다 최신 버전을 붙인 모습이에요. 목차와 검색이 이 뷰 하나만 읽어요.
-- security_invoker라서 부르는 사람의 권한(RLS)으로 읽어요.
create view public.standards_latest
with (security_invoker = true)
as
select
  s.id,
  s.area,
  s.title,
  s.always_on,
  s.status,
  s.replaced_by,
  s.deprecated_reason,
  s.locked,
  s.current_version,
  s.updated_at,
  v.value,
  v.reason,
  v.evidence,
  v.scope,
  v.changed_by,
  v.changed_by_actor,
  v.is_revert,
  v.reverted_to_version,
  v.source,
  v.created_at as version_created_at
from public.standards as s
join public.standard_versions as v on v.standard_id = s.id and v.version = s.current_version;

-- ---------------------------------------------------------------------------
-- 지우기·고치기 막기 (서비스 키, SQL 편집기 포함)
-- ---------------------------------------------------------------------------

create function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    hint = 'FORBIDDEN',
    message = format(
      '%s 표는 %s 수 없어요. 기준은 지우지 않고 폐기(deprecate_standard)로 바꾸고, 바뀐 내용은 새 버전으로 쌓아요.',
      tg_table_name,
      case tg_op when 'UPDATE' then '고칠' when 'DELETE' then '지울' else '비울' end
    );
end;
$$;

create trigger standards_no_delete
  before delete on public.standards
  for each row execute function public.forbid_change();
create trigger standards_no_truncate
  before truncate on public.standards
  for each statement execute function public.forbid_change();
create trigger standard_versions_no_change
  before update or delete on public.standard_versions
  for each row execute function public.forbid_change();
create trigger standard_versions_no_truncate
  before truncate on public.standard_versions
  for each statement execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- 쓰기 함수 (공용 키로 부를 수 있는 유일한 쓰기 통로)
-- ---------------------------------------------------------------------------

-- 함수 안에서 거절할 때 쓰는 공통 모양이에요.
create function public.reject(code text, message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', hint = code, message = message;
end;
$$;

create function public.check_actor_and_source(p_actor text, p_source text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null or p_actor not in ('ai', 'human') then
    perform public.reject('VALIDATION_FAILED', format('고친 주체는 ai 또는 human이어야 해요 (받은 값: %s).', coalesce(p_actor, '없음')));
  end if;
  if p_source is null or p_source not in ('code', 'ai_chat', 'figma', 'meeting', 'slack') then
    perform public.reject(
      'VALIDATION_FAILED',
      format('출처는 code, ai_chat, figma, meeting, slack 중 하나여야 해요 (받은 값: %s).', coalesce(p_source, '없음'))
    );
  end if;
end;
$$;

-- 이미 있는 기준을 고치기 전에 꼭 확인할 것: 폐기, 잠금, 버전 충돌
create function public.check_editable(p_current public.standards, p_base_version integer, p_actor text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_current.status = 'deprecated' then
    perform public.reject(
      'VALIDATION_FAILED',
      format(
        '기준 %s은(는) 폐기됐어요%s. 폐기된 기준은 고칠 수 없어요.',
        p_current.id,
        case when p_current.replaced_by is not null then format(' (대신 %s을(를) 써요)', p_current.replaced_by) else '' end
      )
    );
  end if;
  if p_current.locked and p_actor = 'ai' then
    perform public.reject(
      'STANDARD_LOCKED',
      format('기준 %s은(는) 사람이 잠가 두어서 AI가 고칠 수 없어요. 바꿔야 한다면 사람에게 알려 주세요.', p_current.id)
    );
  end if;
  if p_base_version is distinct from p_current.current_version then
    perform public.reject(
      'VERSION_CONFLICT',
      format(
        '기준 %s은(는) 그사이 v%s이(가) 됐어요 (보고 고친 버전은 v%s). get_standard로 최신 내용을 다시 보고, 사람에게 확인한 뒤 baseVersion %s로 다시 저장해 주세요.',
        p_current.id, p_current.current_version, coalesce(p_base_version::text, '없음'), p_current.current_version
      )
    );
  end if;
end;
$$;

-- 항상 적용 기준은 10개까지예요 (위키 관리 원칙 5).
create function public.check_always_on_room(p_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 두 사람이 동시에 11번째를 넣지 못하게 잠깐 줄을 세워요.
  perform pg_advisory_xact_lock(hashtext('sil.always_on'));
  select count(*) into v_count
  from public.standards
  where always_on and status = 'active' and id <> p_id;
  if v_count >= 10 then
    perform public.reject(
      'ALWAYS_ON_LIMIT',
      format('항상 적용 기준은 10개까지예요 (지금 %s개). 하나를 항상 적용에서 빼거나, 필요할 때 꺼내 읽는 기준으로 저장해 주세요.', v_count)
    );
  end if;
end;
$$;

-- 새 기준을 만들거나 새 버전을 저장해요.
-- p_base_version: 새 기준이면 0, 고치는 거면 내가 보고 고친 버전 (그사이 바뀌었으면 거절해요)
create function public.save_standard(
  p_id text,
  p_title text,
  p_value text,
  p_reason text,
  p_evidence text,
  p_scope jsonb,
  p_base_version integer,
  p_area text default null,
  p_always_on boolean default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_scope jsonb := public.normalize_scope(p_scope);
  v_title text := btrim(p_title);
  v_value text := btrim(p_value);
  v_area text := nullif(btrim(p_area), '');
  v_current public.standards;
  v_latest public.standard_versions;
  v_version integer;
  v_revert_to integer;
begin
  -- 1. 형식 검사: 빈 칸을 한 번에 모아서 알려 줘요 (위키 관리 원칙 7)
  if nullif(v_title, '') is null then v_missing := array_append(v_missing, '제목(title)'); end if;
  if nullif(v_value, '') is null then v_missing := array_append(v_missing, '값(value)'); end if;
  if nullif(btrim(p_reason), '') is null then v_missing := array_append(v_missing, '이유(reason)'); end if;
  if nullif(btrim(p_evidence), '') is null then v_missing := array_append(v_missing, '근거(evidence)'); end if;
  if v_scope is null then v_missing := array_append(v_missing, '적용 범위(scope: code, api, screen 중 하나 이상)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject(
      'VALIDATION_FAILED',
      format(
        '%s이(가) 비어 있어서 저장하지 않았어요. 모르는 칸은 지어내지 말고 사람에게 물어본 뒤 다시 저장해 주세요.',
        array_to_string(v_missing, ', ')
      )
    );
  end if;
  perform public.check_actor_and_source(p_actor, p_source);
  if p_base_version is null or p_base_version < 0 then
    perform public.reject('VALIDATION_FAILED', 'baseVersion은 0 이상이어야 해요. 새 기준이면 0, 고치는 거면 get_standard에서 본 버전이에요.');
  end if;

  select * into v_current from public.standards where id = p_id for update;

  if not found then
    -- 2-a. 새 기준
    if p_base_version <> 0 then
      perform public.reject(
        'NOT_FOUND',
        format('기준 %s이(가) 없어요. 새 기준이면 baseVersion을 0으로, 있는 기준을 고치는 거면 search_standards로 ID를 먼저 확인해 주세요.', p_id)
      );
    end if;
    if p_id is null or p_id !~ '^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){2,}$' then
      perform public.reject(
        'VALIDATION_FAILED',
        format('기준 ID는 영역.주제.규칙 모양의 영어 소문자여야 해요. 예: order.coupon.nullable (받은 값: %s)', coalesce(p_id, '없음'))
      );
    end if;
    if v_area is null then
      perform public.reject('VALIDATION_FAILED', '새 기준에는 영역(area)이 필요해요. get_index에 있는 영역 이름 중 하나를 써 주세요.');
    end if;
    if coalesce(p_always_on, false) then
      perform public.check_always_on_room(p_id);
    end if;
    begin
      insert into public.standards (id, area, title, always_on, current_version)
      values (p_id, v_area, v_title, coalesce(p_always_on, false), 1);
    exception when unique_violation then
      perform public.reject(
        'VERSION_CONFLICT',
        format('기준 %s을(를) 다른 사람이 방금 만들었어요. get_standard로 내용을 보고, 고칠 게 있으면 그 버전을 baseVersion으로 다시 저장해 주세요.', p_id)
      );
    end;
    v_version := 1;
  else
    -- 2-b. 새 버전
    perform public.check_editable(v_current, p_base_version, p_actor);
    select * into v_latest
    from public.standard_versions
    where standard_id = p_id and version = v_current.current_version;

    if v_latest.title = v_title and v_latest.value = v_value and v_latest.scope = v_scope
      and (v_area is null or v_area = v_current.area)
      and (p_always_on is null or p_always_on = v_current.always_on) then
      perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 바뀐 내용이 없어서 새 버전을 만들지 않았어요.', p_id));
    end if;
    if coalesce(p_always_on, false) and not v_current.always_on then
      perform public.check_always_on_room(p_id);
    end if;

    v_version := v_current.current_version + 1;
    -- 앞선 버전과 값이 같아지면 되돌림으로 남겨요 (어느 버전으로 돌아갔는지 함께)
    if v_latest.value <> v_value then
      select max(version) into v_revert_to
      from public.standard_versions
      where standard_id = p_id and version < v_current.current_version and value = v_value;
    end if;

    update public.standards
    set
      title = v_title,
      area = coalesce(v_area, area),
      always_on = coalesce(p_always_on, always_on),
      current_version = v_version,
      updated_at = now()
    where id = p_id;
  end if;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source
  )
  values (
    p_id, v_version, v_title, v_value, btrim(p_reason), btrim(p_evidence), v_scope,
    nullif(btrim(p_changed_by), ''), p_actor, v_revert_to is not null, v_revert_to, p_source
  );

  return jsonb_build_object(
    'standardId', p_id,
    'version', v_version,
    'isRevert', v_revert_to is not null,
    'revertedToVersion', v_revert_to
  );
end;
$$;

-- 앞선 버전으로 되돌려요. 되돌림도 새 버전으로 쌓여요 (지우지 않아요).
create function public.revert_standard(
  p_id text,
  p_to_version integer,
  p_reason text,
  p_base_version integer,
  p_evidence text default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.standards;
  v_target public.standard_versions;
  v_latest public.standard_versions;
  v_version integer;
begin
  if nullif(btrim(p_reason), '') is null then
    perform public.reject('VALIDATION_FAILED', '되돌리는 이유(reason)가 비어 있어서 되돌리지 않았어요. 사람에게 이유를 물어본 뒤 다시 해 주세요.');
  end if;
  perform public.check_actor_and_source(p_actor, p_source);

  select * into v_current from public.standards where id = p_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('기준 %s이(가) 없어요. search_standards로 ID를 먼저 확인해 주세요.', p_id));
  end if;
  perform public.check_editable(v_current, p_base_version, p_actor);

  select * into v_target from public.standard_versions where standard_id = p_id and version = p_to_version;
  if not found or p_to_version >= v_current.current_version then
    perform public.reject(
      'VALIDATION_FAILED',
      format('되돌릴 버전 v%s이(가) 없어요. 지금은 v%s이고, 그보다 앞선 버전으로만 되돌릴 수 있어요.', coalesce(p_to_version::text, '없음'), v_current.current_version)
    );
  end if;

  select * into v_latest from public.standard_versions where standard_id = p_id and version = v_current.current_version;
  if v_latest.title = v_target.title and v_latest.value = v_target.value and v_latest.scope = v_target.scope then
    perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 지금 내용이 이미 v%s과 같아요.', p_id, p_to_version));
  end if;

  v_version := v_current.current_version + 1;
  update public.standards
  set title = v_target.title, current_version = v_version, updated_at = now()
  where id = p_id;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source
  )
  values (
    p_id, v_version, v_target.title, v_target.value, btrim(p_reason),
    coalesce(nullif(btrim(p_evidence), ''), format('v%s로 되돌림', p_to_version)),
    v_target.scope, nullif(btrim(p_changed_by), ''), p_actor, true, p_to_version, p_source
  );

  return jsonb_build_object(
    'standardId', p_id,
    'version', v_version,
    'isRevert', true,
    'revertedToVersion', p_to_version
  );
end;
$$;

-- 기준을 폐기해요. 지우지 않고 상태만 바꾸고, 무엇으로 대체됐는지 남겨요 (위키 관리 원칙 6, SIL-18).
create function public.deprecate_standard(
  p_id text,
  p_reason text,
  p_base_version integer,
  p_replaced_by text default null,
  p_actor text default 'ai',
  p_changed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.standards;
  v_replacement public.standards;
begin
  if nullif(btrim(p_reason), '') is null then
    perform public.reject('VALIDATION_FAILED', '폐기하는 이유(reason)가 비어 있어서 폐기하지 않았어요. 사람에게 이유를 물어본 뒤 다시 해 주세요.');
  end if;
  perform public.check_actor_and_source(p_actor, 'ai_chat');

  select * into v_current from public.standards where id = p_id for update;
  if not found then
    perform public.reject('NOT_FOUND', format('기준 %s이(가) 없어요. search_standards로 ID를 먼저 확인해 주세요.', p_id));
  end if;
  perform public.check_editable(v_current, p_base_version, p_actor);

  if p_replaced_by is not null then
    select * into v_replacement from public.standards where id = p_replaced_by;
    if not found or v_replacement.status <> 'active' or p_replaced_by = p_id then
      perform public.reject(
        'VALIDATION_FAILED',
        format('대체할 기준 %s이(가) 없거나 이미 폐기됐어요. 대체 기준을 먼저 저장하거나 비워 두세요.', p_replaced_by)
      );
    end if;
  end if;

  update public.standards
  set
    status = 'deprecated',
    replaced_by = p_replaced_by,
    always_on = false,
    deprecated_reason = btrim(p_reason),
    deprecated_by = nullif(btrim(p_changed_by), ''),
    deprecated_at = now(),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object('standardId', p_id, 'status', 'deprecated', 'replacedBy', p_replaced_by);
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------

alter table public.standards enable row level security;
alter table public.standard_versions enable row level security;

create policy "누구나 읽기" on public.standards for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.standard_versions for select to anon, authenticated using (true);

-- Supabase는 새 표에 anon·authenticated 쓰기 권한을 기본으로 줘요. 전부 거두고 읽기만 다시 줘요.
revoke all on table public.standards, public.standard_versions, public.standards_latest from anon, authenticated;
grant select on table public.standards, public.standard_versions, public.standards_latest to anon, authenticated;

-- 함수는 쓰기 통로 셋만 열어요. 나머지(검사용)는 REST로 부를 수 없게 닫아요.
revoke all on function
  public.is_valid_scope(jsonb),
  public.normalize_scope(jsonb),
  public.forbid_change(),
  public.reject(text, text),
  public.check_actor_and_source(text, text),
  public.check_editable(public.standards, integer, text),
  public.check_always_on_room(text),
  public.save_standard(text, text, text, text, text, jsonb, integer, text, boolean, text, text, text),
  public.revert_standard(text, integer, text, integer, text, text, text, text),
  public.deprecate_standard(text, text, integer, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.save_standard(text, text, text, text, text, jsonb, integer, text, boolean, text, text, text),
  public.revert_standard(text, integer, text, integer, text, text, text, text),
  public.deprecate_standard(text, text, integer, text, text, text)
to anon, authenticated;
