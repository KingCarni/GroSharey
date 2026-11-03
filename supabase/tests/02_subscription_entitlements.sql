-- GroSharey subscription + entitlement regression suite.
--
-- Covers the rules in the beta subscription spec: free solo households, the $5 shared base
-- plan, $2.49 extra seats, invite gating, receipt-parsing gating, downgrade safety and
-- billing-table privileges. Run with supabase/tests/run.sh.

set client_min_messages to notice;

create or replace function test_actor(label text)
returns uuid
language plpgsql
as $fn$
declare new_id uuid;
begin
  -- handle_new_user() mirrors auth.users into public.profiles.
  insert into auth.users (email) values (label || '@example.test') returning id into new_id;
  return new_id;
end;
$fn$;

create or replace function act_as(target uuid)
returns void
language sql
as $fn$
  select set_config('test.user_id', target::text, false);
$fn$;

create or replace function set_plan(target_household uuid, owner uuid, new_status text,
                                    period_end timestamptz default null,
                                    cancelling boolean default false)
returns void
language sql
as $fn$
  insert into public.household_subscriptions (
    household_id, owner_user_id, status, stripe_customer_id, stripe_subscription_id,
    current_period_end, cancel_at_period_end
  )
  values (
    target_household, owner, new_status, 'cus_test_' || left(target_household::text, 8),
    'sub_test_' || left(target_household::text, 8), period_end, cancelling
  )
  on conflict (household_id) do update
    set status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = now();
$fn$;

create or replace function add_receipt(target_household uuid, path text)
returns uuid
language sql
as $fn$
  insert into public.receipts (household_id, storage_path, purchased_at, currency)
  values (target_household, path, now(), 'CAD')
  returning id;
$fn$;

create or replace function parse_status_of(receipt uuid)
returns text
language sql
as $fn$
  select parse_status from public.receipts where id = receipt;
$fn$;

-- Asserts that `stmt` fails. Used for the negative cases: entitlement gates are implemented
-- as exceptions in SECURITY DEFINER functions and BEFORE triggers.
create or replace function expect_raise(stmt text, label text)
returns void
language plpgsql
as $fn$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'EXPECTED FAILURE did not happen: %', label;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Free solo household
-- ---------------------------------------------------------------------------
do $t$
declare
  owner_id uuid;
  household uuid;
  s record;
  receipt uuid;
  gatecrasher uuid;
begin
  owner_id := test_actor('solo-owner');
  perform act_as(owner_id);
  household := public.create_household('Solo Household');

  select * into s from public.household_billing_summary(household);
  assert s.is_owner, 'T1: creator should be owner';
  assert s.has_access, 'T1: solo household should have access';
  assert s.status = 'inactive', 'T1: no subscription yet';
  assert s.active_members = 1, 'T1: one active member';
  assert s.included_members = 1, 'T1: free plan includes only the owner';
  assert s.extra_seats = 0, 'T1: no extra seats on free plan';
  assert s.monthly_cents = 0, 'T1: free plan costs nothing';
  assert not public.household_has_paid_plan(household), 'T1: free household is not paid';

  -- T2: free households keep full list functionality.
  insert into public.grocery_lists (household_id, name) values (household, 'Weekly shop');
  assert (select count(*) from public.grocery_lists where household_id = household) = 1,
    'T2: free household can create grocery lists';

  -- T3 (regression): an image-backed receipt from a free household must NOT enter the OCR
  -- queue. queue_receipt_for_parsing used to re-queue it as 'pending' after the entitlement
  -- trigger had already downgraded it.
  receipt := add_receipt(household, household::text || '/free.jpg');
  assert parse_status_of(receipt) = 'manual',
    'T3: free receipt must be stored as manual, not queued for paid parsing';

  -- T4: and a free user cannot flip it back to pending.
  update public.receipts set parse_status = 'pending' where id = receipt;
  assert parse_status_of(receipt) = 'manual',
    'T4: free household cannot re-queue a receipt for paid parsing';

  -- T5/T6: invite creation is blocked on the free plan through both RPC routes.
  perform expect_raise(
    format('select public.owner_create_household_invite(%L)', household),
    'T5: free owner_create_household_invite');
  perform expect_raise(
    format('select public.create_household_invite(%L)', household),
    'T6: free create_household_invite (direct RPC bypass)');

  -- T7: and a direct membership insert cannot add a second active member either.
  gatecrasher := test_actor('gatecrasher');
  perform expect_raise(
    format('insert into public.household_memberships (household_id, user_id, role, status) '
           || 'values (%L, %L, ''member'', ''active'')', household, gatecrasher),
    'T7: direct membership insert on free plan');

  raise notice 'PASS free solo household (T1-T7)';
end
$t$;

-- ---------------------------------------------------------------------------
-- Paid shared household and seat pricing
-- ---------------------------------------------------------------------------
do $t$
declare
  owner_id uuid;
  second_id uuid;
  third_id uuid;
  fourth_id uuid;
  household uuid;
  code text;
  s record;
  receipt uuid;
begin
  owner_id := test_actor('paid-owner');
  perform act_as(owner_id);
  household := public.create_household('Shared Household');

  perform set_plan(household, owner_id, 'active', now() + interval '30 days');
  assert public.household_has_paid_plan(household), 'T8: active subscription is a paid plan';

  select * into s from public.household_billing_summary(household);
  assert s.status = 'active', 'T8: status active';
  assert s.included_members = 2, 'T8: paid plan includes two members';
  assert s.extra_seats = 0, 'T8: two members use no extra seats';
  assert s.monthly_cents = 500, 'T8: base plan is $5.00';

  -- T9: owner can now mint an invite, and a second member joins at the same price.
  code := public.owner_create_household_invite(household);
  assert code is not null, 'T9: paid owner can create an invite';
  second_id := test_actor('member-two');
  perform act_as(second_id);
  assert public.accept_household_invite(code) = household, 'T9: invite redeems into household';

  perform act_as(owner_id);
  select * into s from public.household_billing_summary(household);
  assert s.active_members = 2, 'T9: two active members';
  assert s.extra_seats = 0, 'T9: second member is included';
  assert s.monthly_cents = 500, 'T9: still $5.00/month with two members';

  -- T10: a used invite code cannot be redeemed twice.
  third_id := test_actor('member-three');
  perform act_as(third_id);
  perform expect_raise(format('select public.accept_household_invite(%L)', code),
    'T10: invite code reuse');

  -- T11: third active member -> one extra seat -> $7.49.
  perform act_as(owner_id);
  code := public.owner_create_household_invite(household);
  perform act_as(third_id);
  perform public.accept_household_invite(code);
  perform act_as(owner_id);
  select * into s from public.household_billing_summary(household);
  assert s.active_members = 3, 'T11: three active members';
  assert s.extra_seats = 1, 'T11: one extra seat';
  assert s.monthly_cents = 749, 'T11: $7.49/month';
  assert (select extra_seat_count from public.household_subscriptions where household_id = household) = 1,
    'T11: cached seat count refreshed by trigger';

  -- T12: fourth active member -> two extra seats -> $9.98.
  code := public.owner_create_household_invite(household);
  fourth_id := test_actor('member-four');
  perform act_as(fourth_id);
  perform public.accept_household_invite(code);
  perform act_as(owner_id);
  select * into s from public.household_billing_summary(household);
  assert s.active_members = 4, 'T12: four active members';
  assert s.extra_seats = 2, 'T12: two extra seats';
  assert s.monthly_cents = 998, 'T12: $9.98/month';

  -- T13: removing a member reduces the billable quantity again.
  update public.household_memberships set status = 'removed'
  where household_id = household and user_id = fourth_id;
  select * into s from public.household_billing_summary(household);
  assert s.active_members = 3, 'T13: member removal drops active count';
  assert s.extra_seats = 1, 'T13: member removal drops extra seats';
  assert s.monthly_cents = 749, 'T13: billing falls back to $7.49';
  assert (select active_member_count from public.household_subscriptions where household_id = household) = 3,
    'T13: cached active_member_count refreshed by trigger';

  -- T14: paid households do queue receipts for AI parsing.
  receipt := add_receipt(household, household::text || '/paid.jpg');
  assert parse_status_of(receipt) = 'pending',
    'T14: paid household queues receipts for parsing';

  -- T15: a non-owner member can never mint invites.
  perform act_as(second_id);
  assert not public.is_household_owner(household), 'T15: member is not owner';
  perform expect_raise(format('select public.owner_create_household_invite(%L)', household),
    'T15: member invite creation');
  perform expect_raise(format('select public.create_household_invite(%L)', household),
    'T15: member direct invite creation');

  raise notice 'PASS paid shared household (T8-T15)';
end
$t$;

-- ---------------------------------------------------------------------------
-- Downgrade / cancellation safety
-- ---------------------------------------------------------------------------
do $t$
declare
  owner_id uuid;
  household uuid;
  parsed_receipt uuid;
  queued_receipt uuid;
  later_receipt uuid;
  item_count integer;
begin
  owner_id := test_actor('lapsing-owner');
  perform act_as(owner_id);
  household := public.create_household('Lapsing Household');
  perform set_plan(household, owner_id, 'active', now() + interval '30 days');

  -- A parsed receipt with line items, plus one still waiting in the queue.
  parsed_receipt := add_receipt(household, household::text || '/parsed.jpg');
  update public.receipts
  set parse_status = 'complete', parse_confidence = 0.9, parsed_at = now(),
      store_name = 'Test Mart', total_amount = 42.50
  where id = parsed_receipt;
  insert into public.receipt_items (receipt_id, household_id, line_number, raw_name, line_total, confidence)
  values (parsed_receipt, household, 1, 'MILK 2L', 4.99, 0.95);

  queued_receipt := add_receipt(household, household::text || '/queued.jpg');
  assert parse_status_of(queued_receipt) = 'pending', 'T16: receipt queued while paid';

  -- T17: cancel_at_period_end keeps the entitlement until the period actually ends.
  perform set_plan(household, owner_id, 'active', now() + interval '10 days', true);
  assert public.household_has_paid_plan(household),
    'T17: cancel_at_period_end keeps access until period end';

  -- T18: once Stripe reports canceled and the period has passed, the plan is gone, but a
  -- one-person household still has baseline (free) access to the app.
  perform set_plan(household, owner_id, 'canceled', now() - interval '1 day', true);
  assert not public.household_has_paid_plan(household), 'T18: expired subscription is not paid';
  assert public.household_has_access(household),
    'T18: single-member household keeps baseline free access';

  -- T19: receipt history and already-parsed items survive the downgrade.
  assert parse_status_of(parsed_receipt) = 'complete',
    'T19: parsed receipt keeps its parsed state after cancellation';
  select count(*) into item_count from public.receipt_items where receipt_id = parsed_receipt;
  assert item_count = 1, 'T19: parsed line items are preserved after cancellation';
  assert (select total_amount from public.receipts where id = parsed_receipt) = 42.50,
    'T19: receipt totals are preserved after cancellation';

  -- T20: manual editing of existing receipts and items still works for a lapsed household.
  update public.receipt_items set line_total = 5.49 where receipt_id = parsed_receipt;
  assert (select line_total from public.receipt_items where receipt_id = parsed_receipt) = 5.49,
    'T20: manual receipt-item editing still works after cancellation';
  update public.receipts set store_name = 'Edited Mart' where id = parsed_receipt;
  assert (select store_name from public.receipts where id = parsed_receipt) = 'Edited Mart',
    'T20: manual receipt editing still works after cancellation';

  -- T21: a receipt uploaded after the lapse is not queued for paid parsing.
  later_receipt := add_receipt(household, household::text || '/after.jpg');
  assert parse_status_of(later_receipt) = 'manual',
    'T21: receipt uploaded after cancellation is manual';

  -- T22: the previously queued receipt must not stay queued and burn OCR budget. The
  -- entitlement trigger downgrades it as soon as anything touches parse_status, and
  -- process-receipts re-checks household_has_paid_plan before spending OCR/AI calls.
  update public.receipts set parse_status = 'pending' where id = queued_receipt;
  assert parse_status_of(queued_receipt) = 'manual',
    'T22: previously queued receipt cannot be re-queued once unpaid';

  -- T23: sharing is revoked for new joins once the plan lapses.
  perform expect_raise(format('select public.owner_create_household_invite(%L)', household),
    'T23: invite creation after cancellation');

  raise notice 'PASS downgrade / cancellation safety (T16-T23)';
end
$t$;

-- ---------------------------------------------------------------------------
-- Subscription status matrix
-- ---------------------------------------------------------------------------
do $t$
declare
  owner_id uuid;
  household uuid;
begin
  owner_id := test_actor('comped-owner');
  perform act_as(owner_id);
  household := public.create_household('Comped Household');

  -- T24: comped households are paid; an expired comp is not.
  perform set_plan(household, owner_id, 'comped', null, false);
  update public.household_subscriptions set comped_until = now() + interval '30 days'
  where household_id = household;
  assert public.household_has_paid_plan(household), 'T24: active comp is a paid plan';

  update public.household_subscriptions set comped_until = now() - interval '1 day'
  where household_id = household;
  assert not public.household_has_paid_plan(household), 'T24: expired comp is not a paid plan';

  -- T25: past_due keeps access during Stripe dunning.
  perform set_plan(household, owner_id, 'past_due', now() + interval '5 days');
  assert public.household_has_paid_plan(household), 'T25: past_due keeps access while dunning';

  -- T26: unpaid / inactive / checkout_pending do not.
  perform set_plan(household, owner_id, 'unpaid', now() - interval '1 day');
  assert not public.household_has_paid_plan(household), 'T26: unpaid is not a paid plan';
  perform set_plan(household, owner_id, 'inactive', null);
  assert not public.household_has_paid_plan(household), 'T26: inactive is not a paid plan';
  perform set_plan(household, owner_id, 'checkout_pending', null);
  assert not public.household_has_paid_plan(household), 'T26: checkout_pending is not a paid plan';

  raise notice 'PASS subscription status matrix (T24-T26)';
end
$t$;

-- ---------------------------------------------------------------------------
-- Billing privileges, RLS and the webhook ledger
-- ---------------------------------------------------------------------------
do $t$
declare
  owner_id uuid;
  outsider_id uuid;
  household uuid;
  visible integer;
begin
  owner_id := test_actor('rls-owner');
  perform act_as(owner_id);
  household := public.create_household('RLS Household');
  perform set_plan(household, owner_id, 'active', now() + interval '30 days');
  outsider_id := test_actor('rls-outsider');

  -- T27: billing rows are readable by members only, and writable by nobody but the service role.
  assert exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'household_subscriptions' and cmd = 'SELECT'
  ), 'T27: household_subscriptions has a select policy';
  assert not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'household_subscriptions'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ), 'T27: clients must not be able to write household_subscriptions';
  assert (select relrowsecurity from pg_class where oid = 'public.household_subscriptions'::regclass),
    'T27: RLS is enabled on household_subscriptions';

  -- T28: the webhook ledger is service-role only.
  assert (select relrowsecurity from pg_class where oid = 'public.stripe_webhook_events'::regclass),
    'T28: RLS is enabled on stripe_webhook_events';
  assert not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'stripe_webhook_events'
  ), 'T28: stripe_webhook_events exposes no client policies';

  -- T30: duplicate Stripe webhook deliveries are rejected by the ledger primary key.
  insert into public.stripe_webhook_events (id, type) values ('evt_duplicate', 'customer.subscription.updated');
  perform expect_raise(
    'insert into public.stripe_webhook_events (id, type) values (''evt_duplicate'', ''customer.subscription.updated'')',
    'T30: duplicate webhook event id');

  raise notice 'PASS billing privileges and webhook ledger (T27-T28, T30)';
end
$t$;

-- T29 runs outside a DO block so `set role` applies the same way PostgREST applies it.
insert into public.stripe_webhook_events (id, type) values ('evt_rls_probe', 'probe');
do $t$
declare
  owner_id uuid;
  household uuid;
begin
  owner_id := test_actor('rls2-owner');
  perform act_as(owner_id);
  household := public.create_household('RLS Probe Household');
  perform set_plan(household, owner_id, 'active', now() + interval '30 days');
  perform set_config('test.household_id', household::text, false);
  perform set_config('test.owner_id', owner_id::text, false);
  perform set_config('test.outsider_id', test_actor('rls2-outsider')::text, false);
end
$t$;

begin;
set local role authenticated;
select act_as(current_setting('test.outsider_id')::uuid);
do $t$
declare visible integer;
begin
  select count(*) into visible from public.household_subscriptions
  where household_id = current_setting('test.household_id')::uuid;
  assert visible = 0, 'T29: non-members cannot read household billing rows';
end
$t$;
select act_as(current_setting('test.owner_id')::uuid);
do $t$
declare visible integer;
begin
  select count(*) into visible from public.household_subscriptions
  where household_id = current_setting('test.household_id')::uuid;
  assert visible = 1, 'T29: members can read their own household billing row';

  -- A member must not be able to grant themselves a plan.
  begin
    update public.household_subscriptions set status = 'active'
    where household_id = current_setting('test.household_id')::uuid;
    if found then
      raise exception 'T29: client role was able to write household_subscriptions';
    end if;
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'PASS household_subscriptions RLS as authenticated role (T29)';
end
$t$;
reset role;
commit;

-- ---------------------------------------------------------------------------
-- Trigger ordering guard for the original defect
-- ---------------------------------------------------------------------------
do $t$
declare last_before_trigger text;
begin
  -- The entitlement trigger must still fire last among BEFORE-row triggers on receipts,
  -- otherwise queue_receipt_for_parsing can re-queue free receipts. PostgreSQL fires
  -- same-event row triggers in alphabetical order by name.
  select tgname into last_before_trigger
  from pg_trigger
  where tgrelid = 'public.receipts'::regclass
    and not tgisinternal
    and (tgtype & 2) = 2
  order by tgname desc
  limit 1;

  assert last_before_trigger = 'zz_enforce_receipt_parse_entitlement',
    'T31: the parse-entitlement trigger must sort last among receipts BEFORE triggers, got '
      || coalesce(last_before_trigger, '<none>');

  raise notice 'PASS trigger ordering guard (T31)';
end
$t$;

select 'ALL SUBSCRIPTION ENTITLEMENT TESTS PASSED' as result;
