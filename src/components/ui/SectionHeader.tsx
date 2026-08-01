import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { spacing, type } from '../../theme';

type Props = {
  title: string;
  eyebrow?: string;
  trailing?: ReactNode;
  style?: ViewStyle;
};

/**
 * Section divider used to group settings-style panels. Uses the serif
 * face at h3 size for warmth without competing with page headers.
 */
export function SectionHeader({ title, eyebrow, trailing, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {trailing && <View style={styles.trail}>{trailing}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  text: { flex: 1 },
  eyebrow: { ...type.eyebrow, marginBottom: 2 },
  title: { ...type.h2, fontSize: 20, lineHeight: 26 },
  trail: { marginLeft: spacing.md },
});
