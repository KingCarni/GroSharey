-- Google Vision OCR + AI structured receipt parsing support.

alter table public.receipts
  add column if not exists subtotal_amount numeric check (subtotal_amount is null or subtotal_amount >= 0),
  add column if not exists tax_amount numeric check (tax_amount is null or tax_amount >= 0),
  add column if not exists parse_confidence numeric check (parse_confidence is null or (parse_confidence >= 0 and parse_confidence <= 1)),
  add column if not exists parsed_at timestamptz,
  add column if not exists parse_error text,
  add column if not exists parser_version text;

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  line_number integer not null default 0,
  raw_name text not null,
  normalized_name text,
  brand text,
  category text,
  quantity numeric,
  size numeric,
  unit text,
  unit_price numeric check (unit_price is null or unit_price >= 0),
  line_total numeric check (line_total is null or line_total >= 0),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_number)
);

create trigger touch_receipt_items before update on public.receipt_items
for each row execute function public.touch_updated_at();

alter table public.receipt_items enable row level security;

create policy receipt_items_select on public.receipt_items for select to authenticated
using (public.is_household_member(household_id));

create policy receipt_items_update on public.receipt_items for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

-- Receipt line items are written by the service-role receipt processor. Users may
-- review/correct them, but ordinary clients do not insert arbitrary parsed lines.

create index if not exists receipt_items_receipt_idx on public.receipt_items(receipt_id, line_number);
create index if not exists receipts_pending_parse_idx on public.receipts(parse_status, created_at)
where deleted_at is null and storage_path is not null;

-- Any new image-backed receipt should enter the OCR queue even if the user supplied
-- store/total manually. Those values remain useful fallbacks until parsing completes.
create or replace function public.queue_receipt_for_parsing()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.storage_path is not null then
    new.parse_status := 'pending';
    new.parse_error := null;
    new.parsed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_receipt_for_parsing on public.receipts;
create trigger queue_receipt_for_parsing
before insert on public.receipts
for each row execute function public.queue_receipt_for_parsing();

-- Community price observations need a direct receipt lineage so re-processing a
-- receipt can replace its observations without duplicating data.
alter table public.price_observations
  add column if not exists receipt_id uuid references public.receipts(id) on delete cascade,
  add column if not exists receipt_item_id uuid references public.receipt_items(id) on delete cascade;

create index if not exists price_observations_receipt_idx on public.price_observations(receipt_id);

-- Ensure receipt item updates are visible to household clients reviewing parse results.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'receipt_items'
  ) then
    alter publication supabase_realtime add table public.receipt_items;
  end if;
end $$;
