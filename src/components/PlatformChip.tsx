import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../theme/tokens';

// `onDark` = chip sits on the brand-blue band / video (Feed), so it goes white.
export function PlatformChip({ platform, onDark = false }: { platform: 'youtube' | 'instagram'; onDark?: boolean }) {
  return (
    <View style={[styles.chip, onDark && styles.chipOnDark]}>
      <Text style={[styles.label, onDark && styles.labelOnDark]}>{platform === 'youtube' ? '▶ Shorts' : '📷 Reels'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(253,54,103,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(253,54,103,0.3)',
    alignSelf: 'flex-start',
  },
  chipOnDark: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.45)' },
  labelOnDark: { color: '#fff' },
  label: { color: colors.purple, fontFamily: fonts.bodySemibold, fontSize: 10 },
});
