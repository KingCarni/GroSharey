import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  LoadingState,
  Panel,
  PrimaryButton,
  ReceiptCard,
  SectionHeader,
  TextField,
} from '../../../src/components/ui';
import { useAuth } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';
import { colors, radii, spacing, type } from '../../../src/theme';

type Receipt = {
  id: string;
  store_name: string | null;
  total_amount: number | null;
  currency: string;
  purchased_at: string;
  parse_status: string;
  storage_path: string | null;
};

export default function ReceiptsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [storeName, setStoreName] = useState('');
  const [total, setTotal] = useState('');
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Receipt | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function initial() {
      await loadReceipts();
      if (!cancelled) setInitialLoading(false);
    }
    void initial();
    const channel = supabase.channel(`receipts:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: `household_id=eq.${id}` }, loadReceipts)
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadReceipts() {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('household_id', id)
      .is('deleted_at', null)
      .order('purchased_at', { ascending: false });
    if (error) return Alert.alert('Could not load receipts', error.message);
    const rows = (data ?? []) as Receipt[];
    setReceipts(rows);
    void hydrateThumbs(rows);
  }

  async function hydrateThumbs(rows: Receipt[]) {
    const needed = rows.filter((row) => row.storage_path && !thumbs[row.id]);
    if (needed.length === 0) return;
    const results = await Promise.all(
      needed.map(async (row) => {
        if (!row.storage_path) return null;
        const { data } = await supabase.storage
          .from('receipts')
          .createSignedUrl(row.storage_path, 60 * 30);
        return data?.signedUrl ? { id: row.id, uri: data.signedUrl } : null;
      }),
    );
    const next = { ...thumbs };
    for (const item of results) {
      if (item) next[item.id] = item.uri;
    }
    setThumbs(next);
  }

  async function openPreview(receipt: Receipt) {
    if (!receipt.storage_path) {
      Alert.alert('No image', 'This receipt does not have an image attached.');
      return;
    }
    const cached = thumbs[receipt.id];
    if (cached) {
      setPreview(receipt);
      setPreviewUri(cached);
      return;
    }
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 60 * 30);
    if (error || !data?.signedUrl) {
      Alert.alert('Could not open receipt', error?.message ?? 'Unknown error');
      return;
    }
    setPreview(receipt);
    setPreviewUri(data.signedUrl);
  }

  async function uploadReceipt() {
    if (!id || !user) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert('Camera permission needed', 'Allow camera access to photograph receipts.');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const bytes = await response.arrayBuffer();
      const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${id}/${user.id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg' });
      if (uploadError) throw uploadError;

      const parsedTotal = total.trim() ? Number(total) : null;
      if (parsedTotal !== null && (!Number.isFinite(parsedTotal) || parsedTotal < 0)) {
        throw new Error('Enter a valid receipt total.');
      }

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
      Alert.alert(
        'Could not upload receipt',
        error instanceof Error ? error.message : 'Unknown upload error',
      );
    } finally {
      setBusy(false);
    }
  }

  if (initialLoading) {
    return (
      <AppScreen>
        <LoadingState label="Loading receipts" />
      </AppScreen>
    );
  }

  return (
    <AppScreen padded={false}>
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.scroll,
          receipts.length === 0 && styles.scrollGrow,
        ]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <AppHeader
              title="Receipts"
              eyebrow="TRACK SPEND"
              subtitle="Snap a photo after each shop. Store and total are optional — you can add them later."
              onBack={() => router.back()}
            />

            <Panel>
              <SectionHeader eyebrow="NEW RECEIPT" title="Log a shopping trip" />
              <View style={styles.formRow}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  label="Store"
                  placeholder="Aldi, Trader Joe's…"
                  leftIcon="shopping-bag"
                  value={storeName}
                  onChangeText={setStoreName}
                />
                <TextField
                  containerStyle={styles.totalField}
                  label="Total"
                  placeholder="0.00"
                  leftIcon="dollar-sign"
                  keyboardType="decimal-pad"
                  value={total}
                  onChangeText={setTotal}
                />
              </View>
              <PrimaryButton
                label={busy ? 'Uploading…' : 'Take receipt photo'}
                icon="camera"
                onPress={uploadReceipt}
                loading={busy}
                testID="upload-receipt-btn"
              />
            </Panel>

            <SectionHeader
              eyebrow="HISTORY"
              title="Recent receipts"
              trailing={
                <Text style={type.caption}>
                  {receipts.length} total
                </Text>
              }
            />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="file-text"
            title="No receipts yet"
            body="Photograph a receipt above and it will appear here for the whole household."
          />
        }
        renderItem={({ item }) => (
          <ReceiptCard
            storeName={item.store_name}
            totalAmount={item.total_amount}
            currency={item.currency}
            purchasedAt={item.purchased_at}
            parseStatus={item.parse_status}
            thumbUri={thumbs[item.id] ?? null}
            onPress={item.storage_path ? () => openPreview(item) : undefined}
            testID={`receipt-card-${item.id}`}
          />
        )}
      />

      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          <View style={styles.previewCard} onStartShouldSetResponder={() => true}>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewStore}>
                  {preview?.store_name ?? 'Unknown store'}
                </Text>
                <Text style={styles.previewDate}>
                  {preview
                    ? new Date(preview.purchased_at).toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => setPreview(null)}
                style={styles.previewClose}
                accessibilityRole="button"
                accessibilityLabel="Close preview"
              >
                <Feather name="x" size={20} color={colors.ink} />
              </Pressable>
            </View>
            {previewUri && (
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            )}
            {preview && preview.total_amount != null && (
              <Text style={styles.previewTotal}>
                {preview.currency} ${Number(preview.total_amount).toFixed(2)}
              </Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  scrollGrow: { flexGrow: 1 },

  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  totalField: { width: 130 },

  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,44,37,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  previewCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.xxl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 440,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  previewStore: { ...type.h2, fontSize: 20, lineHeight: 24 },
  previewDate: { ...type.caption, marginTop: 2 },
  previewClose: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceInk,
  },
  previewTotal: {
    ...type.h2,
    fontSize: 22,
    marginTop: spacing.md,
    color: colors.primary,
    textAlign: 'right',
  },
});
