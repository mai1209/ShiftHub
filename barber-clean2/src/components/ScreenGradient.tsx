import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

function BrownScreenGradient() {
  const { theme } = useTheme();
  const [c0, c1, c2, c3] = theme.gradientColors;
  const base = c0 ?? theme.background;
  const isLight = theme.mode === 'light';

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.base, { backgroundColor: base }]}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <LinearGradient id="brown-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c0} />
            <Stop offset="35%" stopColor={c1 ?? c0} />
            <Stop offset="70%" stopColor={c2 ?? c1 ?? c0} />
            <Stop offset="100%" stopColor={c3 ?? c2 ?? c0} />
          </LinearGradient>
        </Defs>

        <Rect width="100%" height="100%" fill="url(#brown-gradient)" />

        {/* Glow superior */}
        <Ellipse
          cx="82%"
          cy="14%"
          rx="160"
          ry="150"
          fill={isLight ? '#FFFFFF' : '#7A2A1A'}
          opacity={isLight ? '0.35' : '0.16'}
        />

        {/* Glow inferior */}
        <Ellipse
          cx="18%"
          cy="84%"
          rx="230"
          ry="200"
          fill={isLight ? '#CBD5E1' : '#4D190E'}
          opacity={isLight ? '0.28' : '0.18'}
        />

        {/* Sombra central */}
        <Ellipse
          cx="50%"
          cy="50%"
          rx="320"
          ry="240"
          fill={isLight ? '#94A3B8' : '#000000'}
          opacity={isLight ? '0.18' : '0.4'}
        />
      </Svg>
    </View>
  );
}

export default BrownScreenGradient;

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#F8FAFC',
  },
});
