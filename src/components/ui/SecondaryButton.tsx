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
  variant?: 'outline' | 'ghost' | 'soft';
  size?: 'md' | 'lg';
  style?: ViewStyle;
  testID?: string;
};

/**
 * Non-primary action. Three quiet variants that still meet the 44pt touch
 * target and preserve the warm/green identity.
 */
export function SecondaryButton({
  label,
  onPress,
  loading,
  disabled,
  fullWidth = true,
  icon,
  variant = 'outline',
  size = 'md',
  style,
  testID,
  ...rest
}: Props) {
  const isInactive = disabled || loading;

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
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        variant === 'soft' && styles.soft,
        pressed && styles.pressed,
        isInactive && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {icon && <Feather name={icon} size={16} color={colors.primary} style={styles.icon} />}
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
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseLg: { minHeight: 54 },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  outline: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  ghost: { backgroundColor: 'transparent' },
  soft: { backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
  label: { ...type.button, color: colors.primary },
});
