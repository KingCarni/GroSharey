import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) return json({ error: 'Stripe secrets missing.' }, 500);

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
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membership?.role !== 'owner') return json({ error: 'Only the household owner can manage billing.' }, 403);

  const { data: subscription } = await supabase
    .from('household_subscriptions')
    .select('stripe_customer_id')
    .eq('household_id', householdId)
    .maybeSingle();
  if (!subscription?.stripe_customer_id) return json({ error: 'No Stripe customer exists for this household.' }, 404);

  const form = new URLSearchParams();
  form.set('customer', subscription.stripe_customer_id);
  form.set('return_url', `${supabaseUrl}/functions/v1/stripe-return?status=success&household_id=${encodeURIComponent(householdId)}`);
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) return json({ error: payload?.error?.message ?? 'Could not open Stripe billing portal.' }, response.status);
  return json({ url: payload.url });
});
