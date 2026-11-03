import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID')!;
const extraSeatPriceId = Deno.env.get('STRIPE_EXTRA_SEAT_PRICE_ID')!;

type SupabaseClient = ReturnType<typeof createClient>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyStripeSignature(payload: string, signatureHeader: string) {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = hex(digest);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

async function stripeGet(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return payload;
}

function mapStatus(status: string) {
  if (['trialing', 'active', 'past_due', 'canceled', 'unpaid'].includes(status)) return status;
  return 'inactive';
}

function periodEndIso(subscription: Record<string, unknown>) {
  // `current_period_end` moved from the subscription to its items in newer Stripe API
  // versions, so read whichever the account's pinned version returns.
  const items = (subscription.items as { data?: { current_period_end?: number }[] } | undefined)?.data ?? [];
  const seconds = Number(
    subscription.current_period_end
      ?? items.map((item) => item.current_period_end).filter((value): value is number => Number.isFinite(value))
        .sort((a, b) => b - a)[0],
  );
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Writes the household's billing row from Stripe's *current* state for a subscription id.
 *
 * Every handled event funnels through here, so duplicate deliveries converge on the same
 * result and an out-of-order delivery (e.g. `subscription.deleted` arriving before a delayed
 * `checkout.session.completed`) can no longer resurrect a cancelled subscription: we never
 * trust the status carried in the event payload, only what Stripe reports right now.
 */
async function syncSubscription(supabase: SupabaseClient, subscriptionId: string, fallback?: {
  householdId?: string | null;
  ownerUserId?: string | null;
}) {
  const subscription = await stripeGet(`/subscriptions/${subscriptionId}?expand[]=items.data.price`);
  if (!subscription) return { synced: false, reason: 'subscription no longer exists' };

  const householdId = subscription.metadata?.household_id ?? fallback?.householdId ?? null;
  const ownerUserId = subscription.metadata?.owner_user_id ?? fallback?.ownerUserId ?? null;
  if (!householdId || !ownerUserId) return { synced: false, reason: 'missing household metadata' };

  const items: { id?: string; quantity?: number; price?: { id?: string } }[] = subscription.items?.data ?? [];
  const baseItem = items.find((item) => item.price?.id === basePriceId);
  const extraItem = items.find((item) => item.price?.id === extraSeatPriceId);

  // The billable seat count comes from Stripe; the *actual* member count stays owned by the
  // database (household_memberships + refresh_household_subscription_seats), so the cached
  // figure the billing screen shows is never inflated by Stripe's two included seats.
  const { count: activeMembers } = await supabase
    .from('household_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'active');

  const update: Record<string, unknown> = {
    household_id: householdId,
    owner_user_id: ownerUserId,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    stripe_base_item_id: baseItem?.id ?? null,
    stripe_extra_item_id: extraItem?.id ?? null,
    status: mapStatus(subscription.status),
    extra_seat_count: Number(extraItem?.quantity ?? 0),
    current_period_end: periodEndIso(subscription),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
  if (typeof activeMembers === 'number') update.active_member_count = activeMembers;

  const { error } = await supabase.from('household_subscriptions').upsert(update);
  if (error) throw new Error(error.message);

  return { synced: true, household_id: householdId, status: update.status };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) return json({ error: 'Webhook secrets missing.' }, 500);

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!(await verifyStripeSignature(rawBody, signature))) return json({ error: 'Invalid Stripe signature.' }, 400);

  const event = JSON.parse(rawBody);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Idempotency: Stripe retries deliveries and can deliver the same event more than once.
  if (typeof event.id === 'string') {
    const { data: seen } = await supabase
      .from('stripe_webhook_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();
    if (seen) return json({ received: true, duplicate: true });
  }

  try {
    let result: unknown = { handled: false };

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      // Asynchronous payment methods complete the session before the money arrives; only a
      // paid (or zero-amount) session may activate the household.
      const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
      if (subscriptionId && paid) {
        result = await syncSubscription(supabase, subscriptionId, {
          householdId: session.metadata?.household_id ?? session.client_reference_id,
          ownerUserId: session.metadata?.owner_user_id,
        });
      } else {
        result = { synced: false, reason: `session not paid (payment_status=${session.payment_status})` };
      }
    }

    if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
    ) {
      const incoming = event.data.object;
      if (event.type === 'customer.subscription.deleted') {
        // A deleted subscription can no longer be read back from Stripe in a useful state,
        // so take the terminal status straight from the (signature-verified) event.
        const householdId = incoming.metadata?.household_id;
        const ownerUserId = incoming.metadata?.owner_user_id;
        if (householdId && ownerUserId) {
          const { error } = await supabase.from('household_subscriptions').upsert({
            household_id: householdId,
            owner_user_id: ownerUserId,
            stripe_subscription_id: incoming.id,
            status: 'canceled',
            cancel_at_period_end: Boolean(incoming.cancel_at_period_end),
            current_period_end: periodEndIso(incoming),
            updated_at: new Date().toISOString(),
          });
          if (error) throw new Error(error.message);
          result = { synced: true, household_id: householdId, status: 'canceled' };
        }
      } else {
        result = await syncSubscription(supabase, incoming.id);
      }
    }

    if (
      event.type === 'invoice.payment_failed'
      || event.type === 'invoice.payment_succeeded'
      || event.type === 'invoice.paid'
    ) {
      const invoice = event.data.object;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (subscriptionId) result = await syncSubscription(supabase, subscriptionId);
    }

    // Recorded only after successful processing, so a transient failure still gets retried.
    if (typeof event.id === 'string') {
      await supabase.from('stripe_webhook_events').upsert({ id: event.id, type: String(event.type ?? 'unknown') });
    }

    return json({ received: true, result });
  } catch (error) {
    // Non-2xx makes Stripe retry with backoff.
    return json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, 500);
  }
});
