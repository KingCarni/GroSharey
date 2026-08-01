import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async () => {
  if (!supabaseUrl || !serviceRoleKey) return new Response('Missing Supabase environment', { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: events, error } = await supabase
    .from('notification_outbox')
    .select('*')
    .is('processed_at', null)
    .order('created_at')
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const event of events ?? []) {
    const { data: memberships } = await supabase
      .from('household_memberships')
      .select('user_id')
      .eq('household_id', event.household_id)
      .eq('status', 'active')
      .neq('user_id', event.actor_id ?? '00000000-0000-0000-0000-000000000000');

    const userIds = (memberships ?? []).map((membership) => membership.user_id);
    if (userIds.length > 0) {
      const { data: tokens } = await supabase.from('device_tokens').select('expo_push_token').in('user_id', userIds);
      const messages = (tokens ?? []).map((token) => ({
        to: token.expo_push_token,
        sound: 'default',
        title: event.title,
        body: event.body,
        data: { ...(event.payload ?? {}), url: event.url },
      }));

      if (messages.length > 0) {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });
        if (response.ok) sent += messages.length;
      }
    }

    await supabase.from('notification_outbox').update({ processed_at: new Date().toISOString() }).eq('id', event.id);
  }

  return Response.json({ processed: events?.length ?? 0, sent });
});
