import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = ViewProps & {
  tone?: 'surface' | 'warm';
  padded?: boolean;
};

/**
 * Grouped-settings style container used to bundle related fields on a
 * screen — matches iOS/Android platform expectations for panels.
 */
export function Panel({ children, style, tone = 'surface', padded = true, ...rest }: Props) {
  return (
    <View
      style={[
        styles.panel,
        padded && styles.padded,
        tone === 'warm' && styles.warm,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  padded: { padding: spacing.lg },
  warm: {
    backgroundColor: colors.bgWarm,
    borderColor: colors.hairlineWarm,
  },
});
