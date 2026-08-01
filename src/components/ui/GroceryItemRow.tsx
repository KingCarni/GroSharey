import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';
import type { GroceryItem } from '../../types/database';

type Props = {
  item: GroceryItem;
  onToggle?: (item: GroceryItem) => void;
  testID?: string;
};

/**
 * Single grocery row. Kept compact for shopping-friendly scanning:
 * checkbox + name + optional quantity/brand/category chips + notes.
 */
export function GroceryItemRow({ item, onToggle, testID }: Props) {
  const meta: string[] = [];
  if (item.quantity != null) {
    meta.push(`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`);
  }
  if (item.brand) meta.push(item.brand);
  if (item.category) meta.push(item.category);

  return (
    <Pressable
      testID={testID}
      onPress={() => onToggle?.(item)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.is_completed }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.row,
        item.is_completed && styles.rowDone,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.box, item.is_completed && styles.boxDone]}>
        {item.is_completed && <Feather name="check" size={14} color={colors.onPrimary} />}
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.name, item.is_completed && styles.nameDone]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
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
      </View>
    </Pressable>
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
  rowDone: {
    backgroundColor: colors.surfaceInk,
    borderColor: colors.hairlineWarm,
  },
  rowPressed: { opacity: 0.75 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: spacing.md,
    backgroundColor: colors.surface,
  },
  boxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  body: { flex: 1 },
  name: {
    ...type.bodyStrong,
    fontSize: 16,
    color: colors.ink,
  },
  nameDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  meta: {
    ...type.caption,
    color: colors.muted,
    marginTop: 3,
  },
  metaDone: { color: colors.subtle },
  notes: {
    ...type.bodySmall,
    color: colors.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
