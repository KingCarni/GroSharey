import { Feather } from '@expo/vector-icons';
import { ComponentProps, forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  leftIcon?: FeatherName;
  secure?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * Themed text input with label / hint / error slots. When `secure`
 * is set, exposes a visibility toggle that keeps state locally so the
 * password can be reviewed without leaking through the value prop.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, leftIcon, secure, containerStyle, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(!secure);
  const [focused, setFocused] = useState(false);
  const secureNow = secure ? !visible : false;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}
      >
        {leftIcon && (
          <Feather name={leftIcon} size={18} color={colors.muted} style={styles.leadIcon} />
        )}
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.primary}
          secureTextEntry={secureNow}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {secure && (
          <Pressable
            hitSlop={8}
            onPress={() => setVisible((v) => !v)}
            style={styles.trailBtn}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          >
            <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {!!error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !!hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: { ...type.label, marginBottom: spacing.xs, color: colors.ink },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  leadIcon: { marginRight: spacing.sm },
  input: {
    ...type.input,
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.ink,
  },
  trailBtn: { padding: spacing.xs, marginLeft: spacing.xs },
  hint: { ...type.caption, marginTop: spacing.xs },
  error: { ...type.caption, marginTop: spacing.xs, color: colors.danger },
});
