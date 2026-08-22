-- GroSharey entitlement model:
-- - One-person households are free.
-- - A paid base subscription ($5/month) unlocks sharing with one additional member
--   and AI receipt parsing.
-- - Each active member beyond the included second member is an extra Stripe seat.

create or replace function public.household_has_paid_plan(target_household_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sub public.household_subscriptions%rowtype;
begin
  select * into sub
  from public.household_subscriptions
  where household_id = target_household_id;

  if not found then return false; end if;

  if sub.status = 'comped' and (sub.comped_until is null or sub.comped_until > now()) then
    return true;
  end if;

  if sub.status in ('trialing', 'active', 'past_due') then
    return true;
  end if;

  return sub.cancel_at_period_end
    and sub.current_period_end is not null
    and sub.current_period_end > now();
end;
$$;

grant execute on function public.household_has_paid_plan(uuid) to authenticated, service_role;

create or replace function public.household_has_access(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.household_active_member_count(target_household_id) <= 1
    or public.household_has_paid_plan(target_household_id);
$$;

grant execute on function public.household_has_access(uuid) to authenticated, service_role;

create or replace function public.household_billing_summary(target_household_id uuid)
returns table (
  is_owner boolean,
  has_access boolean,
  status text,
  active_members integer,
  included_members integer,
  extra_seats integer,
  monthly_cents integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_household_owner(target_household_id),
    public.household_has_access(target_household_id),
    coalesce(hs.status, 'inactive'),
    public.household_active_member_count(target_household_id),
    case when public.household_has_paid_plan(target_household_id) then 2 else 1 end,
    case
      when public.household_has_paid_plan(target_household_id)
        then public.household_extra_seat_count(target_household_id)
      else 0
    end,
    case
      when public.household_has_paid_plan(target_household_id)
        then 500 + (public.household_extra_seat_count(target_household_id) * 249)
      else 0
    end,
    hs.current_period_end,
    coalesce(hs.cancel_at_period_end, false)
  from (select 1) seed
  left join public.household_subscriptions hs on hs.household_id = target_household_id;
$$;

grant execute on function public.household_billing_summary(uuid) to authenticated;

create or replace function public.owner_create_household_invite(target_household_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can create invite codes';
  end if;

  if not public.household_has_paid_plan(target_household_id) then
    raise exception 'Upgrade to GroSharey Shared before inviting another member';
  end if;

  return public.create_household_invite(target_household_id);
end;
$$;

grant execute on function public.owner_create_household_invite(uuid) to authenticated;

create or replace function public.enforce_paid_household_sharing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_active integer;
begin
  if new.status <> 'active' then return new; end if;

  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  select count(*)::integer into existing_active
  from public.household_memberships hm
  where hm.household_id = new.household_id
    and hm.status = 'active'
    and (new.id is null or hm.id <> new.id);

  -- The first active member (the owner) is always free.
  if existing_active >= 1 and not public.household_has_paid_plan(new.household_id) then
    raise exception 'This household needs an active GroSharey Shared subscription before another member can join';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_paid_household_sharing on public.household_memberships;
create trigger enforce_paid_household_sharing
before insert or update of status on public.household_memberships
for each row execute function public.enforce_paid_household_sharing();

-- Free users may still upload/store receipts and enter totals manually. Expensive OCR/AI
-- parsing is converted to a manual receipt unless the household has a paid entitlement.
alter table public.receipts drop constraint if exists receipts_parse_status_check;
alter table public.receipts
  add constraint receipts_parse_status_check
  check (parse_status in ('manual', 'pending', 'processing', 'complete', 'parsed', 'failed', 'error'));

create or replace function public.enforce_receipt_parse_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parse_status = 'pending' and not public.household_has_paid_plan(new.household_id) then
    new.parse_status := 'manual';
    new.parse_error := null;
    new.parse_confidence := null;
    new.parsed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_receipt_parse_entitlement on public.receipts;
create trigger enforce_receipt_parse_entitlement
before insert or update of parse_status, household_id on public.receipts
for each row execute function public.enforce_receipt_parse_entitlement();

-- Prevent old queued rows from consuming OCR/AI after this migration is applied.
update public.receipts r
set parse_status = 'manual',
    parse_error = null,
    parse_confidence = null,
    parsed_at = null
where r.parse_status = 'pending'
  and not public.household_has_paid_plan(r.household_id);
