-- Finish-shopping lifecycle cleanup and notification support.

create or replace function public.finish_shopping_session(session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_list uuid;
  target_household uuid;
begin
  select ss.list_id, ss.household_id
  into target_list, target_household
  from public.shopping_sessions ss
  where ss.id = session_id
    and ss.status = 'active'
    and (ss.shopper_id = auth.uid() or public.is_household_owner(ss.household_id))
  for update;

  if target_list is null then
    raise exception 'Not authorized or active shopping session missing';
  end if;

  update public.shopping_sessions
  set status = 'completed', ended_at = now()
  where id = session_id;

  -- Completed items represent purchased items. Soft-delete them when the trip ends,
  -- while leaving unchecked items on the list for the next shop.
  update public.grocery_items
  set deleted_at = now(), updated_at = now()
  where list_id = target_list
    and is_completed = true
    and deleted_at is null;
end;
$$;

grant execute on function public.finish_shopping_session(uuid) to authenticated;

-- Keep notification trigger functions present and deterministic.
create or replace function public.queue_item_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_household uuid;
begin
  select household_id into target_household
  from public.grocery_lists
  where id = new.list_id;

  if tg_op = 'INSERT' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (
      target_household,
      auth.uid(),
      'item_added',
      'Item added',
      new.name || ' was added to the grocery list.',
      '/list/' || new.list_id,
      jsonb_build_object('list_id', new.list_id, 'item_id', new.id)
    );
  elsif tg_op = 'UPDATE' and old.is_completed is distinct from new.is_completed then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (
      target_household,
      auth.uid(),
      'item_updated',
      case when new.is_completed then 'Item picked up' else 'Item returned to list' end,
      new.name,
      '/list/' || new.list_id,
      jsonb_build_object('list_id', new.list_id, 'item_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_item_notification on public.grocery_items;
create trigger queue_item_notification
  after insert or update on public.grocery_items
  for each row execute function public.queue_item_notification();

create or replace function public.queue_shopping_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (
      new.household_id,
      new.shopper_id,
      'shopping_started',
      'Someone is going shopping',
      'Open GroSharey to add any last-minute items.',
      '/list/' || new.list_id,
      jsonb_build_object('list_id', new.list_id, 'session_id', new.id)
    );
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'completed' then
    insert into public.notification_outbox (household_id, actor_id, event_type, title, body, url, payload)
    values (
      new.household_id,
      new.shopper_id,
      'shopping_finished',
      'Shopping finished',
      'The active shopping trip has ended.',
      '/list/' || new.list_id,
      jsonb_build_object('list_id', new.list_id, 'session_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_shopping_notification on public.shopping_sessions;
create trigger queue_shopping_notification
  after insert or update on public.shopping_sessions
  for each row execute function public.queue_shopping_notification();
