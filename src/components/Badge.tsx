import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius } from '../theme/tokens';

export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

const STATUS_STYLES: Record<VideoStatus, { bg: string; border: string; fg: string; label: string }> = {
  approved: { bg: 'rgba(125,39,227,0.12)', border: 'rgba(125,39,227,0.45)', fg: '#5B18C9', label: 'Approved' },
  pending: { bg: 'rgba(219,50,147,0.10)', border: 'rgba(219,50,147,0.4)', fg: '#B0246F', label: 'Pending review' },
  rejected: { bg: 'rgba(217,45,32,0.12)', border: 'rgba(217,45,32,0.45)', fg: '#B42318', label: 'Rejected' },
  // Kept off-brand on purpose, same reasoning as tokens.ts's `danger` — a
  // moderation warning needs a color distinct from both the brand accent and
  // the rejection red, not another shade of green.
  flagged: { bg: 'rgba(245,165,36,0.14)', border: 'rgba(245,165,36,0.5)', fg: '#A86400', label: 'Flagged' },
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
