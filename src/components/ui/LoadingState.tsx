import { ActivityIndicator, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, type } from '../../theme';

type Props = {
  label?: string;
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * Full-screen or inline loading state.
 */
export function LoadingState({ label = 'Loading…', compact, style }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <ActivityIndicator color={colors.primary} />
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  compact: { flex: 0, paddingVertical: spacing.lg },
  label: { ...type.body, marginTop: spacing.md, color: colors.muted },
});
