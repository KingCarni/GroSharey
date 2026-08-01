import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';
import type { GroceryItem } from '../../types/database';

type Props = {
  item: GroceryItem;
  onToggle?: (item: GroceryItem) => void;
  onOpen?: (item: GroceryItem) => void;
  testID?: string;
};

export function GroceryItemRow({ item, onToggle, onOpen, testID }: Props) {
  const meta: string[] = [];
  if (item.quantity != null) meta.push(`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`);
  if (item.brand) meta.push(item.brand);
  if (item.category) meta.push(item.category);

  return (
    <View style={[styles.row, item.is_completed && styles.rowDone]} testID={testID}>
      <Pressable
        onPress={() => onToggle?.(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.is_completed }}
        accessibilityLabel={`${item.is_completed ? 'Uncheck' : 'Check'} ${item.name}`}
        hitSlop={8}
        style={({ pressed }) => [styles.checkboxPressable, pressed && styles.pressed]}
      >
        <View style={[styles.box, item.is_completed && styles.boxDone]}>
          {item.is_completed && <Feather name="check" size={14} color={colors.onPrimary} />}
        </View>
      </Pressable>

      <Pressable
        onPress={() => onOpen?.(item)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.name}`}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.name, item.is_completed && styles.nameDone]} numberOfLines={2}>
            {item.name}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.subtle} />
        </View>
        {meta.length > 0 && (
          <Text style={[styles.meta, item.is_completed && styles.metaDone]} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        )}
        {!!item.notes && (
          <Text style={[styles.notes, item.is_completed && styles.metaDone]} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowDone: { backgroundColor: colors.surfaceInk, borderColor: colors.hairlineWarm },
  checkboxPressable: { paddingTop: 2, paddingRight: spacing.md, paddingBottom: spacing.sm },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.bodyStrong, flex: 1, fontSize: 16, color: colors.ink },
  nameDone: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { ...type.caption, color: colors.muted, marginTop: 3 },
  metaDone: { color: colors.subtle },
  notes: { ...type.bodySmall, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  pressed: { opacity: 0.7 },
});
