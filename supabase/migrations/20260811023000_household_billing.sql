-- GroSharey household billing.
-- One household owner pays. Base plan includes 2 active members; each additional active member is an extra seat.

create table if not exists public.household_subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  status text not null default 'inactive' check (status in ('inactive','checkout_pending','trialing','active','past_due','canceled','unpaid','comped')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_base_item_id text,
  stripe_extra_item_id text,
  active_member_count integer not null default 1 check (active_member_count >= 0),
  extra_seat_count integer not null default 0 check (extra_seat_count >= 0),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  comped_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_subscriptions_owner_idx
  on public.household_subscriptions(owner_user_id);

alter table public.household_subscriptions enable row level security;

drop policy if exists household_subscriptions_select on public.household_subscriptions;
create policy household_subscriptions_select on public.household_subscriptions
for select to authenticated
using (public.is_household_member(household_id));

-- Subscription writes remain service-role only via Edge Functions/webhooks.

create or replace function public.household_owner(target_household_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hm.user_id
  from public.household_memberships hm
  where hm.household_id = target_household_id
    and hm.status = 'active'
    and hm.role = 'owner'
  order by hm.created_at
  limit 1;
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.household_owner(target_household_id) = auth.uid();
$$;

create or replace function public.household_active_member_count(target_household_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.household_memberships hm
  where hm.household_id = target_household_id
    and hm.status = 'active';
$$;

create or replace function public.household_extra_seat_count(target_household_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.household_active_member_count(target_household_id) - 2, 0);
$$;

create or replace function public.household_has_access(target_household_id uuid)
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

  -- Safe rollout: existing households remain usable until an owner starts billing.
  if not found then return true; end if;

  if sub.status = 'comped' and (sub.comped_until is null or sub.comped_until > now()) then
    return true;
  end if;

  return sub.status in ('trialing','active')
    or (sub.cancel_at_period_end and sub.current_period_end is not null and sub.current_period_end > now());
end;
$$;

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
    2,
    public.household_extra_seat_count(target_household_id),
    500 + (public.household_extra_seat_count(target_household_id) * 249),
    hs.current_period_end,
    coalesce(hs.cancel_at_period_end, false)
  from (select 1) seed
  left join public.household_subscriptions hs on hs.household_id = target_household_id;
$$;

grant execute on function public.household_billing_summary(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- Keep cached seat counts current whenever membership changes. Stripe quantity is reconciled
-- by sync-stripe-seats after joins and whenever the billing screen is opened.
create or replace function public.refresh_household_subscription_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  member_count integer;
begin
  target_id := coalesce(new.household_id, old.household_id);
  member_count := public.household_active_member_count(target_id);
  update public.household_subscriptions
  set active_member_count = member_count,
      extra_seat_count = greatest(member_count - 2, 0),
      updated_at = now()
  where household_id = target_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_household_subscription_seats on public.household_memberships;
create trigger refresh_household_subscription_seats
after insert or update or delete on public.household_memberships
for each row execute function public.refresh_household_subscription_seats();
