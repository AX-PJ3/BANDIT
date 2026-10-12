-- 착수 안내 "데이터 항목 목록 v2"에 맞춘 저장소예요 (SIL-65).
--
-- 1. 기준 버전: 저장할 때 필수로 검사하는 칸을 ID, 제목, 값, 이유, 항상 적용 5개로 바꿔요.
--    근거와 적용 범위는 예전 위키에서 그대로 가져와 저장하지만, 비어 있어도 저장해요.
-- 2. 기준 버전: "AI가 찾았나"(ai_detected) 칸을 더하고, 적용 범위에 문서(doc)를, 출처에 wiki(팀 위키 파일)를 더해요.
--    새 기준의 영역은 비우면 ID 앞부분(예: app.notify.title-length → app)으로 정해요.
-- 3. 표 4개를 더해요: 이슈, 이슈와 기준 연결, 확인할 변경, 답.
--    이슈는 이 도구 안에 미리 넣어 두는 작업 목록이에요 (Linear와 연결하지 않아요). 쓰기는 save_issue 함수로만 해요.
-- 4. 새 버전이 저장되면 같은 트랜잭션 안에서 on_standard_version_saved()를 불러요.
--    지금은 아무것도 하지 않아요. "새 버전이 저장된 것을 알리는 방법"(SIL-65 조건 9)을 민수님과 정하면 이 함수 본문을 바꿔요.
--
-- 이미 올린 20261008100000_wiki.sql은 고치지 않아요. 바뀐 함수는 여기서 다시 만들어요.

-- ---------------------------------------------------------------------------
-- 1. 적용 범위: 문서(doc)를 받고, 비어 있으면 없는 것으로 봐요
-- ---------------------------------------------------------------------------

-- 적용 범위는 { code, api, screen, doc } 모양이고, 값이 하나 이상 있어야 해요.
create or replace function public.is_valid_scope(scope jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(scope) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(scope) as k (key)
      where k.key not in ('code', 'api', 'screen', 'doc')
    )
    and not exists (
      select 1
      from (values ('code'), ('api'), ('screen'), ('doc')) as k (key)
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
      from (values ('code'), ('api'), ('screen'), ('doc')) as k (key)
    ) > 0,
    false
  );
$$;

-- 빠진 칸을 빈 목록으로 채워 늘 같은 모양으로 저장해요. 올바르지 않으면 null이에요.
create or replace function public.normalize_scope(scope jsonb)
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
      'screen', coalesce(scope -> 'screen', '[]'::jsonb),
      'doc', coalesce(scope -> 'doc', '[]'::jsonb)
    ) as normalized
    where jsonb_typeof(scope) = 'object'
      and not exists (
        select 1 from jsonb_object_keys(scope) as k (key)
        where k.key not in ('code', 'api', 'screen', 'doc')
      )
  ) as t;
$$;

-- null, {}, 또는 모든 칸이 빈 목록이면 "적용 범위 없음"이에요.
create function public.is_blank_scope(scope jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select scope is null
    or jsonb_typeof(scope) = 'null'
    or (
      jsonb_typeof(scope) = 'object'
      and not exists (
        select 1 from jsonb_each(scope) as e (key, value)
        where e.key not in ('code', 'api', 'screen', 'doc')
          or jsonb_typeof(e.value) <> 'array'
          or jsonb_array_length(e.value) > 0
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 2. 기준 버전 칸: 근거·적용 범위는 비어도 되고, AI가 찾았나·wiki 출처를 더해요
-- ---------------------------------------------------------------------------

alter table public.standard_versions
  alter column evidence drop not null,
  drop constraint standard_versions_evidence_not_blank,
  add constraint standard_versions_evidence_not_blank check (evidence is null or btrim(evidence) <> ''),
  alter column scope drop not null,
  drop constraint standard_versions_scope,
  add constraint standard_versions_scope check (scope is null or public.is_valid_scope(scope)),
  drop constraint standard_versions_source,
  add constraint standard_versions_source
    check (source in ('code', 'ai_chat', 'figma', 'meeting', 'slack', 'wiki')),
  add column ai_detected boolean not null default false;

comment on column public.standard_versions.ai_detected is
  'AI가 찾았나. 사람이 바꾸지 않고 AI가 PR을 읽고 찾아낸 변경이면 true (데이터 항목 목록 v2)';
comment on column public.standard_versions.evidence is '근거. 예전 위키에서 가져와 저장만 하고, 비어 있어도 돼요 (SIL-65).';
comment on column public.standard_versions.scope is '적용 범위 { code, api, screen, doc }. 저장만 하고, 비어 있으면 null이에요 (SIL-65).';

-- 목록 뷰에 "AI가 찾았나"를 더해요. 앞의 칸 순서는 그대로 둬야 해서 맨 뒤에 붙여요.
create or replace view public.standards_latest
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
  v.created_at as version_created_at,
  v.ai_detected
from public.standards as s
join public.standard_versions as v on v.standard_id = s.id and v.version = s.current_version;

create or replace function public.check_actor_and_source(p_actor text, p_source text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null or p_actor not in ('ai', 'human') then
    perform public.reject('VALIDATION_FAILED', format('고친 주체는 ai 또는 human이어야 해요 (받은 값: %s).', coalesce(p_actor, '없음')));
  end if;
  if p_source is null or p_source not in ('code', 'ai_chat', 'figma', 'meeting', 'slack', 'wiki') then
    perform public.reject(
      'VALIDATION_FAILED',
      format('출처는 code, ai_chat, figma, meeting, slack, wiki 중 하나여야 해요 (받은 값: %s).', coalesce(p_source, '없음'))
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 새 버전이 저장된 뒤 부르는 자리 (SIL-65 조건 9)
-- ---------------------------------------------------------------------------

-- save_standard와 revert_standard가 새 버전을 쌓은 직후, 같은 트랜잭션 안에서 불러요.
-- 여기서 실패하면 저장도 함께 취소돼요. 그래서 "기준은 바뀌었는데 확인할 변경은 안 생김"이 일어나지 않아요.
create function public.on_standard_version_saved(p_standard_id text, p_version integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- 아직 아무것도 하지 않아요. 알리는 방법을 정하면 민수님이 새 마이그레이션에서 이 본문을 바꿔요.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. save_standard: 필수 칸을 v2 5개로 (인자가 바뀌어서 지우고 다시 만들어요)
-- ---------------------------------------------------------------------------

drop function public.save_standard(text, text, text, text, text, jsonb, integer, text, boolean, text, text, text);

-- 새 기준을 만들거나 새 버전을 저장해요.
-- 필수: p_id, p_title, p_value, p_reason, p_always_on, p_base_version (새 기준이면 0, 고치면 내가 보고 고친 버전)
-- 인자는 모두 기본값이 있어요. 빠뜨려도 "함수 없음" 대신 무엇이 빠졌는지 한 번에 알려 주려고요.
create function public.save_standard(
  p_id text default null,
  p_title text default null,
  p_value text default null,
  p_reason text default null,
  p_always_on boolean default null,
  p_base_version integer default null,
  p_evidence text default null,
  p_scope jsonb default null,
  p_area text default null,
  p_source text default 'ai_chat',
  p_actor text default 'ai',
  p_changed_by text default null,
  p_ai_detected boolean default false,
  p_locked boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_id text := btrim(p_id);
  v_title text := btrim(p_title);
  v_value text := btrim(p_value);
  v_reason text := btrim(p_reason);
  v_evidence text := nullif(btrim(p_evidence), '');
  v_area text := nullif(btrim(p_area), '');
  v_scope jsonb;
  v_current public.standards;
  v_latest public.standard_versions;
  v_version integer;
  v_revert_to integer;
begin
  -- 1. 필수 칸 5개: 빈 칸을 한 번에 모아서 알려 줘요 (위키 관리 원칙 7)
  if nullif(v_id, '') is null then v_missing := array_append(v_missing, 'ID(id)'); end if;
  if nullif(v_title, '') is null then v_missing := array_append(v_missing, '제목(title)'); end if;
  if nullif(v_value, '') is null then v_missing := array_append(v_missing, '값(value)'); end if;
  if nullif(v_reason, '') is null then v_missing := array_append(v_missing, '이유(reason)'); end if;
  if p_always_on is null then v_missing := array_append(v_missing, '항상 적용(alwaysOn: 예/아니오)'); end if;
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

  -- 2. 저장만 하는 칸: 적용 범위는 모양만 확인하고, 비어 있으면 null로 둬요
  if not public.is_blank_scope(p_scope) then
    v_scope := public.normalize_scope(p_scope);
    if v_scope is null then
      perform public.reject(
        'VALIDATION_FAILED',
        '적용 범위는 { code, api, screen, doc } 모양이고, 각 칸은 빈칸이 아닌 글자 목록이어야 해요. 모르면 비워 두세요.'
      );
    end if;
  end if;
  if p_locked is not null and p_actor <> 'human' then
    perform public.reject('VALIDATION_FAILED', '잠금은 사람만 바꿀 수 있어요. 잠금 칸은 비워 두고 저장해 주세요.');
  end if;

  select * into v_current from public.standards where id = v_id for update;

  if not found then
    -- 3-a. 새 기준
    if p_base_version <> 0 then
      perform public.reject(
        'NOT_FOUND',
        format('기준 %s이(가) 없어요. 새 기준이면 baseVersion을 0으로, 있는 기준을 고치는 거면 search_standards로 ID를 먼저 확인해 주세요.', v_id)
      );
    end if;
    if v_id !~ '^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){2,}$' then
      perform public.reject(
        'VALIDATION_FAILED',
        format('기준 ID는 영역.주제.규칙 모양의 영어 소문자여야 해요. 예: app.notify.title-length (받은 값: %s)', v_id)
      );
    end if;
    if p_always_on then
      perform public.check_always_on_room(v_id);
    end if;
    begin
      insert into public.standards (id, area, title, always_on, locked, current_version)
      values (v_id, coalesce(v_area, split_part(v_id, '.', 1)), v_title, p_always_on, coalesce(p_locked, false), 1);
    exception when unique_violation then
      perform public.reject(
        'VERSION_CONFLICT',
        format('기준 %s을(를) 다른 사람이 방금 만들었어요. get_standard로 내용을 보고, 고칠 게 있으면 그 버전을 baseVersion으로 다시 저장해 주세요.', v_id)
      );
    end;
    v_version := 1;
  else
    -- 3-b. 새 버전
    perform public.check_editable(v_current, p_base_version, p_actor);
    select * into v_latest
    from public.standard_versions
    where standard_id = v_id and version = v_current.current_version;

    if v_latest.title = v_title and v_latest.value = v_value and v_latest.scope is not distinct from v_scope
      and (v_area is null or v_area = v_current.area)
      and p_always_on = v_current.always_on then
      perform public.reject('VALIDATION_FAILED', format('기준 %s은(는) 바뀐 내용이 없어서 새 버전을 만들지 않았어요.', v_id));
    end if;
    if p_always_on and not v_current.always_on then
      perform public.check_always_on_room(v_id);
    end if;

    v_version := v_current.current_version + 1;
    -- 앞선 버전과 값이 같아지면 되돌림으로 남겨요 (어느 버전으로 돌아갔는지 함께)
    if v_latest.value <> v_value then
      select max(version) into v_revert_to
      from public.standard_versions
      where standard_id = v_id and version < v_current.current_version and value = v_value;
    end if;

    update public.standards
    set
      title = v_title,
      area = coalesce(v_area, area),
      always_on = p_always_on,
      locked = coalesce(p_locked, locked),
      current_version = v_version,
      updated_at = now()
    where id = v_id;
  end if;

  insert into public.standard_versions (
    standard_id, version, title, value, reason, evidence, scope,
    changed_by, changed_by_actor, is_revert, reverted_to_version, source, ai_detected
  )
  values (
    v_id, v_version, v_title, v_value, v_reason, v_evidence, v_scope,
    nullif(btrim(p_changed_by), ''), p_actor, v_revert_to is not null, v_revert_to, p_source, coalesce(p_ai_detected, false)
  );

  perform public.on_standard_version_saved(v_id, v_version);

  return jsonb_build_object(
    'standardId', v_id,
    'version', v_version,
    'isRevert', v_revert_to is not null,
    'revertedToVersion', v_revert_to
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. revert_standard: 저장한 뒤 같은 자리를 불러요 (인자는 그대로)
-- ---------------------------------------------------------------------------

create or replace function public.revert_standard(
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
  if v_latest.title = v_target.title and v_latest.value = v_target.value and v_latest.scope is not distinct from v_target.scope then
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

  perform public.on_standard_version_saved(p_id, v_version);

  return jsonb_build_object(
    'standardId', p_id,
    'version', v_version,
    'isRevert', true,
    'revertedToVersion', p_to_version
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 표 4개: 이슈, 이슈와 기준 연결, 확인할 변경, 답
-- ---------------------------------------------------------------------------

create table public.issues (
  key text primary key
    constraint issues_key_format check (btrim(key) <> '' and key = btrim(key)),
  title text not null constraint issues_title_not_blank check (btrim(title) <> ''),
  assignee text constraint issues_assignee_not_blank check (assignee is null or btrim(assignee) <> ''),
  status text not null default 'in_progress' constraint issues_status check (status in ('in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.issues is
  '이슈. 이 도구 안에 미리 넣어 두는 작업 목록이에요 (Linear와 연결하지 않아요). 담당자가 없으면 알림을 만들지 않아요.';
comment on column public.issues.key is '이슈 번호 그대로. 예: #5, SIL-28';
comment on column public.issues.assignee is '담당자 이름. 사람은 이름으로만 구분해요. 없으면 null';
comment on column public.issues.status is 'in_progress(진행 중) / done(완료). 완료된 이슈에도 알림은 가요';

create table public.issue_standards (
  issue_key text not null references public.issues (key),
  standard_id text not null references public.standards (id),
  created_at timestamptz not null default now(),
  primary key (issue_key, standard_id)
);

comment on table public.issue_standards is '이슈와 기준 연결. 기준이 바뀌면 여기서 연결된 이슈를 찾아요. 이슈 하나에 기준이 1개 이상 있어요.';

create index issue_standards_standard_id on public.issue_standards (standard_id);

create table public.pending_changes (
  id uuid primary key default gen_random_uuid(),
  standard_id text not null,
  version integer not null,
  issue_key text not null references public.issues (key),
  recipient text not null constraint pending_changes_recipient_not_blank check (btrim(recipient) <> ''),
  status text not null default 'pending'
    constraint pending_changes_status check (status in ('pending', 'answered', 'superseded', 'auto_closed')),
  last_seen_version integer
    constraint pending_changes_last_seen_version check (last_seen_version is null or last_seen_version >= 1),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (standard_id, version) references public.standard_versions (standard_id, version),
  constraint pending_changes_one_per_issue unique (standard_id, version, issue_key)
);

comment on table public.pending_changes is
  '확인할 변경. 기준 버전 1개와 이슈 1개마다 한 줄이에요. 대기 / 답함 / 새 버전으로 대체됨 / 자동 닫힘';
comment on column public.pending_changes.recipient is '받는 사람 이름 (이슈 담당자). 기준을 바꾼 본인에게는 만들지 않아요';
comment on column public.pending_changes.last_seen_version is '받는 사람이 마지막으로 본 버전. 되돌려서 이 버전과 같아지면 자동으로 닫아요';

create index pending_changes_recipient_status on public.pending_changes (recipient, status);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  pending_change_id uuid not null unique references public.pending_changes (id),
  relation text not null constraint answers_relation check (relation in ('related', 'unrelated')),
  knew boolean,
  unrelated_reason text,
  channel text not null constraint answers_channel check (channel in ('terminal', 'app')),
  elapsed_seconds integer constraint answers_elapsed_seconds check (elapsed_seconds is null or elapsed_seconds >= 0),
  answered_at timestamptz not null default now(),
  constraint answers_relation_fields check (
    (relation = 'related' and knew is not null and unrelated_reason is null)
    or (relation = 'unrelated' and knew is null)
  )
);

comment on table public.answers is '답. 담당자가 답하면 생겨요. 주 지표 "몰랐다" 개수는 knew = false인 줄을 세면 돼요.';
comment on column public.answers.knew is '알았나. 관계있다일 때만 값이 있어요';
comment on column public.answers.unrelated_reason is '관계없는 이유. 관계없다일 때만 (100자 이하)';
comment on column public.answers.channel is '답한 곳: terminal(터미널) / app(앱)';
comment on column public.answers.elapsed_seconds is '알림을 열고 답할 때까지 걸린 시간(초). 보호 지표 "1분 이내"에 써요. 모르면 null';

-- ---------------------------------------------------------------------------
-- 7. save_issue: 이슈와 기준 연결을 함께 저장해요 (공용 키로 부를 수 있는 쓰기 통로)
-- ---------------------------------------------------------------------------

-- 같은 이슈 번호가 있으면 제목·담당자·상태를 바꾸고, 기준 연결은 받은 목록과 똑같이 맞춰요.
create function public.save_issue(
  p_key text default null,
  p_title text default null,
  p_standard_ids text[] default null,
  p_assignee text default null,
  p_status text default 'in_progress'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(p_key);
  v_title text := btrim(p_title);
  v_ids text[];
  v_missing text[] := '{}';
  v_unknown text[];
  v_existed boolean;
begin
  select array_agg(distinct btrim(i.item) order by btrim(i.item))
  into v_ids
  from unnest(coalesce(p_standard_ids, '{}')) as i (item)
  where nullif(btrim(i.item), '') is not null;

  if nullif(v_key, '') is null then v_missing := array_append(v_missing, '이슈 번호(key)'); end if;
  if nullif(v_title, '') is null then v_missing := array_append(v_missing, '이슈 제목(title)'); end if;
  if v_ids is null then v_missing := array_append(v_missing, '연결된 결정 사항 ID(standardIds, 1개 이상)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject('VALIDATION_FAILED', format('%s이(가) 비어 있어서 이슈를 저장하지 않았어요.', array_to_string(v_missing, ', ')));
  end if;
  if p_status is null or p_status not in ('in_progress', 'done') then
    perform public.reject(
      'VALIDATION_FAILED',
      format('이슈 상태는 in_progress(진행 중) 또는 done(완료)이어야 해요 (받은 값: %s).', coalesce(p_status, '없음'))
    );
  end if;

  select array_agg(i.id order by i.id)
  into v_unknown
  from unnest(v_ids) as i (id)
  where not exists (select 1 from public.standards as s where s.id = i.id);
  if v_unknown is not null then
    perform public.reject(
      'NOT_FOUND',
      format('이슈 %s에 연결할 결정 사항 %s이(가) 위키에 없어요. 결정 사항을 먼저 저장하거나 ID를 확인해 주세요.', v_key, array_to_string(v_unknown, ', '))
    );
  end if;

  select exists (select 1 from public.issues where key = v_key) into v_existed;

  insert into public.issues (key, title, assignee, status)
  values (v_key, v_title, nullif(btrim(p_assignee), ''), p_status)
  on conflict (key) do update
  set title = excluded.title, assignee = excluded.assignee, status = excluded.status, updated_at = now();

  delete from public.issue_standards where issue_key = v_key and standard_id <> all (v_ids);
  insert into public.issue_standards (issue_key, standard_id)
  select v_key, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;

  return jsonb_build_object('issueKey', v_key, 'created', not v_existed, 'standardIds', to_jsonb(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 권한: 새 표는 읽기만, 쓰기는 함수로만
-- ---------------------------------------------------------------------------

alter table public.issues enable row level security;
alter table public.issue_standards enable row level security;
alter table public.pending_changes enable row level security;
alter table public.answers enable row level security;

create policy "누구나 읽기" on public.issues for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.issue_standards for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.pending_changes for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.answers for select to anon, authenticated using (true);

revoke all on table public.issues, public.issue_standards, public.pending_changes, public.answers from anon, authenticated;
grant select on table public.issues, public.issue_standards, public.pending_changes, public.answers to anon, authenticated;

revoke all on function
  public.is_blank_scope(jsonb),
  public.on_standard_version_saved(text, integer),
  public.save_standard(text, text, text, text, boolean, integer, text, jsonb, text, text, text, text, boolean, boolean),
  public.save_issue(text, text, text[], text, text)
from public, anon, authenticated;

grant execute on function
  public.save_standard(text, text, text, text, boolean, integer, text, jsonb, text, text, text, text, boolean, boolean),
  public.save_issue(text, text, text[], text, text)
to anon, authenticated;
