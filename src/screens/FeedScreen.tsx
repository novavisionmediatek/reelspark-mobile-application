import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Avatar } from '../components/Avatar';
import { CommentsSheet } from '../components/CommentsSheet';
import { PlatformChip } from '../components/PlatformChip';
import { VideoPlayer } from '../components/VideoPlayer';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { bestYtThumbnail, ytThumbnailFallback } from '../lib/ytThumb';
import { useFeed, incrementViewCount, toggleVideoLike } from '../hooks/useFeed';
import type { Video } from '../types/database';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Deterministic-looking placeholder gradient per video, shown behind the player
// and whenever a submission has no real thumbnail art (e.g. Instagram, until the
// oEmbed Edge Function exists — YouTube ones use the real thumbnail_url).
const PLACEHOLDER_GRADIENTS: [string, string][] = [
  [colors.periwinkle, colors.indigo],
  [colors.violet, colors.midnight],
  [colors.indigo, colors.deepIndigo],
];

function gradientFor(id: string) {
  const index = id.charCodeAt(0) % PLACEHOLDER_GRADIENTS.length;
  return PLACEHOLDER_GRADIENTS[index];
}

interface FeedItemProps {
  video: Video;
  // Whether this item is the one currently snapped into view. Off-screen items
  // must stop playing so we never have two videos with audio at once.
  isActive: boolean;
  itemHeight: number;
  // YouTube only — shared across every item so unmuting once keeps sound on
  // for the rest of the feed. Lifted to FeedScreen so it's a single source
  // of truth instead of resetting per item.
  soundOn: boolean;
  onToggleSound: () => void;
  onCreatorPress: () => void;
}

function FeedItem({ video, isActive, itemHeight, soundOn, onToggleSound, onCreatorPress }: FeedItemProps) {
  // Instagram's /embed/ page can't autoplay and we can't script it or hide its
  // centre play button (see VideoPlayer.tsx). So we just mount the reel as soon
  // as it's the active item and let the viewer tap IG's own button once to
  // start it — no app poster, no app play button, no chrome layered on top.
  // YouTube is the opposite: it never autoplays here — the viewer taps our
  // poster's play button, `playing` flips true, and only then does the embed
  // mount and start. The in-app view is counted after ≈30s of that playback
  // (`onWatched`), not on scroll-in, so it lines up with what YouTube itself
  // would count. (There is still no API to push a view onto YouTube — this only
  // keeps the app from counting plays YouTube wouldn't.)
  const isInstagram = video.platform === 'instagram';
  const [playing, setPlaying] = useState(false);
  // YouTube only: flips true once the embed actually confirms a PLAYING state
  // (not just "mounted") — mounting starts instantly, but the WebView itself
  // still takes a beat to load, during which YouTube shows its own poster +
  // branded play button. Our nicer blurred poster stays layered on top of the
  // player (masking that flash) until this fires, then steps aside.
  const [started, setStarted] = useState(false);
  const [views, setViews] = useState(video.view_count_in_app);
  const [gradientFrom, gradientTo] = gradientFor(video.id);
  const countedView = useRef(false);

  const [posterUri, setPosterUri] = useState<string | null>(
    () => bestYtThumbnail(video.thumbnail_url) ?? video.thumbnail_url ?? null,
  );
  const handlePosterError = useCallback(() => {
    setPosterUri((current) => (current ? ytThumbnailFallback(video.thumbnail_url, current) ?? current : current));
  }, [video.thumbnail_url]);

  // Likes + comments. Seeded from the feed row; updated optimistically and then
  // reconciled against the server so any user can like/comment any reel.
  const [liked, setLiked] = useState(Boolean(video.liked_by_me));
  const [likeCount, setLikeCount] = useState(video.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(video.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const likePending = useRef(false);

  // Keep local state in sync if the feed row is refreshed underneath us.
  useEffect(() => {
    setLiked(Boolean(video.liked_by_me));
    setLikeCount(video.like_count ?? 0);
    setCommentCount(video.comment_count ?? 0);
  }, [video.liked_by_me, video.like_count, video.comment_count]);

  const toggleLike = useCallback(() => {
    if (likePending.current) return;
    likePending.current = true;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    toggleVideoLike(video.id)
      .then((serverLiked) => {
        setLiked(serverLiked);
        setLikeCount((c) => {
          // Correct the optimistic guess if the server disagrees.
          if (serverLiked === next) return c;
          return Math.max(0, c + (serverLiked ? 1 : -1));
        });
      })
      .catch(() => {
        // Roll back on failure.
        setLiked(liked);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      })
      .finally(() => {
        likePending.current = false;
      });
  }, [liked, video.id]);

  const bumpCommentCount = useCallback((delta: number) => {
    setCommentCount((c) => Math.max(0, c + delta));
  }, []);

  const countView = useCallback(() => {
    if (countedView.current) return;
    countedView.current = true;
    // The server dedupes by (video, viewer): only bump the shown count if this
    // is a genuinely new view for this user, not a re-watch.
    incrementViewCount(video.id).then((isNewView) => {
      if (isNewView) setViews((v) => v + 1);
    });
  }, [video.id]);

  // Instagram autoplays on scroll-in (its own page can't be scripted, and its
  // own centre button is the only play control). YouTube does NOT: `playing`
  // stays false until the viewer taps our poster, so an in-app YouTube play is
  // always an explicit, user-initiated watch — the only kind YouTube itself may
  // count toward the real video. Either way, stop when the item scrolls out. A
  // manual pause while active isn't overridden here, since this only re-runs
  // when `isActive` flips.
  useEffect(() => {
    if (isInstagram) setPlaying(isActive);
    else if (!isActive) setPlaying(false);
    if (!isActive) setStarted(false);
  }, [isActive, isInstagram]);

  // Instagram: count the view on scroll-in — the tap that starts an IG reel
  // happens inside its own page and can't be observed. YouTube: the view is
  // counted from `onWatched` (≈30s of real playback) instead, so it reflects a
  // genuine watch rather than a scroll-by.
  useEffect(() => {
    if (isActive && isInstagram) countView();
  }, [isActive, isInstagram, countView]);

  // Tapping our poster only ever STARTS playback — it must not toggle. While the
  // embed is still loading (`playing` true, `started` not yet confirmed) the
  // play button is still on screen; a second, impatient tap used to flip
  // `playing` back to false, unmounting the half-loaded WebView and forcing the
  // whole load to restart from zero — so the reel felt like it "wouldn't play".
  // Pause/resume is the player's own tap layer's job once playback is running.
  const startPlay = useCallback(() => setPlaying(true), []);

  // Watchdog: if a tapped reel never reports real playback (blocked YouTube API,
  // dead embed, stalled network), fall back to the poster after a few seconds so
  // the viewer can tap again instead of staring at a spinner forever. Clears the
  // moment playback actually starts, or the reel scrolls out of view.
  useEffect(() => {
    if (isInstagram || !playing || started) return;
    const timer = setTimeout(() => setPlaying(false), 12000);
    return () => clearTimeout(timer);
  }, [isInstagram, playing, started]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    // Bring our poster + play button back so a finished YouTube reel can be
    // replayed with one tap instead of leaving a blank frame. Note: we
    // deliberately do NOT auto-advance to the next reel on end, and the embed
    // does not auto-loop — chaining/looping playback is the kind of pattern
    // YouTube's view validation discounts. A finished play just stops.
    setStarted(false);
  }, []);

  const handleStarted = useCallback(() => setStarted(true), []);

  // YouTube: our poster + tap-to-play. Instagram: the reel (IG's own page, with
  // IG's own poster + button) is mounted whenever the item is active. Either way,
  // pause the reel while the comments sheet is covering it.
  const showReel = (isInstagram ? isActive : isActive && playing) && !commentsOpen;
  // Whether OUR chrome (poster/dim/"For You") should mask the player. For
  // Instagram this is just "not active" (no app poster ever, per above). For
  // YouTube it stays masked through the mount+load window, only clearing once
  // `started` confirms real video frames are on screen.
  const showChrome = isInstagram ? !showReel : !started;

  const initials = (video.author_name ?? '??').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.item, { height: itemHeight }]}>
      <LinearGradient
        colors={[gradientFrom, colors.background, gradientTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* The actual player. Mounts (and starts loading/autoplaying) the instant
          the item is active, underneath our poster below — see `showChrome`. */}
      <VideoPlayer
        platform={video.platform}
        videoId={video.platform_video_id}
        playing={showReel}
        muted={!soundOn}
        onEnded={handleEnded}
        onStarted={isInstagram ? undefined : handleStarted}
        onWatched={isInstagram ? undefined : countView}
        style={styles.playerFill}
      />

      {/* Poster art, layered ON TOP of the player so it masks YouTube's own
          loading poster/play-button flash while the WebView loads — see
          `showChrome`. Blurred via a BlurView overlay (RN has no CSS `filter`)
          as a soft backdrop — a given video's poster frame can be anything
          (e.g. a white screen-share), so we don't show it sharp. */}
      {showChrome && posterUri ? (
        <>
          <Image
            source={{ uri: posterUri }}
            onError={handlePosterError}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </>
      ) : null}

      {/* Stopped/loading-state only: full dim + top scrim + "For You" tag. */}
      {showChrome ? (
        <>
          <View style={styles.posterScrim} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topGradient} pointerEvents="none" />
          <Text style={styles.forYou}>For You</Text>
        </>
      ) : null}

      {/* Bottom scrim stays up during playback so the creator/caption row below
          it is legible over the video. */}
      <LinearGradient
        colors={['transparent', 'rgba(11,11,24,0.95)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* YouTube tap-to-play: the reel does not autoplay on scroll-in, so this
          full-bleed target (with a centred play glyph) is how the viewer starts
          it. Tapping mounts the embed, which then self-starts muted off this
          same gesture; the player's own tap layer takes over pause/resume once
          it's running (`started`), at which point this chrome clears.
          Instagram: the reel is already mounted, so the single tap lands on
          IG's own control — no app play button. */}
      {showChrome && !isInstagram ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={startPlay} accessibilityLabel="Play video">
          <View style={styles.playButtonWrap} pointerEvents="none">
            <View style={styles.playButton}>
              {playing ? (
                // Tapped — embed is mounting/buffering. Show a spinner so the tap
                // registers immediately instead of the button looking inert.
                <ActivityIndicator color="#fff" />
              ) : (
                <Feather name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
              )}
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* Action rail + creator/caption row stay visible while the reel plays
          (`box-none` so only the buttons take taps — the rest passes through to
          the video's own pause layer). */}
      <View style={styles.rail} pointerEvents="box-none">
        <View style={styles.railAction}>
          <Pressable
            style={[styles.railBtn, liked && styles.railBtnLiked]}
            onPress={toggleLike}
            accessibilityLabel={liked ? 'Unlike video' : 'Like video'}
          >
            <Feather name="heart" size={18} color={liked ? colors.indigo : '#fff'} />
          </Pressable>
          {likeCount > 0 ? <Text style={styles.railActionLabel}>{likeCount}</Text> : null}
        </View>
        <View style={styles.railAction}>
          <Pressable
            style={styles.railBtn}
            onPress={() => setCommentsOpen(true)}
            accessibilityLabel="View comments"
          >
            <Feather name="message-circle" size={18} color="#fff" />
          </Pressable>
          {commentCount > 0 ? <Text style={styles.railActionLabel}>{commentCount}</Text> : null}
        </View>
        <Pressable style={styles.railBtn} accessibilityLabel="Share video">
          <Feather name="share-2" size={18} color="#fff" />
        </Pressable>
        {/* YouTube only — a reel starts muted on tap (WebViews block
            autoplay-with-sound with no prior gesture); this turns sound on for
            the current and all future reels. Instagram's own page audio isn't
            reachable from here, so the toggle is hidden for it. */}
        {!isInstagram ? (
          <Pressable style={styles.railBtn} accessibilityLabel={soundOn ? 'Mute video' : 'Unmute video'} onPress={onToggleSound}>
            <Feather name={soundOn ? 'volume-2' : 'volume-x'} size={18} color="#fff" />
          </Pressable>
        ) : null}
        {/* Deliberately "in-app views", never just "views": this is
            view_count_in_app (watches inside ReelSpark), which is not — and will
            differ from — the video's real YouTube/Instagram view count. */}
        <View style={styles.railCount}>
          <Text style={styles.railCountNumber}>{views}</Text>
          <Text style={styles.railCountLabel}>in-app{'\n'}views</Text>
        </View>
      </View>

      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.creatorRow} onPress={onCreatorPress}>
          <Avatar initials={initials} size={26} />
          <Text style={styles.creatorName}>{video.author_name ?? 'Unknown creator'}</Text>
          <PlatformChip platform={video.platform} />
        </Pressable>
        <Text style={styles.caption} numberOfLines={2}>
          {video.title ?? 'Untitled submission'}
        </Text>
        <Text style={styles.swipeHint}>↑ Swipe up for next</Text>
      </View>

      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountDelta={bumpCommentCount}
      />
    </View>
  );
}

const SOUND_PREF_KEY = 'reelspark:feedSoundOn';

export function FeedScreen() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed();
  const isFocused = useIsFocused();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  // Shared across every reel; the choice survives a reload. Defaults to sound
  // ON: a muted play is a weaker "real view" signal to YouTube, and playback
  // here always follows an explicit tap-to-play so autoplay-with-sound is
  // already permitted. A viewer who mutes is remembered (stored '0') and every
  // later reel stays muted for them. AsyncStorage replaces the web build's
  // localStorage and is async, so this starts at the default and corrects
  // itself once the stored value loads (a beat after first paint, not visible
  // in practice since no reel plays until tapped).
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(SOUND_PREF_KEY)
      .then((stored) => {
        if (stored !== null) setSoundOn(stored === '1');
      })
      .catch(() => {
        /* storage unavailable — keep the default for this session */
      });
  }, []);
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      AsyncStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0').catch(() => {
        /* storage unavailable — keep the in-memory value for this session */
      });
      return next;
    });
  }, []);

  // Each feed item is exactly as tall as the visible feed area — full-bleed,
  // since this app has no tab bar (§3a). Seeded from the window height so the
  // list always renders, then corrected by onLayout — the list is keyed on
  // this value so it remounts cleanly when it changes, keeping item height ===
  // snapToInterval === getItemLayout length on every device.
  const [areaHeight, setAreaHeight] = useState(() => Math.round(Dimensions.get('window').height));
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setAreaHeight((prev) => (Math.abs(prev - h) <= 1 ? prev : h));
  }, []);

  const videos = data?.pages.flat() ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);

  const listRef = useRef<FlatList<Video>>(null);

  // Keep the active id in a ref-stable callback (FlatList warns if this changes).
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((token) => token.isViewable);
    if (first?.item) setActiveId((first.item as Video).id);
  });
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 });

  const renderItem = useCallback(
    ({ item }: { item: Video }) => (
      <FeedItem
        video={item}
        // The Feed screen stays mounted underneath Submit/Profile pushes (§3a),
        // so gate on focus too — otherwise the active reel keeps autoplaying
        // (and counting views) in the background after navigating away.
        isActive={isFocused && item.id === activeId}
        itemHeight={areaHeight}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onCreatorPress={() => {
          if (item.submitted_by) {
            navigation.navigate('UserProfile', {
              userId: item.submitted_by,
              userName: item.author_name ?? 'Unknown creator',
            });
          }
        }}
      />
    ),
    [activeId, areaHeight, soundOn, toggleSound, isFocused, navigation],
  );

  const topBar = (
    <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
      <Text style={styles.wordmark}>ReelSpark</Text>
      <Pressable
        onPress={() => navigation.navigate('Profile')}
        style={styles.avatar}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Feather name="user" size={16} color={colors.text} />
      </Pressable>
    </View>
  );

  const submitFab = (
    <Pressable
      onPress={() => navigation.navigate('Submit')}
      style={[styles.submitFab, { bottom: insets.bottom + spacing.xl }]}
      accessibilityRole="button"
      accessibilityLabel="Submit a link"
    >
      <Text style={styles.submitFabLabel}>+</Text>
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.indigo} />
        {topBar}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Couldn't load the feed. Pull to try again.</Text>
        {topBar}
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No videos yet</Text>
        <Text style={styles.emptyText}>Be the first to submit a Short or Reel — approved submissions show up here.</Text>
        {topBar}
        {submitFab}
      </View>
    );
  }

  return (
    <View style={styles.screen} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        // Remount cleanly when the feed area resizes so scroll offsets can't
        // drift out of sync with the new item height.
        key={`feed-${areaHeight}`}
        style={styles.list}
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={areaHeight}
        getItemLayout={(_, index) => ({ length: areaHeight, offset: areaHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig.current}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true }), 60);
        }}
        onEndReachedThreshold={1.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
      />
      {topBar}
      {submitFab}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  list: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  wordmark: { ...type.h3, color: colors.text },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitFab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.indigo,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 10,
  },
  submitFabLabel: { fontSize: 30, lineHeight: 32, color: colors.background, fontFamily: type.h1.fontFamily },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontFamily: fonts.displaySemibold, fontSize: 18 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  item: { width: '100%', overflow: 'hidden' },
  posterScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,11,24,0.18)' },
  playerFill: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  playButtonWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 130 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 },
  forYou: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  rail: { position: 'absolute', right: 14, bottom: 100, alignItems: 'center', gap: 18 },
  railAction: { alignItems: 'center', gap: 4 },
  railActionLabel: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 11 },
  railBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBtnLiked: { backgroundColor: 'rgba(97,83,245,0.16)', borderColor: colors.indigo },
  railCount: { alignItems: 'center' },
  railCountNumber: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 12 },
  railCountLabel: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', lineHeight: 12 },
  overlay: { position: 'absolute', left: 18, right: 74, bottom: 40, gap: 8 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  creatorName: { color: colors.text, fontFamily: fonts.bodySemibold, fontSize: 14 },
  caption: { color: '#EDEDF2', fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  swipeHint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 },
});
