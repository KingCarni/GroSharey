import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  LoadingState,
  Panel,
  SectionHeader,
  StatCard,
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
  normalized_name: string | null;
  raw_name: string;
  line_total: number | null;
  unit_price: number | null;
  quantity: number | null;
};

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select('id, normalized_name, raw_name, line_total, unit_price, quantity')
        .eq('household_id', id),
    ]);
    if (receiptResult.error) return Alert.alert('Could not load analytics', receiptResult.error.message);
    if (itemResult.error) return Alert.alert('Could not load item analytics', itemResult.error.message);
    setReceipts((receiptResult.data ?? []) as Receipt[]);
    setItems((itemResult.data ?? []) as ReceiptItem[]);
  }

  const metrics = useMemo(() => {
    const totals = receipts.map((receipt) => Number(receipt.total_amount ?? 0));
    const totalSpend = totals.reduce((sum, value) => sum + value, 0);
    const storeTotals = new Map<string, number>();
    for (const receipt of receipts) {
      const store = receipt.store_name?.trim() || 'Unknown store';
      storeTotals.set(store, (storeTotals.get(store) ?? 0) + Number(receipt.total_amount ?? 0));
    }
    const stores = [...storeTotals.entries()].sort((a, b) => b[1] - a[1]);
    const maxStoreTotal = stores.length > 0 ? stores[0]![1] : 0;

    const productTotals = new Map<string, { spend: number; count: number }>();
    let itemSpend = 0;
    let pricedItems = 0;
    for (const item of items) {
      const name = item.normalized_name?.trim() || item.raw_name?.trim() || 'Unknown item';
      const price = Number(item.line_total ?? item.unit_price ?? 0);
      if (price > 0) {
        itemSpend += price;
        pricedItems += 1;
      }
      const current = productTotals.get(name) ?? { spend: 0, count: 0 };
      current.spend += price;
      current.count += Number(item.quantity ?? 1) || 1;
      productTotals.set(name, current);
    }
    const products = [...productTotals.entries()]
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 8);

    return {
      totalSpend,
      average: receipts.length ? totalSpend / receipts.length : 0,
      stores,
      maxStoreTotal,
      recent: receipts.slice(0, 5),
      products,
      parsedLines: items.length,
      pricedItems,
      averageLinePrice: pricedItems ? itemSpend / pricedItems : 0,
    };
  }, [receipts, items]);

  if (loading) return <AppScreen><LoadingState label="Crunching numbers" /></AppScreen>;

  return (
    <AppScreen scroll padded={false} contentContainerStyle={styles.scroll}>
      <AppHeader
        title="Spending"
        eyebrow="ANALYTICS"
        subtitle="Receipt totals plus parsed grocery line-item data."
        onBack={() => router.back()}
      />

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
        {metrics.products.length === 0 ? (
          <Text style={styles.muted}>Parsed receipt items will show your highest-spend groceries here.</Text>
        ) : metrics.products.map(([name, info], index) => (
          <View key={name} style={[styles.productRow, index > 0 && styles.activityBordered]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityStore} numberOfLines={1}>{name}</Text>
              <Text style={styles.activityDate}>{info.count.toFixed(info.count % 1 ? 1 : 0)} purchased</Text>
            </View>
            <Text style={styles.activityAmount}>${info.spend.toFixed(2)}</Text>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="STORES" title="Spend by store" />
        {metrics.stores.length === 0 ? (
          <Text style={styles.muted}>Add totals to your receipts to start tracking spending.</Text>
        ) : metrics.stores.map(([store, amount], index) => {
          const share = metrics.maxStoreTotal ? amount / metrics.maxStoreTotal : 0;
          return (
            <View key={store} style={styles.storeRow}>
              <View style={styles.storeHeader}>
                <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                <Text style={styles.storeName} numberOfLines={1}>{store}</Text>
                <Text style={styles.storeAmount}>${amount.toFixed(2)}</Text>
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(6, share * 100)}%` }]} /></View>
            </View>
          );
        })}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="ACTIVITY" title="Recent spending" />
        {metrics.recent.length === 0 ? (
          <EmptyState icon="clock" title="Nothing yet" body="Once you log receipts with totals they will appear here." />
        ) : metrics.recent.map((receipt, i) => (
          <View key={receipt.id} style={[styles.activityRow, i > 0 && styles.activityBordered]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityStore}>{receipt.store_name ?? 'Unknown store'}</Text>
              <Text style={styles.activityDate}>{new Date(receipt.purchased_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            </View>
            <Text style={styles.activityAmount}>${Number(receipt.total_amount ?? 0).toFixed(2)}</Text>
          </View>
        ))}
      </Panel>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  statRow: { flexDirection: 'row', marginBottom: spacing.lg },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  storeRow: { paddingVertical: spacing.md },
  storeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  rank: { width: 28, height: 28, borderRadius: radii.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rankText: { ...type.caption, color: colors.primary, fontFamily: 'Manrope_700Bold' },
  storeName: { ...type.bodyStrong, flex: 1, color: colors.ink },
  storeAmount: { ...type.bodyStrong, color: colors.primary },
  barTrack: { height: 6, borderRadius: radii.pill, backgroundColor: colors.hairline, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  activityBordered: { borderTopWidth: 1, borderTopColor: colors.hairline },
  activityStore: { ...type.bodyStrong, color: colors.ink },
  activityDate: { ...type.caption, marginTop: 2 },
  activityAmount: { ...type.bodyStrong, color: colors.primary },
  muted: { ...type.body, color: colors.muted },
});
