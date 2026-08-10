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
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string;
  purchased_at: string;
  parse_status: string;
  parse_confidence: number | null;
  storage_path: string | null;
  raw_text?: string | null;
};

type ReceiptItem = {
  id: string;
  receipt_id: string;
  household_id: string;
  line_number: number;
  raw_name: string;
  normalized_name: string | null;
  brand: string | null;
  category: string | null;
  quantity: number | null;
  size: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  confidence: number;
};

type EditableReceiptItem = {
  id: string;
  lineNumber: number;
  rawName: string;
  name: string;
  brand: string;
  category: string;
  quantity: string;
  size: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  confidence: number;
  isNew?: boolean;
  deleted?: boolean;
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
  const [previewItems, setPreviewItems] = useState<ReceiptItem[]>([]);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [editStore, setEditStore] = useState('');
  const [editSubtotal, setEditSubtotal] = useState('');
  const [editTax, setEditTax] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editItems, setEditItems] = useState<EditableReceiptItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
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

  async function loadReceiptItems(receiptId: string) {
    const { data, error } = await supabase
      .from('receipt_items')
      .select('*')
      .eq('receipt_id', receiptId)
      .order('line_number', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ReceiptItem[];
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
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
    acceptPickedImage(result);
  }

  async function selectFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose an existing receipt image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
    acceptPickedImage(result);
  }

  function acceptPickedImage(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPendingImage({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName });
  }

  function validateMoney(value: string): number | null {
    const normalized = value.trim().replace(/[$,]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Enter a valid non-negative amount.');
    return parsed;
  }

  function optionalNumber(value: string): number | null {
    const normalized = value.trim().replace(/[$,]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  async function savePendingReceipt() {
    if (!id || !user || !pendingImage) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const parsedTotal = validateMoney(total);
      const response = await fetch(pendingImage.uri);
      const bytes = await response.arrayBuffer();
      const extension = pendingImage.mimeType === 'image/png' ? 'png' : pendingImage.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${id}/${user.id}/${Date.now()}.${extension}`;
      uploadedPath = path;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, bytes, { contentType: pendingImage.mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('receipts').insert({
        household_id: id,
        storage_path: path,
        store_name: storeName.trim() || null,
        total_amount: parsedTotal,
        parse_status: 'pending',
      });
      if (insertError) throw insertError;
      setPendingImage(null);
      setStoreName('');
      setTotal('');
      await loadReceipts();
      Alert.alert('Receipt saved', 'We’ll read the receipt and add its line items automatically.');
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('receipts').remove([uploadedPath]);
      Alert.alert('Could not save receipt', error instanceof Error ? error.message : 'Unknown upload error');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(receipt: Receipt) {
    setPreview(receipt);
    setPreviewItems([]);
    try {
      const [items, signed] = await Promise.all([
        loadReceiptItems(receipt.id),
        receipt.storage_path
          ? supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 60 * 30)
          : Promise.resolve({ data: null, error: null }),
      ]);
      setPreviewItems(items);
      if (signed.data?.signedUrl) setPreviewUri(signed.data.signedUrl);
      else setPreviewUri(null);
    } catch (error) {
      Alert.alert('Could not load receipt details', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function openEdit(receipt: Receipt) {
    setEditing(receipt);
    setEditStore(receipt.store_name ?? '');
    setEditSubtotal(receipt.subtotal_amount == null ? '' : String(receipt.subtotal_amount));
    setEditTax(receipt.tax_amount == null ? '' : String(receipt.tax_amount));
    setEditTotal(receipt.total_amount == null ? '' : String(receipt.total_amount));
    setEditDate(receipt.purchased_at.slice(0, 10));
    setItemsLoading(true);
    try {
      const items = await loadReceiptItems(receipt.id);
      setEditItems(items.map(toEditableItem));
    } catch (error) {
      Alert.alert('Could not load parsed items', error instanceof Error ? error.message : 'Unknown error');
      setEditItems([]);
    } finally {
      setItemsLoading(false);
    }
  }

  function updateEditItem(itemId: string, field: keyof EditableReceiptItem, value: string) {
    setEditItems((current) => current.map((item) => item.id === itemId ? { ...item, [field]: value } : item));
  }

  function addMissingItem() {
    const nextLine = Math.max(0, ...editItems.map((item) => item.lineNumber)) + 1;
    setEditItems((current) => [...current, {
      id: `new-${Date.now()}`,
      lineNumber: nextLine,
      rawName: '',
      name: '',
      brand: '',
      category: '',
      quantity: '1',
      size: '',
      unit: '',
      unitPrice: '',
      lineTotal: '',
      confidence: 1,
      isNew: true,
    }]);
  }

  function removeEditItem(itemId: string) {
    setEditItems((current) => current.map((item) => item.id === itemId ? { ...item, deleted: true } : item));
  }

  async function saveReceiptEdits() {
    if (!editing || !id) return;
    setSavingEdit(true);
    try {
      const parsedSubtotal = validateMoney(editSubtotal);
      const parsedTax = validateMoney(editTax);
      const parsedTotal = validateMoney(editTotal);
      const parsedDate = new Date(`${editDate.trim()}T12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Use a valid date in YYYY-MM-DD format.');

      const { error: receiptError } = await supabase.from('receipts').update({
        store_name: editStore.trim() || null,
        subtotal_amount: parsedSubtotal,
        tax_amount: parsedTax,
        total_amount: parsedTotal,
        purchased_at: parsedDate.toISOString(),
      }).eq('id', editing.id);
      if (receiptError) throw receiptError;

      for (const item of editItems) {
        if (item.deleted) {
          if (!item.isNew) {
            const { error } = await supabase.from('receipt_items').delete().eq('id', item.id);
            if (error) throw error;
          }
          continue;
        }
        const payload = {
          raw_name: item.rawName.trim() || item.name.trim() || 'Unlabelled item',
          normalized_name: item.name.trim() || null,
          brand: item.brand.trim() || null,
          category: item.category.trim() || null,
          quantity: optionalNumber(item.quantity),
          size: optionalNumber(item.size),
          unit: item.unit.trim() || null,
          unit_price: optionalNumber(item.unitPrice),
          line_total: optionalNumber(item.lineTotal),
          confidence: item.isNew ? 1 : item.confidence,
        };

        if (item.isNew) {
          const { data: inserted, error } = await supabase.from('receipt_items').insert({
            receipt_id: editing.id,
            household_id: id,
            line_number: item.lineNumber,
            ...payload,
          }).select('id').single();
          if (error) throw error;
          if (inserted?.id) {
            const { error: touchError } = await supabase.from('receipt_items').update({ confidence: 1 }).eq('id', inserted.id);
            if (touchError) throw touchError;
          }
        } else {
          const { error } = await supabase.from('receipt_items').update(payload).eq('id', item.id);
          if (error) throw error;
        }
      }

      setEditing(null);
      await loadReceipts();
      Alert.alert('Receipt updated', 'Corrections were saved and price observations were refreshed.');
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
      const { error } = await supabase.from('receipts').update({ deleted_at: new Date().toISOString() }).eq('id', receipt.id);
      if (error) throw error;
      if (receipt.storage_path) await supabase.storage.from('receipts').remove([receipt.storage_path]);
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
    return { spend, average: logged.length ? spend / logged.length : 0, logged: logged.length };
  }, [receipts]);

  if (initialLoading) return <AppScreen><LoadingState label="Loading receipts" /></AppScreen>;

  return (
    <AppScreen padded={false}>
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.scroll, receipts.length === 0 && styles.scrollGrow]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshReceipts} />}
        ListHeaderComponent={<>
          <AppHeader title="Receipts" eyebrow="TRACK SPEND" subtitle="Capture, parse, review and correct every shopping trip." onBack={() => router.back()} />
          <View style={styles.summaryRow}>
            <SummaryBox label="TOTAL SPEND" value={`$${summary.spend.toFixed(2)}`} />
            <SummaryBox label="AVG. TRIP" value={`$${summary.average.toFixed(2)}`} />
            <SummaryBox label="LOGGED" value={String(summary.logged)} />
          </View>
          <Panel>
            <SectionHeader eyebrow="NEW RECEIPT" title={pendingImage ? 'Review your receipt' : 'Capture a receipt'} />
            {pendingImage ? <>
              <Image source={{ uri: pendingImage.uri }} style={styles.pendingImage} resizeMode="contain" />
              <View style={styles.captureActions}>
                <SecondaryButton label="Retake" icon="camera" onPress={selectFromCamera} fullWidth={false} />
                <SecondaryButton label="Choose another" icon="image" onPress={selectFromLibrary} fullWidth={false} />
              </View>
              <View style={styles.formRow}>
                <TextField containerStyle={{ flex: 1 }} label="Store (optional)" placeholder="Safeway…" leftIcon="shopping-bag" value={storeName} onChangeText={setStoreName} />
                <TextField containerStyle={styles.totalField} label="Total (optional)" placeholder="0.00" leftIcon="dollar-sign" keyboardType="decimal-pad" value={total} onChangeText={setTotal} />
              </View>
              <PrimaryButton label="Save & parse receipt" icon="check" onPress={savePendingReceipt} loading={busy} />
              <Pressable onPress={() => setPendingImage(null)} style={styles.cancelCapture}><Text style={styles.cancelCaptureText}>Cancel</Text></Pressable>
            </> : <>
              <Text style={styles.captureHelp}>Take a photo or choose one from your phone. GroSharey will OCR the receipt and extract line-item prices automatically.</Text>
              <PrimaryButton label="Take photo" icon="camera" onPress={selectFromCamera} />
              <SecondaryButton label="Choose from photos" icon="image" onPress={selectFromLibrary} variant="outline" />
            </>}
          </Panel>
          <SectionHeader eyebrow="HISTORY" title="Recent receipts" trailing={<Text style={type.caption}>{receipts.length} total</Text>} />
        </>}
        ListEmptyComponent={<EmptyState icon="file-text" title="No receipts yet" body="Capture your first receipt above. Parsed prices will feed spending and price analytics." />}
        renderItem={({ item }) => <ReceiptCard
          storeName={item.store_name}
          totalAmount={item.total_amount}
          currency={item.currency}
          purchasedAt={item.purchased_at}
          parseStatus={item.parse_status}
          thumbUri={thumbs[item.id] ?? null}
          onPress={() => void openPreview(item)}
          testID={`receipt-card-${item.id}`}
        />}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreview(null)} />
          <View style={styles.previewCard}>
            <ScrollView contentContainerStyle={styles.previewContent}>
              <View style={styles.previewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewStore}>{preview?.store_name ?? 'Unknown store'}</Text>
                  <Text style={styles.previewDate}>{preview ? new Date(preview.purchased_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => setPreview(null)} style={styles.previewClose}><Feather name="x" size={20} color={colors.ink} /></Pressable>
              </View>
              {previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />}
              <View style={styles.moneyGrid}>
                <MoneyCell label="SUBTOTAL" value={preview?.subtotal_amount} currency={preview?.currency} />
                <MoneyCell label="TAX" value={preview?.tax_amount} currency={preview?.currency} />
                <MoneyCell label="TOTAL" value={preview?.total_amount} currency={preview?.currency} strong />
              </View>
              <View style={styles.parseSummary}>
                <Text style={styles.statusText}>{friendlyStatus(preview?.parse_status)}</Text>
                {preview?.parse_confidence != null && <Text style={styles.confidenceText}>{Math.round(preview.parse_confidence * 100)}% parse confidence</Text>}
              </View>
              <SectionHeader eyebrow="PARSED ITEMS" title={`${previewItems.length} line ${previewItems.length === 1 ? 'item' : 'items'}`} />
              {previewItems.length === 0 ? <Text style={styles.captureHelp}>No parsed line items were saved for this receipt.</Text> : previewItems.map((item) => <ParsedItemRow key={item.id} item={item} currency={preview?.currency ?? 'CAD'} />)}
              <View style={styles.previewButtons}>
                <SecondaryButton label="Edit parsed details" icon="edit-2" onPress={() => { if (preview) void openEdit(preview); setPreview(null); }} fullWidth={false} />
                <SecondaryButton label="Delete" icon="trash-2" onPress={() => preview && confirmDeleteReceipt(preview)} fullWidth={false} variant="outline" />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.editBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
          <View style={styles.editSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editContent}>
              <SectionHeader eyebrow="RECEIPT DETAILS" title="Review parsed receipt" />
              <Text style={styles.captureHelp}>Correct anything the parser got wrong. Your changes also update the price-history data derived from this receipt.</Text>
              <TextField label="Store" placeholder="Store name" leftIcon="shopping-bag" value={editStore} onChangeText={setEditStore} />
              <View style={styles.threeFields}>
                <TextField containerStyle={{ flex: 1 }} label="Subtotal" placeholder="0.00" keyboardType="decimal-pad" value={editSubtotal} onChangeText={setEditSubtotal} />
                <TextField containerStyle={{ flex: 1 }} label="Tax" placeholder="0.00" keyboardType="decimal-pad" value={editTax} onChangeText={setEditTax} />
                <TextField containerStyle={{ flex: 1 }} label="Total" placeholder="0.00" keyboardType="decimal-pad" value={editTotal} onChangeText={setEditTotal} />
              </View>
              <TextField label="Purchase date" placeholder="YYYY-MM-DD" leftIcon="calendar" value={editDate} onChangeText={setEditDate} autoCapitalize="none" />
              <SectionHeader eyebrow="LINE ITEMS" title="Parsed groceries" trailing={<Pressable onPress={addMissingItem}><Text style={styles.addItemText}>+ Add item</Text></Pressable>} />
              {itemsLoading ? <LoadingState label="Loading parsed items" /> : editItems.filter((item) => !item.deleted).map((item) => <EditableItemCard key={item.id} item={item} onChange={updateEditItem} onRemove={removeEditItem} />)}
              {!itemsLoading && editItems.filter((item) => !item.deleted).length === 0 && <EmptyState icon="shopping-bag" title="No line items" body="Add a missing item manually or save the receipt-level details as-is." />}
              <PrimaryButton label="Save receipt & item corrections" icon="check" loading={savingEdit} onPress={saveReceiptEdits} />
              <SecondaryButton label="Cancel" onPress={() => setEditing(null)} variant="ghost" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

function toEditableItem(item: ReceiptItem): EditableReceiptItem {
  return {
    id: item.id,
    lineNumber: item.line_number,
    rawName: item.raw_name,
    name: item.normalized_name ?? '',
    brand: item.brand ?? '',
    category: item.category ?? '',
    quantity: item.quantity == null ? '' : String(item.quantity),
    size: item.size == null ? '' : String(item.size),
    unit: item.unit ?? '',
    unitPrice: item.unit_price == null ? '' : String(item.unit_price),
    lineTotal: item.line_total == null ? '' : String(item.line_total),
    confidence: Number(item.confidence ?? 0.5),
  };
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryBox}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue} numberOfLines={1}>{value}</Text></View>;
}

function MoneyCell({ label, value, currency = 'CAD', strong = false }: { label: string; value?: number | null; currency?: string; strong?: boolean }) {
  return <View style={[styles.moneyCell, strong && styles.moneyCellStrong]}><Text style={styles.summaryLabel}>{label}</Text><Text style={[styles.moneyValue, strong && styles.moneyValueStrong]}>{value == null ? '—' : `${currency} $${Number(value).toFixed(2)}`}</Text></View>;
}

function ParsedItemRow({ item, currency }: { item: ReceiptItem; currency: string }) {
  const label = item.normalized_name || item.raw_name;
  const detail = [item.brand, item.quantity != null ? `Qty ${item.quantity}` : null, item.size != null ? `${item.size}${item.unit ?? ''}` : item.unit].filter(Boolean).join(' · ');
  const lowConfidence = Number(item.confidence) < 0.7;
  return <View style={styles.parsedItemRow}>
    <View style={{ flex: 1 }}>
      <View style={styles.itemTitleRow}><Text style={styles.parsedItemName}>{label}</Text>{lowConfidence && <View style={styles.lowConfidencePill}><Text style={styles.lowConfidenceText}>Check</Text></View>}</View>
      {!!detail && <Text style={styles.parsedItemMeta}>{detail}</Text>}
      {item.raw_name !== label && <Text style={styles.rawItemText}>{item.raw_name}</Text>}
    </View>
    <Text style={styles.parsedItemPrice}>{item.line_total != null ? `${currency} $${Number(item.line_total).toFixed(2)}` : item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : '—'}</Text>
  </View>;
}

function EditableItemCard({ item, onChange, onRemove }: { item: EditableReceiptItem; onChange: (id: string, field: keyof EditableReceiptItem, value: string) => void; onRemove: (id: string) => void }) {
  const lowConfidence = item.confidence < 0.7 && !item.isNew;
  return <View style={[styles.editItemCard, lowConfidence && styles.editItemCardWarning]}>
    <View style={styles.editItemHeader}>
      <View style={{ flex: 1 }}><Text style={styles.editItemLine}>LINE {item.lineNumber}</Text>{lowConfidence && <Text style={styles.reviewHint}>Low confidence — review this item</Text>}</View>
      <Pressable onPress={() => onRemove(item.id)} hitSlop={8}><Feather name="trash-2" size={18} color={colors.danger} /></Pressable>
    </View>
    <TextField label="Item name" placeholder="Milk" value={item.name} onChangeText={(value) => onChange(item.id, 'name', value)} />
    <TextField label="Receipt text" placeholder="Raw OCR line" value={item.rawName} onChangeText={(value) => onChange(item.id, 'rawName', value)} />
    <View style={styles.twoFields}>
      <TextField containerStyle={{ flex: 1 }} label="Brand" placeholder="Brand" value={item.brand} onChangeText={(value) => onChange(item.id, 'brand', value)} />
      <TextField containerStyle={{ flex: 1 }} label="Category" placeholder="Dairy" value={item.category} onChangeText={(value) => onChange(item.id, 'category', value)} />
    </View>
    <View style={styles.threeFields}>
      <TextField containerStyle={{ flex: 1 }} label="Qty" placeholder="1" keyboardType="decimal-pad" value={item.quantity} onChangeText={(value) => onChange(item.id, 'quantity', value)} />
      <TextField containerStyle={{ flex: 1 }} label="Size" placeholder="500" keyboardType="decimal-pad" value={item.size} onChangeText={(value) => onChange(item.id, 'size', value)} />
      <TextField containerStyle={{ flex: 1 }} label="Unit" placeholder="g" value={item.unit} onChangeText={(value) => onChange(item.id, 'unit', value)} />
    </View>
    <View style={styles.twoFields}>
      <TextField containerStyle={{ flex: 1 }} label="Unit price" placeholder="0.00" keyboardType="decimal-pad" value={item.unitPrice} onChangeText={(value) => onChange(item.id, 'unitPrice', value)} />
      <TextField containerStyle={{ flex: 1 }} label="Line total" placeholder="0.00" keyboardType="decimal-pad" value={item.lineTotal} onChangeText={(value) => onChange(item.id, 'lineTotal', value)} />
    </View>
  </View>;
}

function friendlyStatus(status?: string) {
  switch (status) {
    case 'manual': return 'Details entered manually';
    case 'complete':
    case 'parsed': return 'Receipt parsed';
    case 'processing': return 'Reading receipt…';
    case 'failed':
    case 'error': return 'Parsing failed';
    default: return 'Queued for parsing';
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
  previewCard: { backgroundColor: colors.bg, borderRadius: radii.xxl, width: '100%', maxWidth: 460, maxHeight: '92%', overflow: 'hidden' },
  previewContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  previewStore: { ...type.h2, fontSize: 20, lineHeight: 24 },
  previewDate: { ...type.caption, marginTop: 2 },
  previewClose: { width: 36, height: 36, borderRadius: radii.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', aspectRatio: 3 / 4, maxHeight: 420, borderRadius: radii.lg, backgroundColor: colors.surfaceInk },
  moneyGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  moneyCell: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.md, padding: spacing.sm },
  moneyCellStrong: { backgroundColor: colors.primary },
  moneyValue: { ...type.bodyStrong, color: colors.primary, fontSize: 13, marginTop: 2 },
  moneyValueStrong: { color: colors.onPrimary },
  parseSummary: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginVertical: spacing.md },
  statusText: { ...type.caption, color: colors.muted },
  confidenceText: { ...type.caption, color: colors.primary },
  parsedItemRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  parsedItemName: { ...type.bodyStrong, color: colors.ink, flexShrink: 1 },
  parsedItemMeta: { ...type.caption, marginTop: 2 },
  rawItemText: { ...type.caption, color: colors.subtle, marginTop: 2 },
  parsedItemPrice: { ...type.bodyStrong, color: colors.primary },
  lowConfidencePill: { backgroundColor: colors.warningSoft, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  lowConfidenceText: { ...type.caption, color: colors.warning, fontSize: 10 },
  previewButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg },
  editBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,44,37,0.55)' },
  editSheet: { maxHeight: '94%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl },
  sheetHandle: { width: 44, height: 5, borderRadius: radii.pill, backgroundColor: colors.hairlineWarm, alignSelf: 'center', marginTop: spacing.sm },
  editContent: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  addItemText: { ...type.bodyStrong, color: colors.primary },
  editItemCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  editItemCardWarning: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  editItemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  editItemLine: { ...type.eyebrow, color: colors.subtle },
  reviewHint: { ...type.caption, color: colors.warning, marginTop: 2 },
  twoFields: { flexDirection: 'row', gap: spacing.sm },
  threeFields: { flexDirection: 'row', gap: spacing.sm },
});
