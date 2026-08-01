-- Household invite/realtime expansion and push notification outbox.
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.notification_outbox enable row level security;

create policy notification_outbox_household_select
on public.notification_outbox for select to authenticated
using (public.is_household_member(household_id));

create or replace function public.queue_item_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_household uuid;
begin
  select household_id into target_household from public.grocery_lists where id = new.list_id;
  if tg_op = 'INSERT' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (target_household, auth.uid(), 'item_added', 'Item added', new.name || ' was added to the grocery list.', '/list/' || new.list_id, jsonb_build_object('list_id', new.list_id, 'item_id', new.id));
  elsif tg_op = 'UPDATE' and old.is_completed is distinct from new.is_completed then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (target_household, auth.uid(), 'item_updated', case when new.is_completed then 'Item picked up' else 'Item returned to list' end, new.name, '/list/' || new.list_id, jsonb_build_object('list_id', new.list_id, 'item_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists queue_item_notification on public.grocery_items;
create trigger queue_item_notification after insert or update on public.grocery_items for each row execute function public.queue_item_notification();

create or replace function public.queue_shopping_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (new.household_id, new.shopper_id, 'shopping_started', 'Someone is going shopping', 'Open GroSharey to add any last-minute items.', '/list/' || new.list_id, jsonb_build_object('list_id', new.list_id, 'session_id', new.id));
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'completed' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (new.household_id, new.shopper_id, 'shopping_finished', 'Shopping finished', 'The active shopping trip has ended.', '/list/' || new.list_id, jsonb_build_object('list_id', new.list_id, 'session_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists queue_shopping_notification on public.shopping_sessions;
create trigger queue_shopping_notification after insert or update on public.shopping_sessions for each row execute function public.queue_shopping_notification();

alter publication supabase_realtime add table public.household_memberships;
alter publication supabase_realtime add table public.household_invites;
alter publication supabase_realtime add table public.notification_outbox;
