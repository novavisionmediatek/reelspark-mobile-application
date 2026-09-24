import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/Badge';
import { colors, fonts, spacing, type } from '../theme/tokens';
import { useResponsive } from '../theme/responsive';
import { useUserVideos } from '../hooks/useUserVideos';
import { supabase } from '../lib/supabase';
import type { Profile, Video } from '../types/database';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

const GRADIENTS: [string, string][] = [
  [colors.periwinkle, colors.indigo],
  [colors.violet, colors.midnight],
  [colors.indigo, colors.deepIndigo],
];

function VideoGridItem({ video, index, itemWidth, itemHeight, onPress }: { video: Video; index: number; itemWidth: number; itemHeight: number; onPress: () => void }) {
  const [from, to] = GRADIENTS[index % GRADIENTS.length];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridItem,
        { width: itemWidth, height: itemHeight },
        pressed && { opacity: 0.7 }
      ]}
    >
      {video.thumbnail_url ? (
        <Image source={{ uri: video.thumbnail_url }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[from, to]} style={styles.thumbnail} />
      )}
      <View style={styles.overlay} />
      <View style={styles.statsOverlay}>
        <View style={styles.statItem}>
          <Feather name="eye" size={14} color="#fff" />
          <Text style={styles.statLabel}>{video.view_count_in_app}</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="heart" size={14} color="#fff" />
          <Text style={styles.statLabel}>{video.like_count ?? 0}</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="message-circle" size={14} color="#fff" />
          <Text style={styles.statLabel}>{video.comment_count ?? 0}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function UserProfileScreen({ route, navigation }: Props) {
  const { userId, userName } = route.params;
  const { width: screenWidth } = useWindowDimensions();

  // Responsive column count based on device width
  console.log('🎬 Screen Width:', screenWidth);

  let gridColumns = 5; // Default to 5 columns
  if (screenWidth < 450) {
    gridColumns = 3; // Mobile - 3 columns
  } else if (screenWidth < 700) {
    gridColumns = 4; // Tablet - 4 columns
  }
  // Desktop - 5 columns (default)

  const { data: videos, isLoading, isError } = useUserVideos(userId);

  const { data: profile } = useQuery({
    queryKey: ['userProfile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const totalViews = (videos ?? []).reduce((sum, v) => sum + v.view_count_in_app, 0);
  const totalLikes = (videos ?? []).reduce((sum, v) => sum + (v.like_count ?? 0), 0);
  const totalComments = (videos ?? []).reduce((sum, v) => sum + (v.comment_count ?? 0), 0);
  const initials = (profile?.display_name || userName || '??').slice(0, 2).toUpperCase();

  // Calculate item size to ensure consistent width/height and proper last row alignment
  const totalPadding = spacing.lg * 2; // padding on both sides
  const totalGap = spacing.md * (gridColumns - 1);
  const availableWidth = screenWidth - totalPadding - totalGap;
  const itemWidth = availableWidth / gridColumns;
  // Mobile: 160px height, Desktop/Tablet: fixed 290px height
  const itemHeight = screenWidth < 450 ? 160 : 290;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.profileHead}>
          <Avatar initials={initials} imageUri={profile?.avatar_url} size={64} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.display_name || userName}</Text>
            {profile?.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
          </View>
        </View>

        {videos && (
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{videos.length}</Text>
              <Text style={styles.statLbl}>Videos</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{totalViews}</Text>
              <Text style={styles.statLbl}>Views</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{totalLikes}</Text>
              <Text style={styles.statLbl}>Likes</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{totalComments}</Text>
              <Text style={styles.statLbl}>Comments</Text>
            </View>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.indigo} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Couldn't load videos.</Text>
        </View>
      ) : videos && videos.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptyText}>This user hasn't submitted any videos.</Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${gridColumns}`}
          data={videos}
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
          columnWrapperStyle={[styles.columnWrapper, { gap: spacing.md }]}
          renderItem={({ item, index }) => (
            <VideoGridItem
              video={item}
              index={index}
              itemWidth={itemWidth}
              itemHeight={itemHeight}
              onPress={() => {
                // Navigate to video player with the video data
                navigation.navigate('VideoPlayer', {
                  videoId: item.id,
                  video: item
                });
              }}
            />
          )}
          contentContainerStyle={styles.list}
          scrollEnabled={true}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    backgroundColor: colors.background,
  },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.md },
  backBtn: { marginBottom: spacing.sm, alignSelf: 'flex-start' },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  profileInfo: { flex: 1 },
  profileName: { ...type.h3, color: colors.text },
  profileBio: { ...type.bodySmall, color: colors.textMuted, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statNum: { fontFamily: fonts.monoSemibold, fontSize: 16, color: colors.text },
  statLbl: { fontFamily: fonts.body, fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs },
  emptyTitle: { color: colors.text, fontFamily: fonts.displaySemibold, fontSize: 16 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  list: { padding: spacing.lg, gap: spacing.md },
  columnWrapper: { gap: spacing.md, marginBottom: spacing.md, justifyContent: 'center' },
  gridItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  statsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { color: '#fff', fontFamily: fonts.monoSemibold, fontSize: 10 },
});
