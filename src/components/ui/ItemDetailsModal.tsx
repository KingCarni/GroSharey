import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { GroceryItem } from '../../types/database';
import { colors, radii, spacing, type } from '../../theme';

type ItemDraft = {
  name: string;
  quantity: string;
  unit: string;
  brand: string;
  category: string;
  notes: string;
  isCompleted: boolean;
};

type Props = {
  visible: boolean;
  item: GroceryItem | null;
  saving?: boolean;
  deleting?: boolean;
  onClose: () => void;
  onSave: (draft: ItemDraft) => void;
  onDelete: () => void;
};

export function ItemDetailsModal({ visible, item, saving, deleting, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<ItemDraft>({
    name: '', quantity: '', unit: '', brand: '', category: '', notes: '', isCompleted: false,
  });

  useEffect(() => {
    if (!item) return;
    setDraft({
      name: item.name ?? '',
      quantity: item.quantity == null ? '' : String(item.quantity),
      unit: item.unit ?? '',
      brand: item.brand ?? '',
      category: item.category ?? '',
      notes: item.notes ?? '',
      isCompleted: item.is_completed,
    });
  }, [item]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90 || gesture.vy > 1.2) onClose();
    },
  }), [onClose]);

  const update = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>ITEM DETAILS</Text>
              <Text style={styles.title}>Edit grocery item</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Field label="Item name" value={draft.name} onChangeText={(value) => update('name', value)} placeholder="Milk" />
            <View style={styles.row}>
              <Field style={styles.flex} label="Quantity" value={draft.quantity} onChangeText={(value) => update('quantity', value)} placeholder="2" keyboardType="decimal-pad" />
              <Field style={styles.flex} label="Unit" value={draft.unit} onChangeText={(value) => update('unit', value)} placeholder="L, lb, each" />
            </View>
            <Field label="Brand" value={draft.brand} onChangeText={(value) => update('brand', value)} placeholder="Optional" />
            <Field label="Category" value={draft.category} onChangeText={(value) => update('category', value)} placeholder="Dairy, produce, frozen…" />
            <Field label="Notes" value={draft.notes} onChangeText={(value) => update('notes', value)} placeholder="Any preferences or reminders" multiline />

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Completed</Text>
                <Text style={styles.toggleText}>Mark this item as picked up.</Text>
              </View>
              <Switch
                value={draft.isCompleted}
                onValueChange={(value) => update('isCompleted', value)}
                trackColor={{ false: colors.hairline, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>

            <Pressable
              disabled={!draft.name.trim() || saving}
              onPress={() => onSave(draft)}
              style={({ pressed }) => [styles.saveButton, (!draft.name.trim() || saving) && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>

            <Pressable
              disabled={deleting}
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteButton, deleting && styles.disabled, pressed && styles.pressed]}
            >
              <Feather name="trash-2" size={18} color={colors.accent} />
              <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete item'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
  style?: object;
};

function Field({ label, style, multiline, ...props }: FieldProps) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && styles.notesInput]}
        placeholderTextColor={colors.subtle}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,28,23,0.45)' },
  sheet: { maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  handleArea: { alignItems: 'center', paddingVertical: spacing.sm },
  handle: { width: 44, height: 5, borderRadius: radii.pill, backgroundColor: colors.hairlineWarm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  eyebrow: { ...type.caption, color: colors.muted, letterSpacing: 1.5 },
  title: { ...type.h2, color: colors.ink, marginTop: 2 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  fieldWrap: { marginBottom: spacing.md },
  label: { ...type.bodySmall, color: colors.ink, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.lg, backgroundColor: colors.surface, color: colors.ink, paddingHorizontal: spacing.md, fontFamily: 'Manrope_400Regular', fontSize: 16 },
  notesInput: { minHeight: 112, paddingTop: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.lg, backgroundColor: colors.surface, padding: spacing.md, marginBottom: spacing.lg },
  toggleCopy: { flex: 1, paddingRight: spacing.md },
  toggleTitle: { ...type.bodyStrong, color: colors.ink },
  toggleText: { ...type.bodySmall, color: colors.muted, marginTop: 2 },
  saveButton: { minHeight: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  saveText: { ...type.bodyStrong, color: colors.onPrimary },
  deleteButton: { minHeight: 48, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  deleteText: { ...type.bodyStrong, color: colors.accent },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
