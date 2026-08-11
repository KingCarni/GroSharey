import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  LoadingState,
  Panel,
  SectionHeader,
  StatCard,
  TextField,
} from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { colors, radii, spacing, type } from '../../../src/theme';

type Receipt = {
  id: string;
  store_name: string | null;
  total_amount: number | null;
  purchased_at: string;
};

type ReceiptItem = {
  id: string;
  receipt_id: string;
  normalized_name: string | null;
  raw_name: string;
  brand: string | null;
  category: string | null;
  line_total: number | null;
  unit_price: number | null;
  quantity: number | null;
};

type JoinedItem = ReceiptItem & {
  store: string;
  purchasedAt: string | null;
  displayName: string;
  spendPrice: number;
  comparisonPrice: number;
};

type AnalyticsMode = 'Overview' | 'Items' | 'Stores' | 'Brands' | 'Categories';
const modes: AnalyticsMode[] = ['Overview', 'Items', 'Stores', 'Brands', 'Categories'];

function priceForComparison(item: ReceiptItem) {
  const explicitUnitPrice = Number(item.unit_price ?? 0);
  if (explicitUnitPrice > 0) return explicitUnitPrice;
  const lineTotal = Number(item.line_total ?? 0);
  const quantity = Number(item.quantity ?? 0);
  if (lineTotal > 0 && quantity > 1) return lineTotal / quantity;
  return lineTotal;
}

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AnalyticsMode>('Overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function initial() {
      await load();
      if (!cancelled) setLoading(false);
    }
    void initial();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    const [receiptResult, itemResult] = await Promise.all([
      supabase
        .from('receipts')
        .select('id, store_name, total_amount, purchased_at')
        .eq('household_id', id)
        .is('deleted_at', null)
        .not('total_amount', 'is', null)
        .order('purchased_at', { ascending: false }),
      supabase
        .from('receipt_items')
        .select('id, receipt_id, normalized_name, raw_name, brand, category, line_total, unit_price, quantity')
        .eq('household_id', id),
    ]);
    if (receiptResult.error) return Alert.alert('Could not load analytics', receiptResult.error.message);
    if (itemResult.error) return Alert.alert('Could not load item analytics', itemResult.error.message);
    setReceipts((receiptResult.data ?? []) as Receipt[]);
    setItems((itemResult.data ?? []) as ReceiptItem[]);
  }

  const joinedItems = useMemo<JoinedItem[]>(() => {
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    return items.map((item) => {
      const receipt = receiptMap.get(item.receipt_id);
      return {
        ...item,
        store: receipt?.store_name?.trim() || 'Unknown store',
        purchasedAt: receipt?.purchased_at ?? null,
        displayName: item.normalized_name?.trim() || item.raw_name?.trim() || 'Unknown item',
        spendPrice: Number(item.line_total ?? item.unit_price ?? 0),
        comparisonPrice: priceForComparison(item),
      };
    });
  }, [items, receipts]);

  const metrics = useMemo(() => {
    const totals = receipts.map((receipt) => Number(receipt.total_amount ?? 0));
    const totalSpend = totals.reduce((sum, value) => sum + value, 0);
    const storeTotals = new Map<string, { spend: number; trips: number }>();
    for (const receipt of receipts) {
      const store = receipt.store_name?.trim() || 'Unknown store';
      const current = storeTotals.get(store) ?? { spend: 0, trips: 0 };
      current.spend += Number(receipt.total_amount ?? 0);
      current.trips += 1;
      storeTotals.set(store, current);
    }
    const stores = [...storeTotals.entries()].sort((a, b) => b[1].spend - a[1].spend);
    const maxStoreTotal = stores.length > 0 ? stores[0]![1].spend : 0;

    const productTotals = new Map<string, { spend: number; count: number }>();
    const brandTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();
    let itemSpend = 0;
    let pricedItems = 0;

    for (const item of joinedItems) {
      const price = item.spendPrice;
      if (price > 0) {
        itemSpend += price;
        pricedItems += 1;
      }
      const current = productTotals.get(item.displayName) ?? { spend: 0, count: 0 };
      current.spend += price;
      current.count += Number(item.quantity ?? 1) || 1;
      productTotals.set(item.displayName, current);
      if (item.brand?.trim()) brandTotals.set(item.brand.trim(), (brandTotals.get(item.brand.trim()) ?? 0) + price);
      if (item.category?.trim()) categoryTotals.set(item.category.trim(), (categoryTotals.get(item.category.trim()) ?? 0) + price);
    }

    return {
      totalSpend,
      average: receipts.length ? totalSpend / receipts.length : 0,
      stores,
      maxStoreTotal,
      recent: receipts.slice(0, 5),
      products: [...productTotals.entries()].sort((a, b) => b[1].spend - a[1].spend),
      brands: [...brandTotals.entries()].sort((a, b) => b[1] - a[1]),
      categories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]),
      parsedLines: items.length,
      pricedItems,
      averageLinePrice: pricedItems ? itemSpend / pricedItems : 0,
    };
  }, [receipts, items.length, joinedItems]);

  const search = query.trim().toLowerCase();

  const filteredItems = useMemo(() => joinedItems.filter((item) => {
    if (selectedStore && item.store !== selectedStore) return false;
    if (!search) return true;
    return [item.displayName, item.raw_name, item.brand, item.category, item.store]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  }), [joinedItems, search, selectedStore]);

  const itemPriceComparison = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const item of joinedItems) {
      if (item.comparisonPrice <= 0) continue;
      const key = item.displayName.toLowerCase();
      const stores = map.get(key) ?? new Map<string, number[]>();
      const values = stores.get(item.store) ?? [];
      values.push(item.comparisonPrice);
      stores.set(item.store, values);
      map.set(key, stores);
    }
    return map;
  }, [joinedItems]);

  const selectedStoreSummary = useMemo(() => {
    if (!selectedStore) return null;
    const receiptsAtStore = receipts.filter((receipt) => (receipt.store_name?.trim() || 'Unknown store') === selectedStore);
    const spend = receiptsAtStore.reduce((sum, receipt) => sum + Number(receipt.total_amount ?? 0), 0);
    return { trips: receiptsAtStore.length, spend, average: receiptsAtStore.length ? spend / receiptsAtStore.length : 0 };
  }, [receipts, selectedStore]);

  if (loading) return <AppScreen><LoadingState label="Crunching numbers" /></AppScreen>;

  return (
    <AppScreen scroll padded={false} contentContainerStyle={styles.scroll}>
      <AppHeader
        title={selectedStore ?? 'Spending'}
        eyebrow={selectedStore ? 'STORE ANALYTICS' : 'ANALYTICS'}
        subtitle={selectedStore ? 'Search this store and compare observed item prices elsewhere.' : 'Search purchases by item, store, brand or category.'}
        onBack={() => selectedStore ? setSelectedStore(null) : router.back()}
      />

      <View style={styles.controls}>
        <Pressable style={styles.dropdown} onPress={() => setMenuOpen((value) => !value)}>
          <View style={styles.dropdownIcon}><Feather name="sliders" size={16} color={colors.primary} /></View>
          <Text style={styles.dropdownText}>{selectedStore ? 'Store items' : mode}</Text>
          <Feather name={menuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.subtle} />
        </Pressable>
        {menuOpen && !selectedStore && (
          <View style={styles.dropdownMenu}>
            {modes.map((option) => (
              <Pressable
                key={option}
                style={[styles.dropdownOption, option === mode && styles.dropdownOptionActive]}
                onPress={() => { setMode(option); setMenuOpen(false); setQuery(''); }}
              >
                <Text style={[styles.dropdownOptionText, option === mode && styles.dropdownOptionTextActive]}>{option}</Text>
                {option === mode && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        )}
        <TextField
          placeholder={selectedStore ? `Search ${selectedStore}` : `Search ${mode.toLowerCase()}`}
          leftIcon="search"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {selectedStore && selectedStoreSummary ? (
        <StoreDetail store={selectedStore} summary={selectedStoreSummary} items={filteredItems} comparison={itemPriceComparison} />
      ) : (
        <>
          {mode === 'Overview' && <Overview metrics={metrics} receipts={receipts} onOpenStore={setSelectedStore} />}
          {mode === 'Items' && <ItemResults items={filteredItems} comparison={itemPriceComparison} />}
          {mode === 'Stores' && <StoreResults stores={metrics.stores} search={search} onOpenStore={setSelectedStore} />}
          {mode === 'Brands' && <SimpleSpendResults title="Brand spend" rows={metrics.brands} search={search} empty="Parsed receipt brands will appear here." />}
          {mode === 'Categories' && <SimpleSpendResults title="Category spend" rows={metrics.categories} search={search} empty="Parsed receipt categories will appear here." />}
        </>
      )}
    </AppScreen>
  );
}

function Overview({ metrics, receipts, onOpenStore }: {
  metrics: ReturnType<typeof useAnalyticsMetrics>;
  receipts: Receipt[];
  onOpenStore: (store: string) => void;
}) {
  return (
    <>
      <View style={styles.statRow}>
        <StatCard tone="dark" label="TOTAL SPEND" value={`$${metrics.totalSpend.toFixed(2)}`} hint={`${receipts.length} ${receipts.length === 1 ? 'receipt' : 'receipts'}`} />
        <View style={{ width: spacing.sm }} />
        <StatCard tone="warm" label="AVG. TRIP" value={`$${metrics.average.toFixed(2)}`} hint={receipts.length ? 'Per receipt' : 'No data yet'} />
      </View>
      <View style={styles.statRow}>
        <StatCard tone="warm" label="PARSED LINES" value={String(metrics.parsedLines)} hint="Receipt products" />
        <View style={{ width: spacing.sm }} />
        <StatCard tone="dark" label="AVG. ITEM LINE" value={`$${metrics.averageLinePrice.toFixed(2)}`} hint={`${metrics.pricedItems} priced lines`} />
      </View>

      <Panel>
        <SectionHeader eyebrow="PRODUCTS" title="Top grocery spend" />
        {metrics.products.slice(0, 8).map(([name, info], index) => (
          <View key={name} style={[styles.row, index > 0 && styles.rowBordered]}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{name}</Text><Text style={styles.rowMeta}>{info.count.toFixed(info.count % 1 ? 1 : 0)} purchased</Text></View>
            <Text style={styles.rowAmount}>${info.spend.toFixed(2)}</Text>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="STORES" title="Spend by store" />
        {metrics.stores.map(([store, info], index) => {
          const share = metrics.maxStoreTotal ? info.spend / metrics.maxStoreTotal : 0;
          return (
            <Pressable key={store} style={styles.storeRow} onPress={() => onOpenStore(store)}>
              <View style={styles.storeHeader}>
                <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.storeName}>{store}</Text><Text style={styles.rowMeta}>{info.trips} {info.trips === 1 ? 'trip' : 'trips'}</Text></View>
                <Text style={styles.storeAmount}>${info.spend.toFixed(2)}</Text>
                <Feather name="chevron-right" size={18} color={colors.subtle} />
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(6, share * 100)}%` }]} /></View>
            </Pressable>
          );
        })}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="ACTIVITY" title="Recent spending" />
        {metrics.recent.length === 0 ? (
          <EmptyState icon="clock" title="Nothing yet" body="Once you log receipts with totals they will appear here." />
        ) : metrics.recent.map((receipt, index) => (
          <View key={receipt.id} style={[styles.row, index > 0 && styles.rowBordered]}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{receipt.store_name ?? 'Unknown store'}</Text><Text style={styles.rowMeta}>{new Date(receipt.purchased_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>
            <Text style={styles.rowAmount}>${Number(receipt.total_amount ?? 0).toFixed(2)}</Text>
          </View>
        ))}
      </Panel>
    </>
  );
}

function useAnalyticsMetrics() {
  return {
    totalSpend: 0, average: 0, stores: [] as [string, { spend: number; trips: number }][], maxStoreTotal: 0,
    recent: [] as Receipt[], products: [] as [string, { spend: number; count: number }][], brands: [] as [string, number][],
    categories: [] as [string, number][], parsedLines: 0, pricedItems: 0, averageLinePrice: 0,
  };
}

function StoreResults({ stores, search, onOpenStore }: { stores: [string, { spend: number; trips: number }][]; search: string; onOpenStore: (store: string) => void }) {
  const rows = stores.filter(([store]) => !search || store.toLowerCase().includes(search));
  return (
    <Panel>
      <SectionHeader eyebrow="STORES" title="Stores" />
      {rows.length === 0 ? <Text style={styles.muted}>No stores match that search.</Text> : rows.map(([store, info], index) => (
        <Pressable key={store} style={[styles.row, index > 0 && styles.rowBordered]} onPress={() => onOpenStore(store)}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{store}</Text><Text style={styles.rowMeta}>{info.trips} trips</Text></View>
          <Text style={styles.rowAmount}>${info.spend.toFixed(2)}</Text><Feather name="chevron-right" size={18} color={colors.subtle} />
        </Pressable>
      ))}
    </Panel>
  );
}

function SimpleSpendResults({ title, rows, search, empty }: { title: string; rows: [string, number][]; search: string; empty: string }) {
  const filtered = rows.filter(([name]) => !search || name.toLowerCase().includes(search));
  return (
    <Panel><SectionHeader eyebrow="ANALYTICS" title={title} />
      {filtered.length === 0 ? <Text style={styles.muted}>{empty}</Text> : filtered.map(([name, spend], index) => (
        <View key={name} style={[styles.row, index > 0 && styles.rowBordered]}><Text style={[styles.rowTitle, { flex: 1 }]}>{name}</Text><Text style={styles.rowAmount}>${spend.toFixed(2)}</Text></View>
      ))}
    </Panel>
  );
}

function ItemResults({ items, comparison }: { items: JoinedItem[]; comparison: Map<string, Map<string, number[]>> }) {
  const grouped = groupItems(items);
  return (
    <Panel><SectionHeader eyebrow="ITEMS" title="Item price history" />
      {grouped.length === 0 ? <Text style={styles.muted}>No parsed items match that search.</Text> : grouped.map(([name, rows], index) => {
        const avg = average(rows.map((item) => item.comparisonPrice).filter((value) => value > 0));
        const stores = comparison.get(name.toLowerCase())?.size ?? 0;
        return <View key={name} style={[styles.row, index > 0 && styles.rowBordered]}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{name}</Text><Text style={styles.rowMeta}>{rows.length} observations · {stores} {stores === 1 ? 'store' : 'stores'}</Text></View><Text style={styles.rowAmount}>{avg ? `$${avg.toFixed(2)} avg` : '—'}</Text></View>;
      })}
    </Panel>
  );
}

function StoreDetail({ store, summary, items, comparison }: { store: string; summary: { trips: number; spend: number; average: number }; items: JoinedItem[]; comparison: Map<string, Map<string, number[]>> }) {
  const grouped = groupItems(items);
  return (
    <>
      <View style={styles.statRow}>
        <StatCard tone="dark" label="STORE SPEND" value={`$${summary.spend.toFixed(2)}`} hint={`${summary.trips} ${summary.trips === 1 ? 'trip' : 'trips'}`} />
        <View style={{ width: spacing.sm }} />
        <StatCard tone="warm" label="AVG. TRIP" value={`$${summary.average.toFixed(2)}`} hint={store} />
      </View>
      <Panel>
        <SectionHeader eyebrow="PRICE CHECK" title="Items at this store" />
        {grouped.length === 0 ? <Text style={styles.muted}>No items match that search.</Text> : grouped.map(([name, rows], index) => {
          const here = average(rows.map((item) => item.comparisonPrice).filter((value) => value > 0));
          const storeMap = comparison.get(name.toLowerCase());
          const elsewhere = storeMap ? [...storeMap.entries()]
            .filter(([otherStore]) => otherStore !== store)
            .map(([otherStore, prices]) => [otherStore, average(prices)] as const)
            .filter(([, value]) => value > 0)
            .sort((a, b) => a[1] - b[1]) : [];
          const best = elsewhere[0];
          const delta = best && here ? here - best[1] : 0;
          return (
            <View key={name} style={[styles.compareRow, index > 0 && styles.rowBordered]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{name}</Text>
                <Text style={styles.rowMeta}>{rows.length} observation{rows.length === 1 ? '' : 's'} here</Text>
                {best ? <Text style={[styles.compareText, delta > 0.01 && styles.compareSavings]}>Best elsewhere: {best[0]} ${best[1].toFixed(2)}{delta > 0.01 ? ` · $${delta.toFixed(2)} less` : ''}</Text> : <Text style={styles.rowMeta}>No other-store comparison yet</Text>}
              </View>
              <Text style={styles.rowAmount}>{here ? `$${here.toFixed(2)}` : '—'}</Text>
            </View>
          );
        })}
      </Panel>
    </>
  );
}

function groupItems(items: JoinedItem[]) {
  const grouped = new Map<string, JoinedItem[]>();
  for (const item of items) {
    const rows = grouped.get(item.displayName) ?? [];
    rows.push(item);
    grouped.set(item.displayName, rows);
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  controls: { marginBottom: spacing.lg, zIndex: 10 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.xl, paddingHorizontal: spacing.md, minHeight: 52, marginBottom: spacing.sm },
  dropdownIcon: { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  dropdownText: { ...type.bodyStrong, color: colors.ink, flex: 1 },
  dropdownMenu: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.xl, marginBottom: spacing.sm, overflow: 'hidden' },
  dropdownOption: { minHeight: 46, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownOptionActive: { backgroundColor: colors.primaryTint },
  dropdownOptionText: { ...type.body, color: colors.ink },
  dropdownOptionTextActive: { ...type.bodyStrong, color: colors.primary },
  statRow: { flexDirection: 'row', marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  compareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  rowBordered: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { ...type.bodyStrong, color: colors.ink },
  rowMeta: { ...type.caption, marginTop: 2 },
  rowAmount: { ...type.bodyStrong, color: colors.primary },
  compareText: { ...type.caption, marginTop: 5, color: colors.muted },
  compareSavings: { color: colors.primary },
  storeRow: { paddingVertical: spacing.md },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  rank: { width: 28, height: 28, borderRadius: radii.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...type.caption, color: colors.primary, fontFamily: 'Manrope_700Bold' },
  storeName: { ...type.bodyStrong, color: colors.ink },
  storeAmount: { ...type.bodyStrong, color: colors.primary },
  barTrack: { height: 6, borderRadius: radii.pill, backgroundColor: colors.hairline, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
  muted: { ...type.body, color: colors.muted },
});
