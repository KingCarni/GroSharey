import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type Props = {
  storeName: string | null;
  totalAmount: number | null;
  currency: string;
  purchasedAt: string;
  parseStatus: string;
  thumbUri?: string | null;
  onPress?: () => void;
  testID?: string;
};

/**
 * Row-style receipt summary with optional thumbnail + tappable to open
 * the larger preview. Uses a colored parse-status pill for scanability.
 */
export function ReceiptCard({
  storeName,
  totalAmount,
  currency,
  purchasedAt,
  parseStatus,
  thumbUri,
  onPress,
  testID,
}: Props) {
  const status = statusStyle(parseStatus);
  const dateLabel = new Date(purchasedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const totalLabel =
    totalAmount == null ? 'Pending' : formatMoney(totalAmount, currency);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumbImage} />
        ) : (
          <Feather name="file-text" size={22} color={colors.primary} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.store} numberOfLines={1}>{storeName ?? 'Unknown store'}</Text>
        <Text style={styles.date} numberOfLines={1}>{dateLabel}</Text>
        <View style={[styles.pill, { backgroundColor: status.bg }]}>
          <Text style={[styles.pillText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.total} numberOfLines={1}>{totalLabel}</Text>
        {onPress && <Feather name="chevron-right" size={20} color={colors.subtle} />}
      </View>
    </Pressable>
  );
}

function formatMoney(amount: number, currency: string) {
  const value = Number(amount).toFixed(2);
  return `${currency || 'USD'} $${value}`;
}

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'manual':
      return { bg: colors.primaryTint, fg: colors.primary, label: 'Logged manually' };
    case 'parsed':
      return { bg: colors.successSoft, fg: colors.success, label: 'Parsed' };
    case 'error':
    case 'failed':
      return { bg: colors.dangerSoft, fg: colors.danger, label: 'Parse failed' };
    case 'pending':
    default:
      return { bg: colors.bgWarm, fg: colors.accentInk, label: 'Parsing pending' };
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  body: { flex: 1 },
  store: { ...type.bodyStrong, color: colors.ink, fontSize: 16 },
  date: { ...type.caption, marginTop: 2 },
  pill: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  pillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  trailing: { alignItems: 'flex-end', marginLeft: spacing.sm },
  total: { ...type.bodyStrong, color: colors.primary, fontSize: 16 },
});
