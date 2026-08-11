import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID')!;
const extraSeatPriceId = Deno.env.get('STRIPE_EXTRA_SEAT_PRICE_ID')!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
  return signatures.some((signature) => signature.length === expected.length && signature === expected);
}

async function stripeGet(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  return payload;
}

function mapStatus(status: string) {
  if (['trialing', 'active', 'past_due', 'canceled', 'unpaid'].includes(status)) return status;
  return status === 'incomplete' || status === 'incomplete_expired' ? 'inactive' : 'inactive';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) return json({ error: 'Webhook secrets missing.' }, 500);

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!(await verifyStripeSignature(rawBody, signature))) return json({ error: 'Invalid Stripe signature.' }, 400);

  const event = JSON.parse(rawBody);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const householdId = session.metadata?.household_id ?? session.client_reference_id;
      const ownerUserId = session.metadata?.owner_user_id;
      if (householdId && ownerUserId && session.subscription) {
        await supabase.from('household_subscriptions').upsert({
          household_id: householdId,
          owner_user_id: ownerUserId,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          status: 'active',
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const incoming = event.data.object;
      const subscription = await stripeGet(`/subscriptions/${incoming.id}?expand[]=items.data.price`);
      const householdId = subscription.metadata?.household_id;
      const ownerUserId = subscription.metadata?.owner_user_id;
      if (householdId && ownerUserId) {
        const items = subscription.items?.data ?? [];
        const baseItem = items.find((item: { price?: { id?: string } }) => item.price?.id === basePriceId);
        const extraItem = items.find((item: { price?: { id?: string } }) => item.price?.id === extraSeatPriceId);
        const memberCount = 2 + Number(extraItem?.quantity ?? 0);
        await supabase.from('household_subscriptions').upsert({
          household_id: householdId,
          owner_user_id: ownerUserId,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
          stripe_subscription_id: subscription.id,
          stripe_base_item_id: baseItem?.id ?? null,
          stripe_extra_item_id: extraItem?.id ?? null,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(subscription.status),
          active_member_count: memberCount,
          extra_seat_count: Number(extraItem?.quantity ?? 0),
          current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, 500);
  }
});
