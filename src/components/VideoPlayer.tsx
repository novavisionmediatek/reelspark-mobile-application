import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { YT_EMBED_ORIGIN, youtubeEmbedHtml } from './youtubeEmbedHtml';
import {
  INSTAGRAM_EXTRA_HEIGHT_PX,
  INSTAGRAM_HEADER_PX,
  INSTAGRAM_MASK_BOTTOM_HEIGHT_PX,
  INSTAGRAM_MASK_BOTTOM_OPAQUE_PX,
  INSTAGRAM_MASK_TOP_HEIGHT_PX,
  INSTAGRAM_MASK_TOP_OPAQUE_PX,
  INSTAGRAM_SCALE,
  instagramReelEmbedSrc,
} from './instagramEmbedHtml';

export interface VideoPlayerProps {
  platform: 'youtube' | 'instagram';
  videoId: string;
  playing: boolean;
  // YouTube only: whether the reel should be silent. WebViews block
  // autoplay-with-sound unless the page already saw a user gesture, so every
  // reel mounts muted and this is how the app's speaker toggle turns sound on
  // without restarting the clip (see the `muted`-changed effect below).
  muted?: boolean;
  onEnded?: () => void;
  // YouTube only: fires once the embed confirms real playback has begun (not
  // just that the WebView mounted) — see `youtubeEmbedHtml.ts`'s 'playing'
  // postMessage. Lets the caller keep its own poster up over the WebView's
  // brief load/buffer window instead of exposing YouTube's own loading state.
  onStarted?: () => void;
  // YouTube only: fires once, after ~30s of real playback have accumulated (or a
  // near-complete watch of a shorter clip) — see `youtubeEmbedHtml.ts`'s
  // 'watched' postMessage. The feed counts the in-app view on this, not on
  // scroll-in, so an in-app play is a genuine watch YouTube may also count.
  onWatched?: () => void;
  style?: StyleProp<ViewStyle>;
}

// Native rework of the web build's DOM-iframe player (§5 of PROJECT_PLAN.md):
// YouTube reuses the exact same IFrame-API HTML via `source={{ html }}`
// (youtubeEmbedHtml.ts already posts through `window.ReactNativeWebView`, so
// that file needed no changes at all); Instagram loads its /embed/ page
// directly via `source={{ uri }}` and is clipped/offset with RN's absolute
// positioning instead of CSS (see instagramEmbedHtml.ts — UNVERIFIED on real
// devices, per §8).
export function VideoPlayer({ platform, videoId, playing, muted = true, onEnded, onStarted, onWatched, style }: VideoPlayerProps) {
  const isYouTube = platform === 'youtube';
  const webViewRef = useRef<WebView>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  function handleMessage(e: WebViewMessageEvent) {
    const data = e.nativeEvent.data;
    if (data === 'ended') onEnded?.();
    else if (data === 'playing') onStarted?.();
    else if (data === 'watched') onWatched?.();
  }

  // Only the initial mute state is baked into the WebView's HTML (below) —
  // reacting to `muted` here and posting to the live player instead means
  // toggling sound doesn't reload (and restart) the clip. WebView.postMessage
  // dispatches a `window` 'message' event inside the page with this string as
  // `.data`, which is exactly what youtubeEmbedHtml.ts's listener expects.
  useEffect(() => {
    if (!playing || !isYouTube) return;
    webViewRef.current?.postMessage(muted ? 'mute' : 'unmute');
  }, [playing, isYouTube, muted]);

  // Frozen at the moment playback starts (each scroll-in mounts a fresh WebView
  // instance, since `playing` going false unmounts it below) so later `muted`
  // changes flow through the postMessage effect above instead of regenerating
  // the HTML and reloading the WebView.
  const initialMutedRef = useRef(muted);
  const wasPlayingRef = useRef(false);
  if (playing && !wasPlayingRef.current) initialMutedRef.current = muted;
  wasPlayingRef.current = playing;

  // react-native-webview has no web implementation — it renders a plain "does
  // not support this platform" fallback there, with none of this file's props
  // wired up (no onMessage, so onStarted/onWatched/onEnded never fire). Left
  // as-is, that fallback sits invisibly behind FeedScreen's poster/spinner
  // forever (started never flips true), which looks like a silent, confusing
  // hang rather than the known platform gap it actually is (video was only
  // ever meant to be checked on Android/iOS — see PROJECT_PLAN.md §8/§9).
  // Firing onStarted immediately here clears that chrome so the explanatory
  // message below is actually visible instead of hidden underneath it.
  const isWeb = Platform.OS === 'web';
  useEffect(() => {
    if (isWeb && playing && isYouTube) onStarted?.();
  }, [isWeb, playing, isYouTube, onStarted]);

  if (isWeb) {
    return (
      <View style={[styles.fill, style]}>
        {playing ? (
          <View style={styles.webNotice}>
            <Text style={styles.webNoticeText}>
              Video preview isn't available in the browser — react-native-webview doesn't support web. Run this app on
              an Android emulator/device or iOS simulator/device to watch.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  const showYouTube = playing && isYouTube;
  const showInstagram = playing && !isYouTube && size.width > 0 && size.height > 0;

  return (
    <View style={[styles.fill, style]} onLayout={onLayout}>
      {showYouTube ? (
        <WebView
          key={`yt-${videoId}`}
          ref={webViewRef}
          source={{ html: youtubeEmbedHtml(videoId, YT_EMBED_ORIGIN, initialMutedRef.current), baseUrl: YT_EMBED_ORIGIN }}
          onMessage={handleMessage}
          style={styles.fill}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
        />
      ) : null}

      {showInstagram ? (
        <>
          <WebView
            key={`ig-${videoId}`}
            source={{ uri: instagramReelEmbedSrc(videoId) }}
            style={{
              position: 'absolute',
              left: (1 - INSTAGRAM_SCALE) * 0.5 * size.width,
              top: -(INSTAGRAM_HEADER_PX * INSTAGRAM_SCALE),
              width: INSTAGRAM_SCALE * size.width,
              height: INSTAGRAM_SCALE * size.height + INSTAGRAM_EXTRA_HEIGHT_PX,
              backgroundColor: '#000',
            }}
            scrollEnabled={false}
            bounces={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            domStorageEnabled
            overScrollMode="never"
          />
          {/* Top + bottom scrim "padding", same as the YouTube embed's #mask-top /
              #mask-bottom: opaque for OPAQUE px, then fading out. Top gives the
              reel some breathing room; bottom also covers IG's footer text. */}
          <LinearGradient
            colors={['#000', '#000', 'transparent']}
            locations={[0, INSTAGRAM_MASK_TOP_OPAQUE_PX / INSTAGRAM_MASK_TOP_HEIGHT_PX, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.maskTop, { height: INSTAGRAM_MASK_TOP_HEIGHT_PX }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', '#000', '#000']}
            locations={[0, 1 - INSTAGRAM_MASK_BOTTOM_OPAQUE_PX / INSTAGRAM_MASK_BOTTOM_HEIGHT_PX, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.maskBottom, { height: INSTAGRAM_MASK_BOTTOM_HEIGHT_PX }]}
            pointerEvents="none"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: '#000', overflow: 'hidden' },
  maskTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  maskBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  webNotice: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  webNoticeText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
