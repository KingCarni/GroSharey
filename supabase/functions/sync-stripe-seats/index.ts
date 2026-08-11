import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const extraSeatPriceId = Deno.env.get('STRIPE_EXTRA_SEAT_PRICE_ID')!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function stripePost(path: string, values: Record<string, string | number>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  return payload;
}

async function stripeDelete(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  return payload;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !extraSeatPriceId) return json({ error: 'Stripe secrets missing.' }, 500);

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Authentication required.' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userResult } = await supabase.auth.getUser(token);
  const user = userResult.user;
  if (!user) return json({ error: 'Invalid session.' }, 401);

  const body = await request.json().catch(() => ({}));
  const householdId = typeof body?.household_id === 'string' ? body.household_id : null;
  if (!householdId) return json({ error: 'household_id is required.' }, 400);

  const { data: membership } = await supabase
    .from('household_memberships')
    .select('id')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return json({ error: 'Household membership required.' }, 403);

  const { data: subscription } = await supabase
    .from('household_subscriptions')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();
  if (!subscription?.stripe_subscription_id || !['active', 'trialing', 'past_due'].includes(subscription.status)) {
    return json({ synced: false, reason: 'No active Stripe subscription.' });
  }

  const { count } = await supabase
    .from('household_memberships')
    .select('id', { head: true, count: 'exact' })
    .eq('household_id', householdId)
    .eq('status', 'active');
  const activeMembers = count ?? 1;
  const extraSeats = Math.max(activeMembers - 2, 0);
  let extraItemId = subscription.stripe_extra_item_id as string | null;

  if (extraSeats > 0 && extraItemId) {
    await stripePost(`/subscription_items/${extraItemId}`, { quantity: extraSeats, proration_behavior: 'create_prorations' });
  } else if (extraSeats > 0 && !extraItemId) {
    const item = await stripePost('/subscription_items', {
      subscription: subscription.stripe_subscription_id,
      price: extraSeatPriceId,
      quantity: extraSeats,
      proration_behavior: 'create_prorations',
    });
    extraItemId = item.id;
  } else if (extraSeats === 0 && extraItemId) {
    await stripeDelete(`/subscription_items/${extraItemId}?proration_behavior=create_prorations`);
    extraItemId = null;
  }

  await supabase.from('household_subscriptions').update({
    active_member_count: activeMembers,
    extra_seat_count: extraSeats,
    stripe_extra_item_id: extraItemId,
    updated_at: new Date().toISOString(),
  }).eq('household_id', householdId);

  return json({ synced: true, active_members: activeMembers, extra_seats: extraSeats, monthly_cents: 500 + extraSeats * 249 });
});
