-- 반영함 표시 (data.pending.reflected, notify.check.reflected, SIL-73)
--
-- 담당자는 답한 확인할 변경에 "반영했다"고 표시할 수 있어요. 에이전트를 거치지 않고 끝낸 작업도 기록하려고요.
-- 확인할 변경에 반영함(예/아니오)과 반영한 시각을 저장하고, 켜고 끄는 일은 save_reflected 함수로만 해요.
-- 표시를 풀어도 이슈를 다시 열지 않아요. 이 함수는 이슈를 건드리지 않아요.
-- 이미 올린 마이그레이션은 고치지 않아요.

alter table public.pending_checks
  add column reflected boolean not null default false,
  add column reflected_at timestamptz,
  add constraint pending_checks_reflected_at check (reflected = (reflected_at is not null));

comment on column public.pending_checks.reflected is
  '반영함. 받은 사람이 답한 뒤 반영했다고 표시하면 true예요 (data.pending.reflected). save_reflected로만 바꿔요';
comment on column public.pending_checks.reflected_at is
  '반영했다고 표시한 시각. 표시하지 않았거나 풀었으면 null이에요';

-- 반영함을 켜거나 꺼요. 받은 사람만, 답한(answered) 확인할 변경에만 할 수 있어요 (notify.check.reflected).
-- 이미 켜져 있는데 다시 켜면 처음 표시한 시각을 그대로 둬요.
create function public.save_reflected(
  p_pending_check_id uuid default null,
  p_marked_by text default null,
  p_reflected boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_by text := nullif(btrim(p_marked_by), '');
  v_check public.pending_checks;
begin
  if p_pending_check_id is null then v_missing := array_append(v_missing, '확인할 변경(pendingCheckId)'); end if;
  if v_by is null then v_missing := array_append(v_missing, '표시한 사람(markedBy)'); end if;
  if p_reflected is null then v_missing := array_append(v_missing, '반영함(reflected: 예/아니오)'); end if;
  if cardinality(v_missing) > 0 then
    perform public.reject('VALIDATION_FAILED', format('%s이(가) 비어 있어서 반영함을 저장하지 않았어요.', array_to_string(v_missing, ', ')));
  end if;

  select * into v_check from public.pending_checks where id = p_pending_check_id for update;
  if v_check.id is null then
    perform public.reject('NOT_FOUND', format('확인할 변경 %s이(가) 없어요.', p_pending_check_id));
  end if;
  if v_check.recipient is distinct from v_by then
    perform public.reject(
      'FORBIDDEN',
      format('이 확인할 변경은 %s님에게 온 거예요. 받은 사람만 반영함을 표시할 수 있어요.', coalesce(v_check.recipient, '담당자 없음'))
    );
  end if;
  if v_check.status <> 'answered' then
    perform public.reject(
      'VALIDATION_FAILED',
      format(
        '답한 확인할 변경에만 반영함을 표시할 수 있어요 (지금 상태: %s).',
        case v_check.status when 'pending' then '대기, 먼저 답해 주세요' when 'superseded' then '대체됨' when 'auto_closed' then '자동 닫힘' else v_check.status end
      )
    );
  end if;

  update public.pending_checks
  set reflected = p_reflected,
      reflected_at = case when p_reflected then coalesce(reflected_at, now()) end
  where id = v_check.id
  returning * into v_check;

  return jsonb_build_object(
    'pendingCheckId', v_check.id,
    'reflected', v_check.reflected,
    'reflectedAt', v_check.reflected_at
  );
end;
$$;

revoke all on function public.save_reflected(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.save_reflected(uuid, text, boolean) to anon, authenticated;
