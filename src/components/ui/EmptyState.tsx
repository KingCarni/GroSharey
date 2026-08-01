import { Feather } from '@expo/vector-icons';
import { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

type Props = {
  title: string;
  body?: string;
  icon?: FeatherName;
  action?: ReactNode;
  tone?: 'default' | 'warm';
  style?: ViewStyle;
};

/**
 * Consistent empty state for lists, panels and screens. Small illustrated
 * medallion + copy + optional action slot.
 */
export function EmptyState({ title, body, icon = 'inbox', action, tone = 'default', style }: Props) {
  return (
    <View style={[styles.wrap, tone === 'warm' && styles.wrapWarm, style]}>
      <View style={[styles.medallion, tone === 'warm' && styles.medallionWarm]}>
        <Feather name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  wrapWarm: {
    backgroundColor: colors.bgWarm,
    borderColor: colors.hairlineWarm,
  },
  medallion: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  medallionWarm: {
    backgroundColor: colors.surface,
  },
  title: {
    ...type.h3,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  body: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
