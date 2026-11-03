import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const extraSeatPriceId = Deno.env.get('STRIPE_EXTRA_SEAT_PRICE_ID')!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  values?: Record<string, string | number>,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeSecretKey}` };
  let body: URLSearchParams | undefined;
  if (values) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body });
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

  // Any active member may *request* a reconciliation (a joining member does this right after
  // redeeming an invite). The quantity is always derived server-side from active memberships,
  // never from the caller, and no other billing change is possible through this route.
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

  // Read the live subscription instead of trusting the cached item id. Two members opening
  // the billing screen at the same moment used to be able to create two extra-seat items
  // (double billing) because both saw stripe_extra_item_id as null.
  const liveSubscription = await stripeRequest('GET', `/subscriptions/${subscription.stripe_subscription_id}?expand[]=items.data.price`);
  const liveItems: { id: string; quantity?: number; price?: { id?: string } }[] = liveSubscription.items?.data ?? [];
  const extraItems = liveItems.filter((item) => item.price?.id === extraSeatPriceId);
  let extraItemId: string | null = extraItems[0]?.id ?? null;

  // Collapse any duplicates a previous race may already have created.
  for (const duplicate of extraItems.slice(1)) {
    await stripeRequest('DELETE', `/subscription_items/${duplicate.id}?proration_behavior=create_prorations`);
  }

  if (extraSeats > 0 && extraItemId) {
    if (Number(extraItems[0]?.quantity ?? 0) !== extraSeats) {
      await stripeRequest('POST', `/subscription_items/${extraItemId}`, {
        quantity: extraSeats,
        proration_behavior: 'create_prorations',
      });
    }
  } else if (extraSeats > 0 && !extraItemId) {
    const item = await stripeRequest(
      'POST',
      '/subscription_items',
      {
        subscription: subscription.stripe_subscription_id,
        price: extraSeatPriceId,
        quantity: extraSeats,
        proration_behavior: 'create_prorations',
      },
      // Concurrent callers collapse onto one Stripe item instead of creating several.
      `grosharey-seat-item-${subscription.stripe_subscription_id}-${extraSeats}`,
    );
    extraItemId = item.id;
  } else if (extraSeats === 0 && extraItemId) {
    await stripeRequest('DELETE', `/subscription_items/${extraItemId}?proration_behavior=create_prorations`);
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
