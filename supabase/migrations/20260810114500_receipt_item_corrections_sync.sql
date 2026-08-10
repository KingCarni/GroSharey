-- Keep corrected receipt line items and derived price observations in sync.

-- Household members may correct parser output, remove false positives, or add a missed line.
drop policy if exists receipt_items_insert on public.receipt_items;
create policy receipt_items_insert on public.receipt_items for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists receipt_items_delete on public.receipt_items;
create policy receipt_items_delete on public.receipt_items for delete to authenticated
using (public.is_household_member(household_id));

-- One derived observation per parsed/corrected receipt item.
create unique index if not exists price_observations_receipt_item_unique
  on public.price_observations(receipt_item_id)
  where receipt_item_id is not null;

create or replace function public.sync_receipt_item_price_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.receipts%rowtype;
  effective_price numeric;
  existing_observation_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.price_observations where receipt_item_id = old.id;
    return old;
  end if;

  select * into receipt_row from public.receipts where id = new.receipt_id;
  if receipt_row.id is null then
    return new;
  end if;

  effective_price := coalesce(new.line_total, new.unit_price);

  if effective_price is null then
    delete from public.price_observations where receipt_item_id = new.id;
    return new;
  end if;

  select id into existing_observation_id
  from public.price_observations
  where receipt_item_id = new.id
  limit 1;

  if existing_observation_id is null then
    insert into public.price_observations (
      household_id,
      receipt_id,
      receipt_item_id,
      raw_product_name,
      price,
      quantity,
      unit_price,
      currency,
      observed_at,
      source,
      confidence,
      is_community_eligible
    ) values (
      new.household_id,
      new.receipt_id,
      new.id,
      coalesce(nullif(new.normalized_name, ''), new.raw_name),
      effective_price,
      new.quantity,
      new.unit_price,
      coalesce(receipt_row.currency, 'CAD'),
      receipt_row.purchased_at,
      'receipt',
      new.confidence,
      false
    );
  else
    update public.price_observations
    set household_id = new.household_id,
        receipt_id = new.receipt_id,
        raw_product_name = coalesce(nullif(new.normalized_name, ''), new.raw_name),
        price = effective_price,
        quantity = new.quantity,
        unit_price = new.unit_price,
        currency = coalesce(receipt_row.currency, 'CAD'),
        observed_at = receipt_row.purchased_at,
        confidence = new.confidence
    where id = existing_observation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_receipt_item_price_observation on public.receipt_items;
create trigger sync_receipt_item_price_observation
after insert or update or delete on public.receipt_items
for each row execute function public.sync_receipt_item_price_observation();

-- If receipt-level date/currency changes, keep observations aligned.
create or replace function public.sync_receipt_observation_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchased_at is distinct from old.purchased_at
     or new.currency is distinct from old.currency then
    update public.price_observations
    set observed_at = new.purchased_at,
        currency = coalesce(new.currency, 'CAD')
    where receipt_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_receipt_observation_metadata on public.receipts;
create trigger sync_receipt_observation_metadata
after update of purchased_at, currency on public.receipts
for each row execute function public.sync_receipt_observation_metadata();
