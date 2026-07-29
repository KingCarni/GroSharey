-- GRO-7: core schema, access rules, invitations, lists, realtime and shopping sessions.
create extension if not exists pgcrypto;

create type public.household_role as enum ('owner', 'member');
create type public.membership_status as enum ('active', 'invited', 'removed', 'left');
create type public.shopping_session_status as enum ('active', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.household_memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.household_role not null default 'member',
  status public.membership_status not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.grocery_lists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  quantity numeric,
  unit text,
  brand text,
  category text,
  notes text,
  position integer not null default 0,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  list_id uuid not null references public.grocery_lists(id) on delete cascade,
  shopper_id uuid not null references public.profiles(id),
  store_name text,
  status public.shopping_session_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index one_active_shopping_session_per_list
  on public.shopping_sessions(list_id)
  where status = 'active';

create table public.household_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid references public.grocery_items(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  item_activity boolean not null default true,
  shopping_activity boolean not null default true,
  chat_activity boolean not null default true,
  primary key (user_id, household_id)
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'trialing',
  included_members integer not null default 2,
  additional_members integer not null default 0,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text,
  size numeric,
  unit text,
  barcode text unique,
  category text,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  chain_name text not null,
  location_name text,
  country_code text not null default 'CA',
  region text,
  postal_prefix text,
  created_at timestamptz not null default now()
);

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  raw_product_name text,
  price numeric not null check (price >= 0),
  quantity numeric,
  unit_price numeric,
  currency text not null default 'CAD',
  postal_prefix text,
  observed_at timestamptz not null,
  source text not null default 'receipt',
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  is_community_eligible boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_households before update on public.households for each row execute function public.touch_updated_at();
create trigger touch_lists before update on public.grocery_lists for each row execute function public.touch_updated_at();
create trigger touch_items before update on public.grocery_items for each row execute function public.touch_updated_at();
create trigger touch_device_tokens before update on public.device_tokens for each row execute function public.touch_updated_at();
create trigger touch_subscriptions before update on public.subscriptions for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_memberships hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_memberships hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role = 'owner'
  );
$$;

create or replace function public.create_household(household_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into public.households (name, created_by, trial_started_at, trial_expires_at)
  values (trim(household_name), auth.uid(), now(), now() + interval '7 days')
  returning id into new_id;

  insert into public.household_memberships (household_id, user_id, role, status, joined_at)
  values (new_id, auth.uid(), 'owner', 'active', now());

  insert into public.notification_preferences (user_id, household_id)
  values (auth.uid(), new_id);

  insert into public.subscriptions (household_id, status)
  values (new_id, 'trialing');

  return new_id;
end;
$$;

grant execute on function public.create_household(text) to authenticated;

create or replace function public.create_household_invite(target_household_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare generated_code text;
begin
  if not public.is_household_owner(target_household_id) then raise exception 'Only household owners can invite members'; end if;
  generated_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
  insert into public.household_invites (household_id, code, created_by)
  values (target_household_id, generated_code, auth.uid());
  return generated_code;
end;
$$;

grant execute on function public.create_household_invite(uuid) to authenticated;

create or replace function public.accept_household_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_household uuid;
begin
  select household_id into target_household
  from public.household_invites
  where code = upper(trim(invite_code)) and revoked_at is null and accepted_at is null and expires_at > now()
  for update;
  if target_household is null then raise exception 'Invite is invalid or expired'; end if;

  insert into public.household_memberships (household_id, user_id, role, status, joined_at)
  values (target_household, auth.uid(), 'member', 'active', now())
  on conflict (household_id, user_id) do update set status = 'active', joined_at = now();

  update public.household_invites set accepted_by = auth.uid(), accepted_at = now()
  where code = upper(trim(invite_code));

  insert into public.notification_preferences (user_id, household_id)
  values (auth.uid(), target_household) on conflict do nothing;
  return target_household;
end;
$$;

grant execute on function public.accept_household_invite(text) to authenticated;

create or replace function public.start_shopping_session(shopping_list_id uuid, store text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_household uuid; new_session uuid;
begin
  select household_id into target_household from public.grocery_lists where id = shopping_list_id and deleted_at is null;
  if target_household is null or not public.is_household_member(target_household) then raise exception 'Not authorized'; end if;
  insert into public.shopping_sessions (household_id, list_id, shopper_id, store_name)
  values (target_household, shopping_list_id, auth.uid(), nullif(trim(store), '')) returning id into new_session;
  return new_session;
end;
$$;

grant execute on function public.start_shopping_session(uuid, text) to authenticated;

create or replace function public.finish_shopping_session(session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.shopping_sessions ss set status = 'completed', ended_at = now()
  where ss.id = session_id and (ss.shopper_id = auth.uid() or public.is_household_owner(ss.household_id));
  if not found then raise exception 'Not authorized or session missing'; end if;
end;
$$;

grant execute on function public.finish_shopping_session(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.household_invites enable row level security;
alter table public.grocery_lists enable row level security;
alter table public.grocery_items enable row level security;
alter table public.shopping_sessions enable row level security;
alter table public.household_messages enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;
alter table public.subscriptions enable row level security;
alter table public.price_observations enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or exists (
  select 1 from public.household_memberships mine join public.household_memberships theirs on mine.household_id = theirs.household_id
  where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id and theirs.status = 'active'
));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy households_select on public.households for select to authenticated using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy memberships_select on public.household_memberships for select to authenticated using (public.is_household_member(household_id));
create policy memberships_update on public.household_memberships for update to authenticated using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));

create policy invites_select on public.household_invites for select to authenticated using (public.is_household_owner(household_id));
create policy invites_update on public.household_invites for update to authenticated using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));

create policy lists_all on public.grocery_lists for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy items_all on public.grocery_items for all to authenticated
using (exists (select 1 from public.grocery_lists gl where gl.id = list_id and public.is_household_member(gl.household_id)))
with check (exists (select 1 from public.grocery_lists gl where gl.id = list_id and public.is_household_member(gl.household_id)));

create policy sessions_all on public.shopping_sessions for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy messages_all on public.household_messages for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy notification_preferences_all on public.notification_preferences for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy device_tokens_all on public.device_tokens for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_household_member(household_id));
create policy price_observations_private on public.price_observations for select to authenticated using (household_id is not null and public.is_household_member(household_id));

alter publication supabase_realtime add table public.grocery_lists;
alter publication supabase_realtime add table public.grocery_items;
alter publication supabase_realtime add table public.shopping_sessions;
alter publication supabase_realtime add table public.household_messages;
