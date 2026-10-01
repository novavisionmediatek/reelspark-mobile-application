import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/tokens';

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Defs>
        <SvgLinearGradient id="logoGrad" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.orange} />
          <Stop offset="0.5" stopColor={colors.pink} />
          <Stop offset="1" stopColor={colors.purple} />
        </SvgLinearGradient>
      </Defs>
      <Rect x="2" y="2" width="36" height="36" rx="11" stroke="url(#logoGrad)" strokeWidth="2.6" />
      <Path d="M16.5 14.5L26 20L16.5 25.5V14.5Z" fill="url(#logoGrad)" />
    </Svg>
  );
}
