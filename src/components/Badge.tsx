import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius } from '../theme/tokens';

export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

const STATUS_STYLES: Record<VideoStatus, { bg: string; border: string; fg: string; label: string }> = {
  approved: { bg: 'rgba(97,83,245,0.18)', border: 'rgba(97,83,245,0.5)', fg: '#D6D1FF', label: 'Approved' },
  pending: { bg: 'rgba(55,48,163,0.18)', border: 'rgba(55,48,163,0.5)', fg: '#B4A8F5', label: 'Pending review' },
  rejected: { bg: 'rgba(242,84,91,0.18)', border: 'rgba(242,84,91,0.5)', fg: '#FFAEB3', label: 'Rejected' },
  // Kept off-brand on purpose, same reasoning as tokens.ts's `danger` — a
  // moderation warning needs a color distinct from both the brand accent and
  // the rejection red, not another shade of green.
  flagged: { bg: 'rgba(245,165,36,0.18)', border: 'rgba(245,165,36,0.5)', fg: '#FBCB84', label: 'Flagged' },
};

export function StatusBadge({ status }: { status: VideoStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
