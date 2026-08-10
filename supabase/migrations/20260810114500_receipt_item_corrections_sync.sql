-- Keep corrected receipt line items and derived price observations in sync.

create or replace function public.sync_receipt_item_price_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.receipts%rowtype;
  effective_price numeric;
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
  )
  on conflict (receipt_item_id) do update set
    household_id = excluded.household_id,
    receipt_id = excluded.receipt_id,
    raw_product_name = excluded.raw_product_name,
    price = excluded.price,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    currency = excluded.currency,
    observed_at = excluded.observed_at,
    confidence = excluded.confidence;

  return new;
end;
$$;

-- One derived observation per parsed/corrected receipt item.
create unique index if not exists price_observations_receipt_item_unique
  on public.price_observations(receipt_item_id)
  where receipt_item_id is not null;

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
