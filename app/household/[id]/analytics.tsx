import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../src/lib/supabase';

type Receipt = { id: string; store_name: string | null; total_amount: number | null; purchased_at: string };

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => { if (id) void load(); }, [id]);

  async function load() {
    const { data, error } = await supabase.from('receipts').select('id, store_name, total_amount, purchased_at').eq('household_id', id).is('deleted_at', null).not('total_amount', 'is', null).order('purchased_at', { ascending: false });
    if (error) return Alert.alert('Could not load analytics', error.message);
    setReceipts((data ?? []) as Receipt[]);
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
    return { totalSpend, average: receipts.length ? totalSpend / receipts.length : 0, stores };
  }, [receipts]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Spending analytics</Text>
        <Text style={styles.subtitle}>Based on receipts with a saved total.</Text>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricLabel}>TOTAL SPEND</Text><Text style={styles.metricValue}>${metrics.totalSpend.toFixed(2)}</Text></View>
          <View style={styles.metric}><Text style={styles.metricLabel}>AVG. TRIP</Text><Text style={styles.metricValue}>${metrics.average.toFixed(2)}</Text></View>
          <View style={styles.metric}><Text style={styles.metricLabel}>RECEIPTS</Text><Text style={styles.metricValue}>{receipts.length}</Text></View>
        </View>
        <Text style={styles.sectionTitle}>Spend by store</Text>
        <FlatList
          data={metrics.stores}
          keyExtractor={([store]) => store}
          ListEmptyComponent={<Text style={styles.empty}>Add receipt totals to begin tracking spending.</Text>}
          renderItem={({ item: [store, amount], index }) => (
            <View style={styles.row}>
              <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
              <Text style={styles.store}>{store}</Text>
              <Text style={styles.amount}>${amount.toFixed(2)}</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 }, back: { color: '#173F35', fontWeight: '800' },
  title: { color: '#102C25', fontSize: 32, fontWeight: '800', marginTop: 14 }, subtitle: { color: '#607069', marginTop: 5, marginBottom: 18 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 24 }, metric: { flex: 1, backgroundColor: '#173F35', borderRadius: 16, padding: 14, minHeight: 94, justifyContent: 'space-between' },
  metricLabel: { color: '#CFE1D8', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, metricValue: { color: '#FFF', fontSize: 21, fontWeight: '800' },
  sectionTitle: { color: '#102C25', fontSize: 22, fontWeight: '800', marginBottom: 10 }, row: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  rank: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E5ECE7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, rankText: { color: '#173F35', fontWeight: '800' },
  store: { color: '#102C25', flex: 1, fontSize: 16, fontWeight: '700' }, amount: { color: '#173F35', fontSize: 16, fontWeight: '800' }, empty: { color: '#66746E', textAlign: 'center', padding: 30 },
});
