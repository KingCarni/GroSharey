import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  keyboard?: boolean;
  padded?: boolean;
  contentStyle?: ViewStyle;
  edges?: Edge[];
  refreshControl?: ScrollViewProps['refreshControl'];
  contentContainerStyle?: ViewStyle;
  background?: 'bg' | 'warm' | 'primary';
};

/**
 * Root wrapper for every screen. Provides consistent padding, safe-area,
 * optional scroll + keyboard avoidance, and a single source of truth for
 * screen backgrounds.
 */
export function AppScreen({
  children,
  scroll = false,
  keyboard = false,
  padded = true,
  contentStyle,
  edges,
  refreshControl,
  contentContainerStyle,
  background = 'bg',
}: Props) {
  const backgroundColor =
    background === 'primary' ? colors.primary : background === 'warm' ? colors.bgWarm : colors.bg;

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        padded ? styles.padded : null,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  const withKeyboard = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    inner
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={edges}>
      {withKeyboard}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  padded: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
