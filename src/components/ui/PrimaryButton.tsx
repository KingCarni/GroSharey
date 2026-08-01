import { Feather } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: FeatherName;
  tone?: 'primary' | 'danger';
  size?: 'md' | 'lg';
  style?: ViewStyle;
  testID?: string;
};

/**
 * Filled call-to-action button. Never resizes when toggling to a loading
 * state — the spinner and label share the same row height.
 */
export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  fullWidth = true,
  icon,
  tone = 'primary',
  size = 'md',
  style,
  testID,
  ...rest
}: Props) {
  const isInactive = disabled || loading;
  const bg = tone === 'danger' ? colors.danger : colors.primary;
  const bgPressed = tone === 'danger' ? '#8B3D2E' : colors.primaryDark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      onPress={isInactive ? undefined : onPress}
      disabled={isInactive}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.baseLg,
        fullWidth ? styles.full : styles.auto,
        { backgroundColor: pressed ? bgPressed : bg },
        isInactive && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            {icon && <Feather name={icon} size={16} color={colors.onPrimary} style={styles.icon} />}
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseLg: { minHeight: 54 },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
  label: { ...type.button, color: colors.onPrimary },
});
