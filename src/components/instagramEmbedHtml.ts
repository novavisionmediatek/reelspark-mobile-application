// Instagram Reel player helpers.
//
// Instagram's only public embed is `/reel/<id>/embed/`, a fixed webpage with an
// account header, a like/comment/"more on Instagram" footer, and padding around
// the video — none of which can be turned off, and none of which we can reach
// into (it's a cross-origin document). Instagram's own centre play button lives
// inside that page, so no CSS or script of ours can remove it; it disappears on
// its own once the reel starts.
//
// On native this page is loaded directly as a react-native-webview's
// `source={{ uri }}` (VideoPlayer.tsx) — the same "load the real page, then clip
// + offset the WebView with plain layout" approach the web build uses for its
// iframe, ported to RN's absolute-position styling instead of CSS. A CSS
// `transform: scale()` is avoided there for the same reason it was avoided on
// web: it can break touch routing into the embedded page.
//
// The constants below (scale, offsets, mask heights) are UNVERIFIED on native —
// they carried over as pixel-for-pixel equivalents of the web build's working
// values, but WKWebView (iOS) and Android's System WebView can differ from
// desktop Chrome in how they lay out a page at a non-default viewport size.
// PROJECT_PLAN.md §5/§8 flags this as needing an on-device spike before Phase 2
// is considered verified; VideoPlayer.tsx's Instagram branch is that first
// attempt, not a confirmed-working port.
//
//  - The WebView is rendered INSTAGRAM_SCALE times wider than the clip. IG lays
//    its whole page out to that width, so the reel's media area grows with it —
//    at scale 1.0 the media is shorter than our 9:16 frame and IG's footer
//    shows underneath it; enlarging the media pushes IG's header off the top and
//    its footer off (or nearly off) the bottom. The extra width spills past the
//    clip evenly on both sides (`left` offset) and is cropped — a reel is
//    centre-weighted, so this only trims the edges. Scale is a compromise: just
//    enough to clear IG's chrome without zooming the reel past Instagram's own
//    framing (see INSTAGRAM_SCALE).
//  - The WebView is pulled up by the (now scaled) header height so IG's header
//    clears the top, and made taller than it needs to be so IG lays the footer
//    out normally before the clip hides it.
//
// A pixel-perfect, crop-free result is only possible by playing the raw .mp4.
//
// Caveats that are Instagram's, not ours: the reel needs one tap to start (IG
// embeds don't autoplay) and there's no "ended" event, so IG items don't
// auto-advance the way YouTube ones do.

// How much wider than the clip to render IG's page. 1.0 = no enlargement (IG's
// footer then sits visible below the reel); the higher it goes the more IG's
// header/footer fall outside the clip, but every step also zooms the reel and
// trims more off its left and right edges. 1.9 fully clears IG's chrome but
// over-zooms — the reel ends up noticeably tighter than it looks in Instagram
// itself. 1.5 keeps the framing close to Instagram's; any thin strip of IG's
// footer left at the bottom is covered by the feed's own bottom scrim/action
// rail (which stays drawn over IG reels). Lower it if the sides are still too
// tight; raise it if more than a sliver of IG's footer shows above the scrim.
export const INSTAGRAM_SCALE = 1.5;

// Header height (CSS px) BEFORE scaling — multiplied by INSTAGRAM_SCALE at use.
// Raise if a strip of IG's header shows; lower if the reel's top is cut.
export const INSTAGRAM_HEADER_PX = 52;

// Slack (CSS px) added to the WebView height so IG lays its footer out normally
// before the clip hides it. Only needs to comfortably exceed IG's footer height.
export const INSTAGRAM_EXTRA_HEIGHT_PX = 400;

// Top + bottom scrim "padding" over the clip, on top of the WebView — the same
// treatment the YouTube embed gives itself (youtubeEmbedHtml.ts MASK_*). Each
// strip is opaque black for the first OPAQUE px, then fades to transparent over
// the rest so it reads as framing, not a hard bar:
//  - TOP: pure header padding. IG draws no chrome at the top edge (its header is
//    pulled off-clip), so this is mostly fade — a slim dark band that gives the
//    reel some breathing room up top like the YouTube one.
//  - BOTTOM: footer padding AND a cover for IG's like/caption/"more on Instagram"
//    strip, which creeps up into the clip at this scale. The opaque portion must
//    be tall enough to hide that text; it then fades up into the video. It does
//    NOT cover IG's centre "Watch again on Instagram" replay card (inside IG's
//    own page — only the raw .mp4 avoids that).
export const INSTAGRAM_MASK_TOP_HEIGHT_PX = 112;
export const INSTAGRAM_MASK_TOP_OPAQUE_PX = 40;
export const INSTAGRAM_MASK_BOTTOM_HEIGHT_PX = 240;
export const INSTAGRAM_MASK_BOTTOM_OPAQUE_PX = 168;

export function instagramReelEmbedSrc(reelId: string): string {
  const safeId = String(reelId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `https://www.instagram.com/reel/${safeId}/embed/`;
}
