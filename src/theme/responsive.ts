import { useWindowDimensions } from 'react-native';

// Width breakpoints (px), ported from the web app. Tablet/desktop tiers mostly
// matter on iPad here — there's no browser window to resize on a phone.
export const BREAKPOINTS = {
  tablet: 768,
  sidebar: 1000,
  desktop: 1024,
  wide: 1440,
} as const;

export interface Responsive {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  /** tablet or larger */
  atLeastTablet: boolean;
  /** columns for card grids (My Videos) */
  gridColumns: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isWide = width >= BREAKPOINTS.wide;

  return {
    width,
    height,
    isPhone: width < BREAKPOINTS.tablet,
    isTablet,
    isDesktop,
    isWide,
    atLeastTablet: width >= BREAKPOINTS.tablet,
    gridColumns: isWide ? 4 : isDesktop ? 3 : isTablet ? 2 : 1,
  };
}
