// "Indigo Pulse" — see PROJECT_PLAN.md §1a. Dark near-black indigo canvas + a
// periwinkle-to-midnight gradient accent; replaced "Emerald Signal" (green)
// after a color-direction review — blue-violet carries the same "trustworthy
// for a paid product" meaning green did, while reading more premium/social.
// `fonts`/`type`/`radius`/`spacing` are unaffected by the palette change.

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
  danger: '#F2545B', // kept off-brand on purpose — error states need a universal red, not the accent hue
  pending: '#3730A3',
} as const;

export const gradient = {
  brand: [colors.periwinkle, colors.indigo, colors.violet, colors.deepIndigo, colors.midnight] as const,
  brandLocations: [0, 0.25, 0.48, 0.7, 1] as const,
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const fonts = {
  display: 'Unbounded_700Bold',
  displaySemibold: 'Unbounded_600SemiBold',
  displayMedium: 'Unbounded_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40 },
  h1: { fontFamily: fonts.displaySemibold, fontSize: 26, lineHeight: 34 },
  h2: { fontFamily: fonts.displaySemibold, fontSize: 22, lineHeight: 30 },
  h3: { fontFamily: fonts.displaySemibold, fontSize: 18, lineHeight: 26 },
  bodyLarge: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 16 },
} as const;
