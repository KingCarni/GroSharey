import { createClient } from '@supabase/supabase-js';

type NotificationEvent = {
  id: string;
  household_id: string;
  actor_id: string | null;
  title: string;
  body: string;
  url: string | null;
  payload: Record<string, unknown> | null;
};

type MembershipRow = {
  user_id: string;
};

type DeviceTokenRow = {
  expo_push_token: string;
};

type ExpoPushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async () => {
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: 'Missing Supabase environment variables.' },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error: eventsError } = await supabase
    .from('notification_outbox')
    .select(
      'id, household_id, actor_id, title, body, url, payload',
    )
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (eventsError) {
    return Response.json(
      { error: eventsError.message },
      { status: 500 },
    );
  }

  const events = (data ?? []) as NotificationEvent[];

  let processed = 0;
  let sent = 0;
  const failures: { eventId: string; error: string }[] = [];

  for (const event of events) {
    try {
      let membershipsQuery = supabase
        .from('household_memberships')
        .select('user_id')
        .eq('household_id', event.household_id)
        .eq('status', 'active');

      if (event.actor_id) {
        membershipsQuery = membershipsQuery.neq(
          'user_id',
          event.actor_id,
        );
      }

      const {
        data: membershipData,
        error: membershipsError,
      } = await membershipsQuery;

      if (membershipsError) {
        throw new Error(
          `Could not load household members: ${membershipsError.message}`,
        );
      }

      const memberships =
        (membershipData ?? []) as MembershipRow[];

      const userIds = memberships.map(
        (membership) => membership.user_id,
      );

      if (userIds.length > 0) {
        const {
          data: tokenData,
          error: tokensError,
        } = await supabase
          .from('device_tokens')
          .select('expo_push_token')
          .in('user_id', userIds);

        if (tokensError) {
          throw new Error(
            `Could not load device tokens: ${tokensError.message}`,
          );
        }

        const tokens = (tokenData ?? []) as DeviceTokenRow[];

        const messages: ExpoPushMessage[] = tokens.map((token) => ({
          to: token.expo_push_token,
          sound: 'default',
          title: event.title,
          body: event.body,
          data: {
            ...(event.payload ?? {}),
            url: event.url,
          },
        }));

        if (messages.length > 0) {
          const pushResponse = await fetch(
            'https://exp.host/--/api/v2/push/send',
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(messages),
            },
          );

          const pushResult = await pushResponse.json().catch(() => null);

          if (!pushResponse.ok) {
            throw new Error(
              `Expo push request failed (${pushResponse.status}): ${
                JSON.stringify(pushResult) || 'Unknown error'
              }`,
            );
          }

          sent += messages.length;
        }
      }

      const { error: processedError } = await supabase
        .from('notification_outbox')
        .update({
          processed_at: new Date().toISOString(),
        })
        .eq('id', event.id);

      if (processedError) {
        throw new Error(
          `Could not mark event as processed: ${processedError.message}`,
        );
      }

      processed += 1;
    } catch (error) {
      failures.push({
        eventId: event.id,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown notification error',
      });
    }
  }

  return Response.json({
    queued: events.length,
    processed,
    sent,
    failed: failures.length,
    failures,
  });
});