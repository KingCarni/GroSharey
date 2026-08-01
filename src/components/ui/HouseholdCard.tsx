import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type Props = {
  name: string;
  meta?: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
};

/**
 * Horizontal-scroll household selector card. Compact, one-hand-friendly.
 */
export function HouseholdCard({ name, meta, active, onPress, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.card,
        active && styles.cardActive,
        pressed && !active && styles.cardPressed,
      ]}
    >
      <View style={[styles.dot, active && styles.dotActive]}>
        <Feather name="home" size={14} color={active ? colors.onPrimary : colors.primary} />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.name, active && styles.nameActive]}
      >
        {name}
      </Text>
      {!!meta && (
        <Text
          numberOfLines={1}
          style={[styles.meta, active && styles.metaActive]}
        >
          {meta}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 168,
    minHeight: 96,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  cardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cardPressed: { opacity: 0.75 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dotActive: { backgroundColor: 'rgba(247,244,234,0.14)' },
  name: {
    ...type.h3,
    fontSize: 16,
    color: colors.ink,
  },
  nameActive: { color: colors.onPrimary },
  meta: {
    ...type.caption,
    marginTop: 2,
    color: colors.muted,
  },
  metaActive: { color: 'rgba(247,244,234,0.75)' },
});
