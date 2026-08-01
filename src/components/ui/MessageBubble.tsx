import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../../theme';

type Props = {
  body: string;
  senderLabel?: string;
  timestamp?: string;
  mine?: boolean;
  showSender?: boolean;
};

/**
 * Chat bubble. Own messages align right on the dark green primary; other
 * senders sit on cream/white with a name label when helpful.
 */
export function MessageBubble({ body, senderLabel, timestamp, mine, showSender = true }: Props) {
  return (
    <View style={[styles.wrap, mine ? styles.mineWrap : styles.theirsWrap]}>
      {!mine && showSender && !!senderLabel && (
        <Text style={styles.sender} numberOfLines={1}>{senderLabel}</Text>
      )}
      <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirsBubble]}>
        <Text style={[styles.text, mine && styles.mineText]}>{body}</Text>
      </View>
      {!!timestamp && (
        <Text style={[styles.time, mine && styles.mineTime]}>{timestamp}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md, maxWidth: '86%' },
  mineWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: {
    ...type.caption,
    color: colors.muted,
    marginBottom: 4,
    marginLeft: spacing.sm,
  },
  bubble: {
    borderRadius: radii.xl,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
  },
  mineBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  theirsBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderBottomLeftRadius: 6,
  },
  text: {
    ...type.body,
    fontSize: 15,
    color: colors.ink,
  },
  mineText: { color: colors.onPrimary },
  time: {
    ...type.caption,
    fontSize: 11,
    color: colors.subtle,
    marginTop: 4,
    marginHorizontal: spacing.sm,
  },
  mineTime: { color: colors.subtle },
});
