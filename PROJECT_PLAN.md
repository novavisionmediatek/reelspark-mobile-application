# ReelSpark Native Mobile App — Implementation Plan

## Context

[reelspark.in](https://reelspark.in) is the existing web app, live in production under **Matrigyan Private Limited**. It is *itself* a React Native codebase (`../mobile`) that was deliberately migrated off Expo onto Vite + `react-native-web` early on (commit `16eb672`), so it could ship as a browser app. It still imports `View`/`FlatList`/`Pressable` from `'react-native'`, uses React Navigation, and calls Supabase directly — only a thin layer (video embeds, payments, a few Expo-module shims) is web-specific.

**This means this project is a port, not a green-field build.** The goal is a real iOS + Android app that shares the same Supabase backend and business logic as the web app, reworking only the seams that don't survive the trip back to native. It lives standalone at `D:\project\mobile-application` — **not** inside the `reelsparks` monorepo alongside `apps/mobile`/`apps/admin` (revised from the original monorepo-home decision; see note below).

**What ReelSpark is**, for anyone new to it: creators submit links to their own YouTube Shorts / Instagram Reels; other users browse an in-app vertical feed and watch them via official embeds (no re-hosted video); posting requires a ₹300/year paid membership (Razorpay on web); there's a referral-bonus wallet, likes/comments, and an admin moderation dashboard (`apps/admin`, out of scope here — it stays as the web-only back office).

**Decisions made with the user:**
- **Full feature parity for v1** — feed, submit, profile, payments, referral wallet, likes/comments, notification prefs, all ported, not deferred.
- **Both iOS and Android, in this same release.** Apple Guideline 3.1.1 requires Apple In-App Purchase for anything that unlocks in-app functionality — the ₹300 posting membership almost certainly qualifies — so **iOS pays via Apple IAP, Android keeps Razorpay**, both writing into the same `profiles.payment_status` / `paid_until` entitlement the backend already uses. See §6 and §8.
- **Expo (managed, EAS Build/Submit)**, not bare RN CLI. The web app's own shims (`src/shims/expo-*`) exist *only* to stand in for real Expo modules it used to have — reverting to Expo un-does that and gets font loading, image picking, gradients, icons, push notifications, and EAS store builds essentially for free.
- **New visual identity — "Emerald Signal."** Client (Santosh) asked for a different colour combination than the web app's orange→coral→pink→magenta→purple gradient. Reviewed four full-departure directions against the actual Feed UI; picked a dark green-black canvas with a mint→teal gradient accent — keeps the dark-canvas convention short-form video apps rely on (video pops against black), claims a hue none of TikTok/Instagram/YouTube use, and reads as trustworthy for a paid-membership product. Token values in §1a below; this **replaces**, not ports, `theme/tokens.ts`.
- **Immersive, tab-bar-free navigation.** Moved off the web app's 4-item bottom tab bar. Feed is the app's full-bleed root screen — idiomatic for this genre, since TikTok/Reels/Shorts never run a persistent tab bar over the video — reached via a floating **+** for Submit and a corner avatar into Profile, with My Videos moved from a top-level tab to a section inside Profile. See §3a.
- **Standalone repo, not the monorepo** *(revised from the original plan)*. Lives at `D:\project\mobile-application`, its own git repo, **not** inside `reelsparks`. Points at the *same* Supabase project as `reelspark.in` purely via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars (see `.env.example`) — same backend, same users, same RPCs, no monorepo required to reach it. Trade-off, stated plainly: no direct filesystem access to `packages/shared` TS types or `supabase/migrations` — if a type or RPC shape changes on the backend side, it has to be hand-checked against `reelsparks/supabase/migrations` (or the Supabase dashboard) rather than picked up automatically by the compiler. New Supabase migrations/Edge Functions this project needs (e.g. `revenuecat-webhook`, `device_push_tokens`) get applied directly against the shared Supabase project (via `supabase db push`/dashboard), not committed into this repo's own folder.

**Scaffold status (done so far):** Expo TypeScript app created via `create-expo-app` (blank-typescript template), originally scaffolded at `reelsparks/apps/mobile-native` and since moved to this standalone repo (`D:\project\mobile-application`) — all source files, `package.json`, `app.json`, assets copied over, `npm install` run fresh here. Installed: React Navigation (native + native-stack), `react-native-screens`/`safe-area-context`, Supabase JS, AsyncStorage, TanStack Query, `react-native-webview`, `expo-linear-gradient`, `expo-image-picker`, `@expo/vector-icons`, `react-native-svg`, `expo-font` + the three `@expo-google-fonts/*` packages, `expo-notifications`, `react-native-razorpay`, `react-native-purchases` (RevenueCat), plus `react-dom`/`react-native-web`/`@expo/metro-runtime` for a browser-preview dev convenience (`npm run web` — see §2 note below). Written: `theme/tokens.ts` (Emerald Signal, §1a), `theme/responsive.ts` (ported), `lib/supabase.ts` (AsyncStorage-backed client), `lib/AuthProvider.tsx` + `lib/referral.ts` (native-adapted), the full `AuthStack` (Welcome/SignUp/Login/ForgotPassword/CompleteProfile) wired into `App.tsx`'s session-gated `AppGate`, real `ProfileStack` screens (Profile/EditProfile/AccountSettings/Notifications/HelpSupport) with their hooks, shared components (`Button`/`TextField`/`Logo`/`Avatar`), and `RootNavigator`/`ProfileStackNavigator` implementing §3a's tab-bar-free shape — Feed/Submit remain placeholders (Phase 2/3), `MyVideos`/`ReferralWallet` remain placeholders (Phase 3/5) by design. Fonts load via `useFonts()` in `App.tsx` before first render. `npx tsc --noEmit`, `npx expo-doctor` (21/21), and `npx expo export` (Android + web) all pass clean. All seven phases now have code written (Phases 1, 3, 5 done; Phases 2, 4, 6 code-complete but unverified/unapplied for reasons specific to each — see §9; Phase 7 is non-code business work, not started). **What's genuinely still open, in order of "needs a human with access I don't have":** EAS project + bundle IDs; on-device verification of the video feed (Phase 2, §8); a dev/EAS build to exercise the Razorpay native SDK; a RevenueCat account + App Store Connect subscription product; applying `0014_device_push_tokens.sql` and `0015_revenuecat_payments.sql` and deploying `revenuecat-webhook` (no Supabase CLI/credentials available in this environment); the server-side push-sending trigger (Phase 6, needs its own design pass); and all of Phase 7 (store listings, screenshots, submission).

---

## 1. Reuse Map — what ports as-is vs what needs native rework

The web app's `src/` (`screens/`, `components/`, `hooks/`, `lib/`, `navigation/`, `theme/`) is ~4,000 lines. Rough breakdown:

**Ports with little to no change** (already plain RN + platform-agnostic logic):
- `theme/responsive.ts` — breakpoints/layout logic, unaffected by the palette change. (`theme/tokens.ts` itself is **not** a straight port — see §1a, new colour direction.)
- `navigation/AuthNavigator.tsx`, `ProfileStackNavigator.tsx`, `RootNavigator.tsx` — still `@react-navigation/native` + `native-stack`, same on native. (`MainTabNavigator.tsx` / `MainStackNavigator.tsx` are **not** a straight port — the bottom-tabs pattern they implement is being replaced; see §3a.)
- `hooks/*` (`useFeed`, `useMyVideos`, `useComments`, `useReferralWallet`, `useSubmitVideo`, `useUpdateProfile`, `useNotificationPrefs`, `useAppSettings`) — TanStack Query + Supabase RPC calls, no DOM dependency.
- `lib/urlParsers.ts`, `lib/youtubeOembed.ts`, `lib/ytThumb.ts`, `lib/referral.ts`, `lib/reelsparkLogo.ts` — pure logic.
- `lib/AuthProvider.tsx` — Supabase auth context, same shape.
- Most of `screens/*.tsx` (Profile, EditProfile, AccountSettings, MyVideos, HelpSupport, Notifications, ReferralWallet, auth screens) — plain RN layout, no iframes.
- `components/Avatar.tsx`, `Badge.tsx`, `Button.tsx`, `Logo.tsx`, `PlatformChip.tsx`, `TextField.tsx`, `CommentsSheet.tsx`.

**Needs native rework** (the actual scope of this project):
| Area | Web approach | Native approach |
|---|---|---|
| Video playback (`components/VideoPlayer.tsx`, `youtubeEmbedHtml.ts`, `instagramEmbedHtml.ts`) | Raw DOM `<iframe srcDoc>` + `window.postMessage` | `react-native-webview`, `source={{ html }}`, `injectedJavaScript` + `onMessage` bridge (same embed HTML strings, different postMessage target: `window.ReactNativeWebView.postMessage`) |
| Payments (`lib/razorpay.ts`, `PaymentScreen.tsx`, `useRegistrationPayment.ts`) | `checkout.razorpay.com/v1/checkout.js` browser overlay | **Android:** official `react-native-razorpay` SDK, same `razorpay-create-order` / `razorpay-verify-payment` / `razorpay-webhook` Edge Functions. **iOS:** Apple IAP (via RevenueCat, see §6) driving the same `confirm_razorpay_payment`-style entitlement RPC |
| Session persistence (`lib/supabase.ts`) | `localStorage` (supabase-js default) | `@react-native-async-storage/async-storage` passed to `createClient({ auth: { storage } })` |
| `shims/expo-linear-gradient.tsx` | CSS `linear-gradient` View | real `expo-linear-gradient` |
| `shims/expo-image-picker.ts` | hidden `<input type="file">` | real `expo-image-picker` |
| `shims/vector-icons.tsx` | inline SVGs | real `@expo/vector-icons` |
| Fonts (`fonts.css`, `@fontsource/*`) | `@font-face` CSS | `expo-font` + `@expo-google-fonts/inter` / `unbounded` / `jetbrains-mono` (this app *had* these before the migration — see `git show f5b024f:apps/mobile/package.json`) |
| Referral deep link (`?ref=CODE` query param, `lib/referral.ts`) | URL query string | Universal Links (iOS) / App Links (Android) + `Linking.getInitialURL` / `Linking.addEventListener('url')`, same for password-reset links |
| Legal pages (`assets/legal/*.html`) | served at `/legal/*` | **don't duplicate** — open `https://reelspark.in/legal/...` via `Linking.openURL` or an in-app WebView browser screen |
| Push notifications | not implemented (web `NotificationsScreen` is just boolean prefs, no real push) | **new capability** — `expo-notifications` + a device-token table, opt-in wired to the same prefs UI (§7) |

### 1a. Visual identity — "Indigo Pulse" *(revised — replaces "Emerald Signal")*

Chosen after a five-direction color review (Emerald Signal kept as the baseline, plus Indigo Pulse, Amber Ember, Crimson Bloom, Cyan Frequency, compared side-by-side against mocked Feed/Submit/action-rail elements). Blue-violet carries the same "trustworthy for a paid product" meaning green did — the standard trust color in finance/fintech UI — while reading more premium/social; it avoids the traps the other three had (Amber's luxury connotation undercuts the ₹300/year affordable pricing; Crimson collides with YouTube's own red *and* with this app's own danger/error red, a real usability conflict, not just a taste call; Cyan reads colder/more solo-tech than a community app benefits from). Dark near-black canvas is unchanged — video still needs a black stage to pop against. **Already applied** at `src/theme/tokens.ts` and, by extension, every screen that reads from it (nothing hardcodes color literals outside this file and the handful of `rgba()` overlays that shadow it, which were updated to match):

```ts
export const colors = {
  background: '#0B0B18',
  surface: '#14142A',
  surfaceRaised: '#1C1C38',
  border: '#2A2A4A',
  text: '#F1F0FB',
  textMuted: '#8B87B5',
  softSurface: '#F4F3FB',

  periwinkle: '#7C6EFF',
  indigo: '#6153F5',
  violet: '#4A3FD6',
  deepIndigo: '#3730A3',
  midnight: '#2C2470',

  success: '#6153F5',
  danger: '#F2545B',   // kept off-brand on purpose — error states need a universal red, not the accent hue
  pending: '#3730A3',
} as const;

export const gradient = {
  brand: [colors.periwinkle, colors.indigo, colors.violet, colors.deepIndigo, colors.midnight] as const,
  brandLocations: [0, 0.25, 0.48, 0.7, 1] as const,
};
```

`type`/`fonts`/`radius`/`spacing` are unaffected by the palette change. **Apply the gradient with the same restraint the original orange-to-purple one got** — accents (buttons, play button, submit FAB) rather than large washed surfaces, so it doesn't drift toward reading as a finance/wellness app.

**Not yet updated — a real gap, not an oversight:** `app.json`'s `backgroundColor`/`adaptiveIcon.backgroundColor`/notification-icon tint were updated to match, but the actual **PNG assets** (`assets/icon.png`, `assets/splash-icon.png`, `assets/android-icon-*.png`, `assets/favicon.png`) are raster images baked with the old green identity — regenerating those is an image/design task, not something achievable by editing code. They need to be redrawn (or regenerated by whatever produced the originals) to match Indigo Pulse before this reads as fully rebranded rather than "new colors, old icon."

---

## 2. Tech Stack

- **Framework:** React Native + Expo (SDK 57, TypeScript, EAS Build/Submit for store binaries.
- **Navigation:** React Navigation, **native-stack only** — no `bottom-tabs` (see §3a).
- **Data:** TanStack Query + `@supabase/supabase-js`, same schema/RPCs as web/admin.
- **Video:** `react-native-webview`.
- **Media/UI:** `expo-linear-gradient`, `expo-image-picker`, `@expo/vector-icons`, `expo-font` + `@expo-google-fonts/*`.
- **Payments:** `react-native-razorpay` (Android) + RevenueCat SDK (`react-native-purchases`) wrapping StoreKit (iOS).
- **Push:** `expo-notifications`.
- **Storage:** `@react-native-async-storage/async-storage`.

All of the above are already installed (see Scaffold status).

## 3. Project Structure

Standalone repo, sibling to (not inside) `reelsparks`:

```
mobile-application/                 # D:\project\mobile-application — this repo, its own git history
├── app.json                        # Expo config, bundle IDs, EAS project id
├── App.tsx                         # NavigationContainer + QueryClientProvider + RootNavigator
├── src/
│   ├── screens/                    # placeholders today (Feed/Submit/Profile/MyVideos) — real ports land Phase 1-3
│   ├── components/                 # empty — VideoPlayer + shared components land Phase 1-2
│   ├── hooks/                      # empty — ports in Phase 1+
│   ├── lib/                        # supabase.ts done; payments/ lands Phase 4
│   ├── navigation/                 # RootNavigator + ProfileStackNavigator done (§3a)
│   └── theme/                      # tokens.ts + responsive.ts done
├── .env / .env.example             # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
└── package.json                    # standalone npm project, own node_modules

reelsparks/                         # D:\project\reelspark\reelsparks — separate repo, referenced but not depended on
├── apps/mobile/                    # existing Vite + react-native-web build (reelspark.in) — unchanged, unrelated to this app
├── apps/admin/                     # existing React + Vite admin dashboard — unchanged
├── packages/shared/                # source of truth for shared TS types — hand-check against this, no automatic import
└── supabase/                       # source of truth for migrations/Edge Functions — this app's new backend work (§6, §7) is applied here directly
```

Run everything from inside `D:\project\mobile-application` with `npm start` (or `npx expo start`) — no workspace/monorepo tooling involved.

**Backend is not duplicated, but the repo is.** This app points at the *same* Supabase project as `reelspark.in` (same tables, same RPCs, same users) purely through env-var config — mobile, web and admin are three clients of one backend, but now two separate codebases instead of one. New backend work this project needs (a `device_push_tokens` table + an Edge Function reconciling RevenueCat webhooks into `profiles.payment_status`/`paid_until`, §6/§7) gets written and applied against `reelsparks/supabase/` directly (that's still the one place migrations/Edge Functions live), even though the mobile app code itself lives here.

## 3a. Navigation — immersive, tab-bar-free

Replaces the web app's `MainTabNavigator` (bottom tabs: Feed/Submit/My Videos/Profile) with a single root stack, matching how TikTok/Reels/Shorts structure their nav rather than a generic app's. **Implemented today** in `src/navigation/RootNavigator.tsx` + `ProfileStackNavigator.tsx` with placeholder screens:

- **`RootStack`** (native-stack, no tab bar): `Feed` is the initial/always-underneath screen, full-bleed — the video card, creator row and action rail (§5) own the whole viewport, with no persistent chrome competing with them.
- **Submit** is reached via a floating **+** button overlaid on the Feed (bottom-center, above the action rail) and opens as a modal stack push (`presentation: 'modal'`), not a tab — matches the "compose" pattern this genre uses, and keeps Feed as the one screen a user always lands back on.
- **Profile** is reached via a small avatar in Feed's top-right corner, pushing `ProfileStack` (`ProfileScreen` as its root). **My Videos moves here** — a section/entry inside `ProfileStack` rather than a top-level destination, since it's a "check on my own stuff" action, not a primary loop.
- `ProfileStack` keeps its existing children unchanged: EditProfile, AccountSettings, Notifications, ReferralWallet, HelpSupport, plus the newly-nested MyVideos.
- `AuthStack` (Welcome, SignUp, Login, ForgotPassword) is unaffected — it's pre-`RootStack` regardless of nav pattern. Not yet wired in (Phase 1) — `App.tsx` currently mounts straight into `RootNavigator`.

**Tradeoff, stated plainly:** My Videos is now one tap deeper (inside Profile) instead of always visible in a tab bar — traded deliberately for a feed that reads as a real short-video app on first launch rather than a generic 4-tab app shell.

## 4. Screens (mirrors web, native-adapted)

- `AuthStack`: Welcome, SignUp, Login, ForgotPassword (not yet wired — Phase 1).
- `RootStack`: **Feed** (full-bleed, floating Submit **+**, corner avatar → Profile — placeholder screen exists, real player lands §5) — see §3a.
- `ProfileStack`: Profile, **My Videos** (moved here, placeholder screens exist), EditProfile, AccountSettings, Notifications, ReferralWallet, HelpSupport (not yet wired — Phases 1/5/6).
- `PaymentScreen`: platform-branched — Android renders the existing Razorpay flow through the native SDK; iOS renders a RevenueCat paywall. Not yet built (Phase 4).

## 5. Video Feed Rework (the hardest port)

`VideoPlayer.tsx` becomes a `react-native-webview` wrapper:
- **YouTube:** same `youtubeEmbedHtml.ts` template, loaded via `source={{ html }}` instead of `srcDoc`; the page's `postMessage('ended'|'playing'|'watched')` calls become `window.ReactNativeWebView.postMessage(...)`, read via `onMessage` on the RN side. Mute/unmute still goes down via `webViewRef.current.postMessage(...)` → `injectedJavaScript` listener. `WATCH_THRESHOLD_SECONDS` view-counting logic is unchanged.
- **Instagram:** the scale/crop/mask trick (`instagramEmbedHtml.ts`, `INSTAGRAM_SCALE` etc.) is CSS run inside an iframe on web; inside a WebView it's the same CSS run inside the WebView's own document, so the constants should carry over — **but this needs an early on-device spike on both iOS and Android WebView (WKWebView / Android System WebView can differ from desktop Chrome in cross-origin iframe touch/scroll handling)** before relying on it for the whole feed. If it doesn't hold up 1:1, the fallback is Instagram's official RN embed pattern or a plainer non-cropped embed.
- **Windowed mounting:** keep the web app's rule (only the active feed item ±1 has a mounted player) — WebViews are far heavier than DOM iframes memory-wise, so this matters more on native, not less.
- **Manual tap-to-play, no autoplay:** same rule, same reasoning (§8 in the original web plan — it's about a genuine user-initiated watch, not just UX).

## 6. Payments & Entitlement (Android Razorpay / iOS Apple IAP)

Both platforms ultimately just need to flip `profiles.payment_status='approved'` + extend `paid_until` — the same row `has_active_membership()` already checks, so `SubmitScreen`'s `PaymentGate` logic ports unchanged.

- **Android:** `react-native-razorpay`'s `open()` replaces `checkout.js`; same `razorpay-create-order` → `razorpay-verify-payment` → `razorpay-webhook` → `confirm_razorpay_payment` RPC flow as web. Reuses existing Edge Functions as-is.
- **iOS:** Apple requires its own payment rail for this kind of unlock, so plug in **RevenueCat** (wraps StoreKit, handles receipt validation, renewal, restore-purchase — rolling this by hand against raw StoreKit is a lot of avoidable work for a recurring annual product): create an auto-renewing "ReelSpark Membership" subscription in App Store Connect, RevenueCat SDK in-app for the paywall/purchase, and a new Supabase Edge Function (`revenuecat-webhook`) that verifies RevenueCat's webhook signature and calls the same entitlement-setting RPC pattern as `confirm_razorpay_payment`. Price parity with the ₹300/year Android price should be set deliberately in App Store Connect (Apple's tier system, plus its ~15-30% cut, means the iOS price the user pays may need to differ to net the same).
- Referral-bonus crediting (`app_settings.referral_bonus_inr`, once per referred user's first approved payment) must fire from **both** paths into the same `referral_earnings` table — factor the "credit referrer" step out of `confirm_razorpay_payment` into something both the Razorpay and RevenueCat webhook handlers call.

## 7. Push Notifications (new capability, not in the web app)

The web `NotificationsScreen` only stores boolean prefs (`videoStatus`, `referralRewards`, `productUpdates`) with no delivery mechanism. Native adds real delivery:
- `expo-notifications` for device push tokens + permission prompt.
- New `device_push_tokens` table (Supabase), registered on login.
- Server-side triggers (video moderation decision, referral bonus credited) call Expo's push API — additive backend work, doesn't touch existing tables/RLS.
- Existing `useNotificationPrefs` hook and its toggle UI stay as the on/off switch for whether a push actually gets sent.

## 8. Risks

- **App Store Guideline 4.2 ("Minimum Functionality" / wrapper-app rejection):** a feed of embedded third-party videos reads as thin unless the native app leans on genuinely native value — profile, submission flow, push notifications, polished native UI, offline-friendly nav. Budget for a possible rejection/appeal cycle, same as the original web-app plan flagged.
- **Apple IAP price/timing:** the membership must go live in App Store Connect and pass review *before* the app can ship charging for it; RevenueCat + IAP adds real setup lead time — start this in Phase 0, not late.
- **Instagram WebView crop trick fidelity** (§5) — unverified on-device until spiked; treat as a research spike, not a known quantity.
- **YouTube autoplay-with-gesture inside a WebView:** the web trick (mute-then-unmute keyed off a real tap) needs re-verification inside `react-native-webview` on both OSes — mobile WebKit/Chromium autoplay policies aren't identical to desktop.
- **Platform ToS risk (YouTube/Instagram)** and **no ownership verification of submitted links** — both carried over unchanged from the original web-app plan; still open, still worth legal review in parallel with build, unrelated to going native.
- **Google Play UGC policy** — block/mute-user is still not in scope anywhere (web or native); recommend adding before either store submission, not just iOS.

## 9. Phase Order (no time estimates)

0. **Foundations** — ✅ done. Scaffolded, deps installed, tokens/responsive/supabase.ts/nav shape done, real `.env` wired to the live Supabase project (`gjaetfqanqnpwajxryrt`), fonts loading via `useFonts()` in `App.tsx`, `lib/AuthProvider.tsx` ported. **Still open:** EAS project + bundle IDs. Kick off App Store Connect membership product + RevenueCat account setup immediately (longest lead time) — not started.
1. **Auth + Profile** — ✅ done. `AuthStack` (Welcome/SignUp/Login/ForgotPassword/CompleteProfile) ported and wired into `App.tsx`'s `AppGate` (session → Auth vs CompleteProfile vs the main app, mirroring the web app's `RootNavigator` switch). `ProfileStack` real screens ported: `ProfileScreen`, `EditProfileScreen`, `AccountSettingsScreen`, `NotificationsScreen`, `HelpSupportScreen`, plus their hooks (`useUpdateProfile`, `useUploadAvatar`, `useMyVideos`, `useAppSettings`, `useNotificationPrefs`). `expo-image-picker`/`expo-linear-gradient`/`@expo/vector-icons`/`react-native-svg` installed and used directly (the web build's `src/shims/*` turned out to need no native counterpart — the ported screens already imported the real package names, the shims only existed for Vite's web alias). Native reworks beyond the reuse map: `lib/referral.ts` (AsyncStorage + `Linking` deep-link capture replacing sessionStorage/URL-query parsing — Universal Links/App Links association files are **not** yet hosted on reelspark.in, so today this only catches a `?ref=CODE` URL the OS already hands to the app), `useNotificationPrefs` (AsyncStorage replacing localStorage, hydrated async behind a sync-shaped API), logout/password-reset confirm dialogs (`Alert.alert` replacing `window.confirm`), invite sharing (`Share.share` replacing `navigator.share`/clipboard). `MyVideosScreen` and `ReferralWalletScreen` stay placeholders on purpose — the plan assigns their real ports to Phase 3 and Phase 5.
2. **Feed core** — ✅ code complete, ⚠️ **not yet verified on a real device** (see Verification #2 below — this is the gating step before Phase 2 can be called done). `VideoPlayer.tsx` rewritten around `react-native-webview`: YouTube loads `youtubeEmbedHtml.ts` via `source={{ html }}` completely unchanged (it already posted through `window.ReactNativeWebView`, so the same HTML/JS works verbatim in a native WebView); Instagram loads its `/embed/` page via `source={{ uri }}`, clipped/offset using RN's absolute positioning (computed from the container's measured size via `onLayout`) instead of the web build's CSS percentages/`calc()`. `FeedScreen.tsx` ported with the desktop-only branch dropped entirely (wheel/keyboard nav, the centered 9:16 card, `document` preconnect hints — none of it applies to a phone-shaped native app), `localStorage` swapped for AsyncStorage, the raw `<img>` poster swapped for RN `Image` + a new `expo-blur` `BlurView` overlay (RN has no CSS `filter: blur()`), `CommentsSheet`/`useComments`/`useFeed`/`PlatformChip`/`ytThumb.ts` ported with no other changes needed. **Known gaps, called out honestly:** the liked-heart icon is color-only, not filled (Feather has no filled-heart glyph in `@expo/vector-icons`, unlike the web build's SVG `fill` prop); share button is still a no-op (wiring it to `Share.share` is trivial but wasn't asked for here). The Instagram crop-trick constants and YouTube muted-autoplay both carried over as literal ports of the web build's values — **neither has been run on an actual iOS/Android WebView**, which is exactly the spike §8 flags as a real risk, not a formality. `react-native-webview` has **no web implementation at all** (confirmed by reading its source) — `VideoPlayer.tsx` now detects `Platform.OS === 'web'` and shows an explanatory message instead of the WebView's own inert fallback silently hiding behind the poster forever; this only affects the `npm run web` dev-convenience target, not Android/iOS.
3. **Submit + My Videos** — ✅ done. `SubmitScreen` (URL detection + metadata preview + `PaymentGate`), `useSubmitVideo`, `urlParsers.ts`, `youtubeOembed.ts`, `MyVideosScreen`, `StatusBadge` all ported. `PaymentGate`'s "activate membership" button shows an honest `Alert.alert("Coming soon", …)` instead of navigating to a `Payment` screen — there's no live payment path yet (that's Phase 4), so this is the real wiring for the current state, not a placeholder. `MyVideosScreen` was `BottomTabScreenProps` on web (a top-level tab); here it's nested in `ProfileStack` (§3a), so its own FAB reaches `Submit` via `navigation.getParent()` since `Submit` lives on the root stack, not `ProfileStack`.
4. **Payments** — ⚠️ **code complete, genuinely untested, and partly blocked on accounts nobody has created yet.** `PaymentScreen` (platform-branched), `useRegistrationPayment`/`usePayWithRazorpay`/`usePurchaseWithRevenueCat`/`useReconcilePayment`, `lib/payments/razorpay.ts`, `lib/payments/revenuecat.ts` all written; `SubmitScreen`'s `PaymentGate` and `ProfileScreen`'s membership pill now navigate to the real `Payment` screen instead of the Phase 3 placeholder alert.
   - **Android (Razorpay):** reuses the existing `razorpay-create-order`/`razorpay-verify-payment`/`razorpay-webhook` Edge Functions unchanged, `checkout.js` swapped for the native `react-native-razorpay` SDK. Attempting an actual Razorpay checkout needs a development build (`npx expo run:android` or an EAS dev build) — the SDK's `.open()` call does nothing in Expo Go. But `lib/payments/razorpay.ts` itself now lazy-`require()`s the package (Android-gated) instead of a top-level `import`: the package unconditionally constructs a `new NativeEventEmitter(...)` when first evaluated, and React Native's own `NativeEventEmitter` throws an invariant violation on iOS if the native module isn't linked — a top-level import would have crashed the **entire app** on iOS (Expo Go and a real device both) the instant this file loaded, not just when Payment was opened. Caught and fixed by reading React Native's `NativeEventEmitter` source directly, not by running it. Confirmed via source inspection that `react-native-webview` and `react-native-purchases` are both safe to import in Expo Go on Android (webview is an Expo-supported module; purchases guards its own `NativeEventEmitter` construction) — so **Expo Go on Android should work for testing Phases 1–3 and the feed**, just not an actual Razorpay payment.
   - **iOS (RevenueCat):** `lib/payments/revenuecat.ts` configures the SDK and drives the purchase sheet, but there is **no RevenueCat project, no App Store Connect subscription product, and no `EXPO_PUBLIC_REVENUECAT_IOS_KEY`** — these are business/console setup only a human with the right accounts can do (Phase 0 flagged this as the longest lead-time item; it still hasn't been started). Until then this path fails gracefully (`isRevenueCatConfigured()` returns false) rather than crashing.
   - **New migration `0015_revenuecat_payments.sql`** (in `reelsparks/supabase/migrations`, **not applied**): adds a `confirm_revenuecat_payment` RPC and extracts the referral-crediting block out of the *already-live* `confirm_razorpay_payment` into a shared `credit_referrer_bonus()` function, called mechanically (verbatim logic moved, not rewritten) to minimize behavioral drift on a production RPC real money flows through. **This has not been run against any database, staging or otherwise — it needs careful review before `supabase db push`,** not a rubber stamp, because a mistake here risks the referral bonus path on a live financial function.
   - **New Edge Function `revenuecat-webhook`** (in `reelsparks/supabase/functions`, **not deployed**): verifies RevenueCat's static bearer-token auth, then calls `confirm_revenuecat_payment`. Needs `supabase functions deploy` + a `REVENUECAT_WEBHOOK_AUTH` secret + the RevenueCat dashboard's webhook URL configured to point at it — none of which happened here (no CLI/credentials in this environment).
5. **Referral wallet + Likes/Comments** — ✅ done. `ReferralWalletScreen` + `useReferralWallet` ported (balance, withdraw form, transaction ledger). `CommentsSheet`/`useComments` were actually ported earlier, in Phase 2, since the Feed screen needed them to open comments on a reel — nothing left to do here.
6. **Push notifications** — ⚠️ **client-side code complete; the delivery half doesn't exist.** `lib/pushNotifications.ts` requests permission, gets an Expo push token, and registers it via a new `register_push_token` RPC — called from `App.tsx`'s `AppGate` on login. **New migration `0014_device_push_tokens.sql`** (in `reelsparks/supabase/migrations`, **not applied**) adds the table + RPC. What's explicitly **not built**: the server-side trigger/Edge Function that actually calls Expo's push API when a video is moderated or a referral bonus is credited, and any syncing of `useNotificationPrefs`' on-device toggles to something the server can check before sending (right now those prefs are purely local, same as the web build — a real send pipeline would need to read them from somewhere server-reachable, which doesn't exist yet). Building that safely needs its own design pass, not a freehand addition alongside everything else in this session.
7. **Store submission prep** — **not started, and not something I can do.** App Store + Play Store listings, privacy/data-safety questionnaires, screenshots (need a running app on a real device), and the actual submission through App Store Connect / Google Play Console all require business accounts and console access that only you have. Nothing to report here beyond: this phase is real work, still fully ahead.

### Critical files (first ones to create, all under this repo unless noted)
- `app.config.ts` — Expo config, env wiring
- ~~`src/lib/supabase.ts`~~ — done
- ~~`src/navigation/RootNavigator.tsx`~~ — done
- ~~`src/components/VideoPlayer.tsx`~~ — WebView rewrite done (the highest-risk file in the whole port) — code complete, unverified on-device (see Verification #2)
- ~~`src/lib/payments/razorpay.ts`~~ — `react-native-razorpay` wrapper done — code complete, blocked on a dev/EAS build to exercise it (not runnable in Expo Go)
- ~~`src/lib/payments/revenuecat.ts`~~ — iOS IAP wrapper done — code complete, blocked on a RevenueCat account + App Store Connect product (neither exists)
- `D:\project\reelspark\reelsparks\supabase\functions\revenuecat-webhook\index.ts` — ✅ written, **not deployed** (no CLI/credentials available in this environment — see §9 Phase 4)

## Verification

1. After Phase 0: app builds and runs on a real iOS + Android device via EAS dev build, auth screens load against the live Supabase project. *(Partial: it currently runs via `npx expo start`/`npx expo export` — verified to typecheck, pass `expo-doctor`, and bundle clean — but has not been run on a physical device or through an EAS build; full check pending EAS project setup.)*
2. After Phase 2: on-device confirmation that both the YouTube and Instagram embed tricks hold up outside desktop Chrome — this gates whether §8's WebView risks need a fallback design before continuing. **Not done.** The code in `VideoPlayer.tsx` is written and bundles clean, but nobody has tapped play on a real iOS or Android device yet — the Instagram crop constants (`INSTAGRAM_SCALE` etc.) and the YouTube muted-autoplay-then-unmute flow are carried over as literal values from a web build that only ever ran in desktop/mobile Chrome. This step is still open and is the actual gate the plan describes, not paperwork.
3. After Phase 4: a real Razorpay test payment (Android) and a real Apple sandbox IAP purchase (iOS) both land in `profiles.payment_status='approved'` and unlock `SubmitScreen` identically. **Not done, and can't be done from a coding session alone** — needs (a) a dev/EAS build for the Razorpay native SDK, (b) `0015_revenuecat_payments.sql` reviewed and applied, (c) `revenuecat-webhook` deployed with its secret, (d) a real RevenueCat project + App Store Connect subscription product, and (e) real Razorpay test keys. None of the five exist yet.
4. Before Phase 7: run the built app against Apple's and Google's current UGC/review guidelines directly (not just this plan), since policy specifics shift.
5. Before Phase 4 is "done": `0014_device_push_tokens.sql` and `0015_revenuecat_payments.sql` need `supabase db push` (or equivalent) against the real project, and `revenuecat-webhook` needs `supabase functions deploy` — all three are currently just files sitting in `reelsparks/supabase/` unapplied.
