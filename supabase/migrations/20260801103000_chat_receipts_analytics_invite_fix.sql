-- Chat, receipt storage, household analytics, and invite-code compatibility fix.

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  storage_path text not null unique,
  store_name text,
  total_amount numeric check (total_amount is null or total_amount >= 0),
  currency text not null default 'CAD',
  purchased_at timestamptz not null default now(),
  parse_status text not null default 'pending' check (parse_status in ('pending', 'processing', 'complete', 'failed', 'manual')),
  raw_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger touch_receipts before update on public.receipts
for each row execute function public.touch_updated_at();

alter table public.receipts enable row level security;

create policy receipts_all on public.receipts for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id) and uploaded_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy receipt_files_select on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
);

create policy receipt_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
);

create policy receipt_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
);

-- Avoid gen_random_bytes(), which is unavailable in some hosted schemas despite pgcrypto.
create or replace function public.create_household_invite(target_household_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare generated_code text;
begin
  if not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can invite members';
  end if;

  generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.household_invites (household_id, code, created_by)
  values (target_household_id, generated_code, auth.uid());

  return generated_code;
end;
$$;

grant execute on function public.create_household_invite(uuid) to authenticated;

alter publication supabase_realtime add table public.receipts;
