import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { VideoPlayer } from '../components/VideoPlayer';
import { CommentsSheet } from '../components/CommentsSheet';
import { colors, fonts, spacing, type } from '../theme/tokens';
import { bestYtThumbnail, ytThumbnailFallback } from '../lib/ytThumb';
import { incrementViewCount, toggleVideoLike } from '../hooks/useFeed';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPlayer'>;

const PLACEHOLDER_GRADIENTS: [string, string][] = [
  [colors.orange, colors.pink],
  [colors.magenta, colors.deepPurple],
  [colors.pink, colors.purple],
];

function gradientFor(id: string) {
  const index = id.charCodeAt(0) % PLACEHOLDER_GRADIENTS.length;
  return PLACEHOLDER_GRADIENTS[index];
}

export function VideoPlayerScreen({ route, navigation }: Props) {
  const { video } = route.params;
  const isInstagram = video.platform === 'instagram';

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [views, setViews] = useState(video.view_count_in_app);
  const [liked, setLiked] = useState(Boolean(video.liked_by_me));
  const [likeCount, setLikeCount] = useState(video.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(video.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const [gradientFrom, gradientTo] = gradientFor(video.id);
  const countedView = useRef(false);
  const likePending = useRef(false);

  const [posterUri, setPosterUri] = useState<string | null>(
    () => bestYtThumbnail(video.thumbnail_url) ?? video.thumbnail_url ?? null,
  );

  const handlePosterError = () => {
    setPosterUri((current) => (current ? ytThumbnailFallback(video.thumbnail_url, current) ?? current : current));
  };

  // Instagram auto-plays immediately for instant video playback
  useEffect(() => {
    setPlaying(isInstagram);
  }, [isInstagram]);

  const countView = () => {
    if (countedView.current) return;
    countedView.current = true;
    incrementViewCount(video.id).then((isNewView) => {
      if (isNewView) setViews((v) => v + 1);
    });
  };

  const toggleLike = () => {
    if (likePending.current) return;
    likePending.current = true;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    toggleVideoLike(video.id)
      .then((serverLiked) => {
        setLiked(serverLiked);
        setLikeCount((c) => {
          if (serverLiked === next) return c;
          return Math.max(0, c + (serverLiked ? 1 : -1));
        });
      })
      .catch(() => {
        setLiked(liked);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      })
      .finally(() => {
        likePending.current = false;
      });
  };

  const startPlay = () => setPlaying(true);
  const handleEnded = () => {
    setPlaying(false);
    setStarted(false);
  };
  const handleStarted = () => setStarted(true);

  const showReel = (isInstagram ? true : playing) && !commentsOpen;
  const showChrome = isInstagram ? !showReel : !started;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{video.title ?? 'Video'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.playerContainer}>
        <LinearGradient
          colors={[gradientFrom, colors.background, gradientTo]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <VideoPlayer
          platform={video.platform}
          videoId={video.platform_video_id}
          playing={showReel}
          muted={false}
          onEnded={handleEnded}
          onStarted={isInstagram ? undefined : handleStarted}
          onWatched={isInstagram ? undefined : countView}
          style={styles.playerFill}
        />

        {showChrome && posterUri ? (
          <>
            <Image
              source={{ uri: posterUri }}
              onError={handlePosterError}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
            <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
          </>
        ) : null}

        {showChrome ? (
          <>
          </>
        ) : null}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {showChrome && !isInstagram ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={startPlay} accessibilityLabel="Play video">
            <View style={styles.playButtonWrap} pointerEvents="none">
              <View style={styles.playButton}>
                {playing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Feather name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
                )}
              </View>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.rail} pointerEvents="box-none">
          <View style={styles.railAction}>
            <Pressable
              style={[styles.railBtn, liked && styles.railBtnLiked]}
              onPress={toggleLike}
              accessibilityLabel={liked ? 'Unlike video' : 'Like video'}
            >
              <Feather name="heart" size={18} color={liked ? colors.danger : colors.pink} />
            </Pressable>
            {likeCount > 0 ? <Text style={styles.railActionLabel}>{likeCount}</Text> : null}
          </View>
          <View style={styles.railAction}>
            <Pressable
              style={styles.railBtn}
              onPress={() => setCommentsOpen(true)}
              accessibilityLabel="View comments"
            >
              <Feather name="message-circle" size={18} color={colors.pink} />
            </Pressable>
            {commentCount > 0 ? <Text style={styles.railActionLabel}>{commentCount}</Text> : null}
          </View>
          <View style={styles.railCount}>
            <Text style={styles.railCountNumber}>{views}</Text>
            <Text style={styles.railCountLabel}>in-app{'\n'}views</Text>
          </View>
        </View>
      </View>

      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountDelta={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
      />
    </SafeAreaView>
  );
}

// Dark text over the video / light-blue bands; a soft white glow keeps it
// readable where it crosses a dark frame.
const onBlue = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...type.bodySmall, color: colors.text, flex: 1, textAlign: 'center' },
  playerContainer: { flex: 1, overflow: 'hidden' },
  playerFill: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 170 },
  playButtonWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.pink,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: { position: 'absolute', right: 14, bottom: 100, alignItems: 'center', gap: 18 },
  railAction: { alignItems: 'center', gap: 4 },
  railActionLabel: { ...onBlue, color: '#fff', fontFamily: fonts.monoSemibold, fontSize: 11 },
  railBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBtnLiked: { backgroundColor: 'rgba(253,54,103,0.14)', borderColor: colors.pink },
  railCount: { alignItems: 'center' },
  railCountNumber: { ...onBlue, color: '#fff', fontFamily: fonts.monoSemibold, fontSize: 12 },
  railCountLabel: { ...onBlue, color: 'rgba(255,255,255,0.75)', fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', lineHeight: 12 },
});
