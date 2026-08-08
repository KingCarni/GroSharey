import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
  SecondaryButton,
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
  raw_text?: string | null;
};

type PendingImage = {
  uri: string;
  mimeType: string;
  fileName?: string | null;
};

export default function ReceiptsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [storeName, setStoreName] = useState('');
  const [total, setTotal] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Receipt | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [editStore, setEditStore] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  async function refreshReceipts() {
    setRefreshing(true);
    await loadReceipts();
    setRefreshing(false);
  }

  async function hydrateThumbs(rows: Receipt[]) {
    const needed = rows.filter((row) => row.storage_path && !thumbs[row.id]);
    if (needed.length === 0) return;
    const results = await Promise.all(
      needed.map(async (row) => {
        if (!row.storage_path) return null;
        const { data } = await supabase.storage.from('receipts').createSignedUrl(row.storage_path, 60 * 30);
        return data?.signedUrl ? { id: row.id, uri: data.signedUrl } : null;
      }),
    );
    setThumbs((current) => {
      const next = { ...current };
      for (const item of results) if (item) next[item.id] = item.uri;
      return next;
    });
  }

  async function selectFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to photograph receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
    });
    acceptPickedImage(result);
  }

  async function selectFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose an existing receipt image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
    });
    acceptPickedImage(result);
  }

  function acceptPickedImage(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPendingImage({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileName: asset.fileName,
    });
  }

  function validateTotal(value: string): number | null {
    const normalized = value.trim().replace(/[$,]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Enter a valid receipt total.');
    return parsed;
  }

  async function savePendingReceipt() {
    if (!id || !user || !pendingImage) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const parsedTotal = validateTotal(total);
      const response = await fetch(pendingImage.uri);
      const bytes = await response.arrayBuffer();
      const extension = pendingImage.mimeType === 'image/png' ? 'png' : pendingImage.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${id}/${user.id}/${Date.now()}.${extension}`;
      uploadedPath = path;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, bytes, { contentType: pendingImage.mimeType, upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('receipts').insert({
        household_id: id,
        storage_path: path,
        store_name: storeName.trim() || null,
        total_amount: parsedTotal,
        parse_status: parsedTotal !== null || storeName.trim() ? 'manual' : 'pending',
      });
      if (insertError) throw insertError;

      setPendingImage(null);
      setStoreName('');
      setTotal('');
      await loadReceipts();
      Alert.alert('Receipt saved', 'The receipt is now available to everyone in this household.');
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('receipts').remove([uploadedPath]);
      Alert.alert('Could not save receipt', error instanceof Error ? error.message : 'Unknown upload error');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(receipt: Receipt) {
    if (!receipt.storage_path) {
      Alert.alert('No image', 'This receipt does not have an image attached.');
      return;
    }
    let uri = thumbs[receipt.id];
    if (!uri) {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 60 * 30);
      if (error || !data?.signedUrl) {
        Alert.alert('Could not open receipt', error?.message ?? 'Unknown error');
        return;
      }
      uri = data.signedUrl;
    }
    setPreview(receipt);
    setPreviewUri(uri);
  }

  function openEdit(receipt: Receipt) {
    setEditing(receipt);
    setEditStore(receipt.store_name ?? '');
    setEditTotal(receipt.total_amount == null ? '' : String(receipt.total_amount));
    setEditDate(receipt.purchased_at.slice(0, 10));
  }

  async function saveReceiptEdits() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const parsedTotal = validateTotal(editTotal);
      const parsedDate = new Date(`${editDate.trim()}T12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Use a valid date in YYYY-MM-DD format.');
      const { error } = await supabase
        .from('receipts')
        .update({
          store_name: editStore.trim() || null,
          total_amount: parsedTotal,
          purchased_at: parsedDate.toISOString(),
          parse_status: 'manual',
        })
        .eq('id', editing.id);
      if (error) throw error;
      setEditing(null);
      await loadReceipts();
    } catch (error) {
      Alert.alert('Could not update receipt', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSavingEdit(false);
    }
  }

  function confirmDeleteReceipt(receipt: Receipt) {
    Alert.alert('Delete receipt?', 'This removes the receipt image and its spending data from the household.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteReceipt(receipt) },
    ]);
  }

  async function deleteReceipt(receipt: Receipt) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', receipt.id);
      if (error) throw error;
      if (receipt.storage_path) {
        const { error: storageError } = await supabase.storage.from('receipts').remove([receipt.storage_path]);
        if (storageError) console.warn('Receipt image cleanup failed:', storageError.message);
      }
      setPreview(null);
      setEditing(null);
      setThumbs((current) => {
        const next = { ...current };
        delete next[receipt.id];
        return next;
      });
      await loadReceipts();
    } catch (error) {
      Alert.alert('Could not delete receipt', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => {
    const logged = receipts.filter((receipt) => receipt.total_amount != null);
    const spend = logged.reduce((sum, receipt) => sum + Number(receipt.total_amount ?? 0), 0);
    return {
      spend,
      average: logged.length ? spend / logged.length : 0,
      logged: logged.length,
    };
  }, [receipts]);

  if (initialLoading) {
    return <AppScreen><LoadingState label="Loading receipts" /></AppScreen>;
  }

  return (
    <AppScreen padded={false}>
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.scroll, receipts.length === 0 && styles.scrollGrow]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshReceipts} />}
        ListHeaderComponent={
          <>
            <AppHeader
              title="Receipts"
              eyebrow="TRACK SPEND"
              subtitle="Capture the receipt first, review it, then save it to your household history."
              onBack={() => router.back()}
            />

            <View style={styles.summaryRow}>
              <SummaryBox label="TOTAL SPEND" value={`$${summary.spend.toFixed(2)}`} />
              <SummaryBox label="AVG. TRIP" value={`$${summary.average.toFixed(2)}`} />
              <SummaryBox label="LOGGED" value={String(summary.logged)} />
            </View>

            <Panel>
              <SectionHeader eyebrow="NEW RECEIPT" title={pendingImage ? 'Review your receipt' : 'Capture a receipt'} />
              {pendingImage ? (
                <>
                  <Image source={{ uri: pendingImage.uri }} style={styles.pendingImage} resizeMode="contain" />
                  <View style={styles.captureActions}>
                    <SecondaryButton label="Retake" icon="camera" onPress={selectFromCamera} fullWidth={false} />
                    <SecondaryButton label="Choose another" icon="image" onPress={selectFromLibrary} fullWidth={false} />
                  </View>
                  <View style={styles.formRow}>
                    <TextField
                      containerStyle={{ flex: 1 }}
                      label="Store"
                      placeholder="Costco, Save-On-Foods…"
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
                  <PrimaryButton label="Save receipt" icon="check" onPress={savePendingReceipt} loading={busy} />
                  <Pressable onPress={() => setPendingImage(null)} style={styles.cancelCapture}>
                    <Text style={styles.cancelCaptureText}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.captureHelp}>Take a new photo or use one already saved on your phone. You can enter store and total after reviewing the image.</Text>
                  <PrimaryButton label="Take photo" icon="camera" onPress={selectFromCamera} />
                  <SecondaryButton label="Choose from photos" icon="image" onPress={selectFromLibrary} variant="outline" />
                </>
              )}
            </Panel>

            <SectionHeader
              eyebrow="HISTORY"
              title="Recent receipts"
              trailing={<Text style={type.caption}>{receipts.length} total</Text>}
            />
          </>
        }
        ListEmptyComponent={<EmptyState icon="file-text" title="No receipts yet" body="Capture your first receipt above. It will be shared with the household and included in spending analytics." />}
        renderItem={({ item }) => (
          <ReceiptCard
            storeName={item.store_name}
            totalAmount={item.total_amount}
            currency={item.currency}
            purchasedAt={item.purchased_at}
            parseStatus={item.parse_status}
            thumbUri={thumbs[item.id] ?? null}
            onPress={() => openPreview(item)}
            testID={`receipt-card-${item.id}`}
          />
        )}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreview(null)} />
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewStore}>{preview?.store_name ?? 'Unknown store'}</Text>
                <Text style={styles.previewDate}>{preview ? new Date(preview.purchased_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => setPreview(null)} style={styles.previewClose} accessibilityRole="button" accessibilityLabel="Close preview">
                <Feather name="x" size={20} color={colors.ink} />
              </Pressable>
            </View>
            {previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />}
            <View style={styles.previewMetaRow}>
              <View>
                <Text style={styles.previewMetaLabel}>TOTAL</Text>
                <Text style={styles.previewTotal}>{preview?.total_amount == null ? 'Not entered' : `${preview.currency} $${Number(preview.total_amount).toFixed(2)}`}</Text>
              </View>
              <Text style={styles.statusText}>{friendlyStatus(preview?.parse_status)}</Text>
            </View>
            <View style={styles.previewButtons}>
              <SecondaryButton label="Edit details" icon="edit-2" onPress={() => { if (preview) openEdit(preview); setPreview(null); }} fullWidth={false} />
              <SecondaryButton label="Delete" icon="trash-2" onPress={() => preview && confirmDeleteReceipt(preview)} fullWidth={false} variant="outline" />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.editBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
          <View style={styles.editSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editContent}>
              <SectionHeader eyebrow="RECEIPT DETAILS" title="Edit shopping trip" />
              <TextField label="Store" placeholder="Store name" leftIcon="shopping-bag" value={editStore} onChangeText={setEditStore} />
              <TextField label="Total" placeholder="0.00" leftIcon="dollar-sign" keyboardType="decimal-pad" value={editTotal} onChangeText={setEditTotal} />
              <TextField label="Purchase date" placeholder="YYYY-MM-DD" leftIcon="calendar" value={editDate} onChangeText={setEditDate} autoCapitalize="none" />
              <PrimaryButton label="Save changes" icon="check" loading={savingEdit} onPress={saveReceiptEdits} />
              <SecondaryButton label="Cancel" onPress={() => setEditing(null)} variant="ghost" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function friendlyStatus(status?: string) {
  switch (status) {
    case 'manual': return 'Details entered manually';
    case 'complete':
    case 'parsed': return 'Receipt parsed';
    case 'processing': return 'Parsing receipt…';
    case 'failed':
    case 'error': return 'Parsing failed';
    default: return 'Ready for parsing';
  }
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  scrollGrow: { flexGrow: 1 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryBox: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.lg, padding: spacing.md },
  summaryLabel: { ...type.caption, color: colors.subtle, fontSize: 9, letterSpacing: 0.8 },
  summaryValue: { ...type.h3, color: colors.primary, fontSize: 17, marginTop: 4 },
  captureHelp: { ...type.bodySmall, color: colors.muted, lineHeight: 20, marginBottom: spacing.md },
  pendingImage: { width: '100%', aspectRatio: 4 / 5, maxHeight: 420, backgroundColor: colors.surfaceInk, borderRadius: radii.lg, marginBottom: spacing.md },
  captureActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  totalField: { width: 130 },
  cancelCapture: { alignItems: 'center', paddingVertical: spacing.md },
  cancelCaptureText: { ...type.bodyStrong, color: colors.muted },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(16,44,37,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  previewCard: { backgroundColor: colors.bg, borderRadius: radii.xxl, padding: spacing.lg, width: '100%', maxWidth: 440, maxHeight: '92%' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  previewStore: { ...type.h2, fontSize: 20, lineHeight: 24 },
  previewDate: { ...type.caption, marginTop: 2 },
  previewClose: { width: 36, height: 36, borderRadius: radii.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', aspectRatio: 3 / 4, maxHeight: 520, borderRadius: radii.lg, backgroundColor: colors.surfaceInk },
  previewMetaRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  previewMetaLabel: { ...type.caption, color: colors.subtle, fontSize: 10 },
  previewTotal: { ...type.h2, fontSize: 20, color: colors.primary, marginTop: 2 },
  statusText: { ...type.caption, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  previewButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg },
  editBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,44,37,0.55)' },
  editSheet: { maxHeight: '86%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl },
  sheetHandle: { width: 44, height: 5, borderRadius: radii.pill, backgroundColor: colors.hairlineWarm, alignSelf: 'center', marginTop: spacing.sm },
  editContent: { padding: spacing.xl, paddingBottom: spacing.xxxl },
});
