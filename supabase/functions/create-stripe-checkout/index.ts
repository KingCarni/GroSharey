import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID')!;
const extraSeatPriceId = Deno.env.get('STRIPE_EXTRA_SEAT_PRICE_ID')!;

// Stripe subscription statuses that mean "this household already has a subscription we must
// not duplicate". `incomplete` is included: the customer is mid-payment on an existing
// subscription, and a second Checkout would bill them twice.
const liveStripeStatuses = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function formBody(values: Record<string, string | number | boolean>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  return body;
}

async function stripePost(
  path: string,
  values: Record<string, string | number | boolean>,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers,
    body: formBody(values),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  return payload;
}

async function stripeGet(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    // A deleted/unknown subscription id is not an error for our purposes.
    if (response.status === 404) return null;
    throw new Error(payload?.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !basePriceId || !extraSeatPriceId) {
    return json({ error: 'Stripe billing secrets are not configured.' }, 500);
  }
  // Checkout line items need recurring Price ids. A Product id here fails deep inside Stripe
  // with a confusing message, so catch the misconfiguration up front.
  for (const [name, value] of [['STRIPE_BASE_PRICE_ID', basePriceId], ['STRIPE_EXTRA_SEAT_PRICE_ID', extraSeatPriceId]]) {
    if (!value.startsWith('price_')) {
      return json({ error: `${name} must be a Stripe Price id (price_...), not "${value.slice(0, 5)}...".` }, 500);
    }
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Authentication required.' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult.user;
  if (userError || !user) return json({ error: 'Invalid session.' }, 401);

  const body = await request.json().catch(() => ({}));
  const householdId = typeof body?.household_id === 'string' ? body.household_id : null;
  if (!householdId) return json({ error: 'household_id is required.' }, 400);

  const { data: membership } = await supabase
    .from('household_memberships')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membership?.role !== 'owner') return json({ error: 'Only the household owner can manage billing.' }, 403);

  const { count: activeMembers } = await supabase
    .from('household_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'active');
  const memberCount = activeMembers ?? 1;
  const extraSeats = Math.max(memberCount - 2, 0);

  const { data: existing } = await supabase
    .from('household_subscriptions')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();

  // Duplicate-charge guard. The stored status can lag behind Stripe (delayed or dropped
  // webhook, or a status such as `canceled` while the household is still inside a
  // cancel-at-period-end grace window), so Stripe itself is the source of truth.
  if (existing?.stripe_subscription_id) {
    const liveSubscription = await stripeGet(`/subscriptions/${existing.stripe_subscription_id}`);
    if (liveSubscription && liveStripeStatuses.has(liveSubscription.status)) {
      return json(
        {
          error: 'This household already has a Stripe subscription. Use Manage subscription to change it.',
          stripe_status: liveSubscription.status,
        },
        409,
      );
    }
  }
  if (existing?.status === 'active' || existing?.status === 'trialing') {
    return json({ error: 'This household already has an active subscription.' }, 409);
  }

  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripePost(
      '/customers',
      {
        email: user.email ?? '',
        'metadata[household_id]': householdId,
        'metadata[owner_user_id]': user.id,
      },
      // Deterministic key: a retry of this call reuses the same Stripe customer instead of
      // creating a second one for the same household.
      `grosharey-customer-${householdId}`,
    );
    customerId = customer.id;

    // Persist the customer before Checkout so a failure here cannot orphan it.
    await supabase.from('household_subscriptions').upsert({
      household_id: householdId,
      owner_user_id: user.id,
      status: existing?.status ?? 'inactive',
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    });
  }

  const successUrl = `${supabaseUrl}/functions/v1/stripe-return?status=success&household_id=${encodeURIComponent(householdId)}`;
  const cancelUrl = `${supabaseUrl}/functions/v1/stripe-return?status=cancel&household_id=${encodeURIComponent(householdId)}`;

  const checkoutParams: Record<string, string | number | boolean> = {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: householdId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    'metadata[household_id]': householdId,
    'metadata[owner_user_id]': user.id,
    'subscription_data[metadata][household_id]': householdId,
    'subscription_data[metadata][owner_user_id]': user.id,
    'line_items[0][price]': basePriceId,
    'line_items[0][quantity]': 1,
  };
  if (extraSeats > 0) {
    checkoutParams['line_items[1][price]'] = extraSeatPriceId;
    checkoutParams['line_items[1][quantity]'] = extraSeats;
  }

  const session = await stripePost('/checkout/sessions', checkoutParams);

  await supabase.from('household_subscriptions').upsert({
    household_id: householdId,
    owner_user_id: user.id,
    status: 'checkout_pending',
    stripe_customer_id: customerId,
    active_member_count: memberCount,
    extra_seat_count: extraSeats,
    updated_at: new Date().toISOString(),
  });

  return json({ url: session.url, monthly_cents: 500 + extraSeats * 249, active_members: memberCount, extra_seats: extraSeats });
});
