import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'dark' | 'light' | 'warm';
  style?: ViewStyle;
};

/**
 * Compact analytics tile. Dark tone is the hero card for the primary
 * metric; light + warm variants keep secondary metrics readable.
 */
export function StatCard({ label, value, hint, tone = 'light', style }: Props) {
  const dark = tone === 'dark';
  const warm = tone === 'warm';
  return (
    <View
      style={[
        styles.card,
        dark && styles.cardDark,
        warm && styles.cardWarm,
        style,
      ]}
    >
      <Text style={[styles.label, dark && styles.labelDark, warm && styles.labelWarm]}>
        {label}
      </Text>
      <Text
        style={[styles.value, dark && styles.valueDark, warm && styles.valueWarm]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {!!hint && (
        <Text style={[styles.hint, dark && styles.hintDark, warm && styles.hintWarm]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 100,
    borderRadius: radii.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    justifyContent: 'space-between',
  },
  cardDark: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cardWarm: {
    backgroundColor: colors.bgWarm,
    borderColor: colors.hairlineWarm,
  },
  label: { ...type.eyebrow, color: colors.muted },
  labelDark: { color: 'rgba(247,244,234,0.72)' },
  labelWarm: { color: colors.accentInk },
  value: {
    ...type.h2,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    lineHeight: 28,
    marginTop: spacing.sm,
    color: colors.ink,
  },
  valueDark: { color: colors.onPrimary },
  valueWarm: { color: colors.ink },
  hint: {
    ...type.caption,
    marginTop: spacing.xs,
    color: colors.muted,
  },
  hintDark: { color: 'rgba(247,244,234,0.7)' },
  hintWarm: { color: colors.muted },
});
