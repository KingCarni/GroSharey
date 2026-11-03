-- GroSharey subscription QA hardening.
--
-- Fixes found while QA'ing the free-solo / paid-sharing entitlement model:
--   1. queue_receipt_for_parsing ran AFTER enforce_receipt_parse_entitlement (BEFORE-row
--      triggers fire in alphabetical order: 'e' < 'q'), so it re-queued every image-backed
--      receipt as 'pending' and free households were billed OCR/AI work.
--   2. create_household_invite is still granted to authenticated, so the paid-plan check that
--      20260822033000 added only to owner_create_household_invite could be bypassed by
--      calling the underlying RPC directly.
--   3. household_subscriptions was never added to supabase_realtime, so the app never saw a
--      webhook-driven status change (returning from Stripe Checkout did not refresh billing).
--   4. Concurrent invite redemptions evaluated the sharing entitlement without serialization.
--   5. Stripe webhooks had no delivery-id ledger, so duplicate/replayed events were reprocessed.

-- 1. Receipt queueing now respects the entitlement itself, so ordering no longer matters.
create or replace function public.queue_receipt_for_parsing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.storage_path is not null then
    if public.household_has_paid_plan(new.household_id) then
      new.parse_status := 'pending';
    else
      -- Free households keep the receipt image and manual totals, but never enter the
      -- OCR/AI queue. parse_status 'manual' is the documented free-tier terminal state.
      new.parse_status := 'manual';
      new.parse_confidence := null;
    end if;
    new.parse_error := null;
    new.parsed_at := null;
  end if;
  return new;
end;
$$;

-- Belt and braces: keep the entitlement trigger but make it sort last so it always has the
-- final word on parse_status regardless of what other BEFORE triggers do.
drop trigger if exists enforce_receipt_parse_entitlement on public.receipts;
drop trigger if exists zz_enforce_receipt_parse_entitlement on public.receipts;
create trigger zz_enforce_receipt_parse_entitlement
before insert or update of parse_status, household_id on public.receipts
for each row execute function public.enforce_receipt_parse_entitlement();

-- Re-run the backfill: rows queued between 20260822033000 and this migration slipped through
-- because queue_receipt_for_parsing overwrote the downgrade.
update public.receipts r
set parse_status = 'manual',
    parse_error = null,
    parse_confidence = null,
    parsed_at = null
where r.parse_status in ('pending', 'processing')
  and not public.household_has_paid_plan(r.household_id);

-- 2. Enforce the paid entitlement in the base invite RPC, not only in the owner wrapper.
create or replace function public.create_household_invite(target_household_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare generated_code text;
begin
  if not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can invite members';
  end if;

  if not public.household_has_paid_plan(target_household_id) then
    raise exception 'Upgrade to GroSharey Shared before inviting another member';
  end if;

  generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.household_invites (household_id, code, created_by)
  values (target_household_id, generated_code, auth.uid());

  return generated_code;
end;
$$;

grant execute on function public.create_household_invite(uuid) to authenticated;

-- 3. Let the client see subscription status changes pushed by the Stripe webhook.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_subscriptions'
  ) then
    alter publication supabase_realtime add table public.household_subscriptions;
  end if;
end $$;

-- 4. Serialize membership activation per household so two invites redeemed at the same instant
--    cannot both read a stale entitlement/seat picture.
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

  perform pg_advisory_xact_lock(hashtextextended(new.household_id::text, 0));

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

-- 5. Stripe delivery ledger for webhook idempotency. Service role only; no client policies.
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

create index if not exists stripe_webhook_events_processed_idx
  on public.stripe_webhook_events(processed_at desc);
