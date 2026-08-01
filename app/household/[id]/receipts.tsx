import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';

type Receipt = {
  id: string;
  store_name: string | null;
  total_amount: number | null;
  currency: string;
  purchased_at: string;
  parse_status: string;
};

export default function ReceiptsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [storeName, setStoreName] = useState('');
  const [total, setTotal] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void loadReceipts();
    const channel = supabase.channel(`receipts:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: `household_id=eq.${id}` }, loadReceipts)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  async function loadReceipts() {
    const { data, error } = await supabase.from('receipts').select('*').eq('household_id', id).is('deleted_at', null).order('purchased_at', { ascending: false });
    if (error) return Alert.alert('Could not load receipts', error.message);
    setReceipts((data ?? []) as Receipt[]);
  }

  async function uploadReceipt() {
    if (!id || !user) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to photograph receipts.');

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const bytes = await response.arrayBuffer();
      const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${id}/${user.id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg' });
      if (uploadError) throw uploadError;

      const parsedTotal = total.trim() ? Number(total) : null;
      if (parsedTotal !== null && (!Number.isFinite(parsedTotal) || parsedTotal < 0)) throw new Error('Enter a valid receipt total.');

      const { error: insertError } = await supabase.from('receipts').insert({
        household_id: id,
        storage_path: path,
        store_name: storeName.trim() || null,
        total_amount: parsedTotal,
        parse_status: parsedTotal !== null || storeName.trim() ? 'manual' : 'pending',
      });
      if (insertError) throw insertError;
      setStoreName('');
      setTotal('');
      await loadReceipts();
    } catch (error) {
      Alert.alert('Could not upload receipt', error instanceof Error ? error.message : 'Unknown upload error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Receipts</Text>
        <Text style={styles.subtitle}>Photograph receipts now. Automated parsing will plug into the pending records later.</Text>
        <View style={styles.panel}>
          <TextInput style={styles.input} placeholder="Store (optional)" placeholderTextColor="#78857F" value={storeName} onChangeText={setStoreName} />
          <TextInput style={styles.input} placeholder="Total (optional)" placeholderTextColor="#78857F" keyboardType="decimal-pad" value={total} onChangeText={setTotal} />
          <Pressable style={styles.button} onPress={uploadReceipt} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Uploading…' : 'Take receipt photo'}</Text></Pressable>
        </View>
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={receipts.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={<Text style={styles.empty}>No receipts uploaded yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View><Text style={styles.store}>{item.store_name ?? 'Unknown store'}</Text><Text style={styles.date}>{new Date(item.purchased_at).toLocaleDateString()}</Text></View>
              <View style={styles.right}><Text style={styles.total}>{item.total_amount === null ? 'Pending' : `${item.currency} $${Number(item.total_amount).toFixed(2)}`}</Text><Text style={styles.status}>{item.parse_status}</Text></View>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 }, back: { color: '#173F35', fontWeight: '800' },
  title: { color: '#102C25', fontSize: 32, fontWeight: '800', marginTop: 14 }, subtitle: { color: '#607069', lineHeight: 20, marginTop: 5, marginBottom: 16 },
  panel: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, gap: 10, marginBottom: 16 }, input: { backgroundColor: '#F4F7F2', borderRadius: 12, color: '#102C25', paddingHorizontal: 14, paddingVertical: 12 },
  button: { backgroundColor: '#173F35', borderRadius: 12, padding: 14, alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }, store: { color: '#102C25', fontSize: 17, fontWeight: '800' },
  date: { color: '#6A7872', marginTop: 3 }, right: { alignItems: 'flex-end' }, total: { color: '#173F35', fontWeight: '800' }, status: { color: '#718079', fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' }, empty: { color: '#66746E', textAlign: 'center' },
});
