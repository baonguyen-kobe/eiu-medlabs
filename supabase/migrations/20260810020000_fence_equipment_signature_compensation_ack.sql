create or replace function public.ack_equipment_signature_cleanup(
  target_operation_id uuid,
  target_claim_token uuid,
  target_outcome text,
  target_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.equipment_signature_operations;
begin
  if target_operation_id is null
    or target_claim_token is null
    or target_outcome not in ('deleted', 'missing', 'retry')
    or length(coalesce(target_error, '')) > 500 then
    raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_INPUT_INVALID' using errcode = '22023';
  end if;

  select *
  into operation_row
  from public.equipment_signature_operations
  where id = target_operation_id
  for update;

  if operation_row.id is null
    or operation_row.cleanup_state <> 'claimed'
    or operation_row.cleanup_claim_token <> target_claim_token then
    raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_CLAIM_REQUIRED' using errcode = '42501';
  end if;

  update public.equipment_signature_operations
  set cleanup_state = target_outcome,
      cleanup_claim_token = null,
      cleanup_completed_at = case
        when target_outcome in ('deleted', 'missing') then clock_timestamp()
        else null
      end,
      cleanup_last_error = case
        when target_outcome = 'retry' then target_error
        else null
      end,
      cleanup_compensation_required_at = case
        when target_outcome = 'retry' then cleanup_compensation_required_at
        when cleanup_compensation_required_at is not null
          and cleanup_compensation_required_at > operation_row.cleanup_claimed_at
          then cleanup_compensation_required_at
        else null
      end
  where id = operation_row.id;
end;
$$;
