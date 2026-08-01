import { Feather } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, type } from '../../theme';

type Props = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * Consistent screen header. Handles the eyebrow / title / subtitle
 * pattern used across GroSharey with an optional back button and right slot.
 */
export function AppHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  right,
  compact = false,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={22} color={colors.primary} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      )}

      <View style={styles.row}>
        <View style={styles.textCol}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
          <Text style={[type.h1, compact && type.h2]} numberOfLines={2}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          )}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  wrapCompact: { marginBottom: spacing.lg },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    marginBottom: spacing.md,
    marginLeft: -6,
  },
  backPressed: { opacity: 0.55 },
  backLabel: {
    ...type.button,
    color: colors.primary,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textCol: { flex: 1 },
  eyebrow: { ...type.eyebrow, marginBottom: spacing.xs, color: colors.primary },
  subtitle: {
    ...type.body,
    marginTop: spacing.sm,
    color: colors.muted,
  },
  right: { marginLeft: spacing.md, alignItems: 'flex-end' },
});
