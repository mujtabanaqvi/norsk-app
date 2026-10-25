import React from 'react';
import { Image, View, Text, StyleSheet, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { colors } from '../../theme';

const LOGO = require('../../../assets/brand/snakkly-icon-192.png');
// Full "mark + Snakkly" lockups: light for light surfaces, dark (navy background) for dark surfaces.
const WORDMARK = {
  light: { source: require('../../../assets/brand/snakkly-wordmark-light.png'), aspectRatio: 885 / 268 },
  dark: { source: require('../../../assets/brand/snakkly-wordmark-dark.png'), aspectRatio: 925 / 308 },
} as const;

interface BrandTextProps {
  style?: StyleProp<TextStyle>;
  snakkColor?: string;
  lyColor?: string;
}

/** Renders "Snakkly" with "Snakk" in navy and "ly" in red. */
export const BrandText: React.FC<BrandTextProps> = ({
  style,
  snakkColor = colors.navy,
  lyColor = colors.red,
}) => (
  <Text style={[styles.brandInline, style]}>
    <Text style={{ color: snakkColor }}>Snakk</Text>
    <Text style={{ color: lyColor }}>ly</Text>
  </Text>
);

interface LogoProps {
  /** Height of the logo in points. */
  size?: number;
  /** Show the full "Snakkly" lockup (mark + name) instead of the mark alone. */
  withWordmark?: boolean;
  /** Lockup for light surfaces (default) or dark/navy surfaces. Only applies with `withWordmark`. */
  variant?: 'light' | 'dark';
  style?: ViewStyle;
}

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  withWordmark = false,
  variant = 'light',
  style,
}) => {
  if (withWordmark) {
    const { source, aspectRatio } = WORDMARK[variant];
    return (
      <View style={[styles.row, style]}>
        <Image
          source={source}
          style={{ height: size, width: Math.round(size * aspectRatio) }}
          resizeMode="contain"
          accessibilityLabel="Snakkly"
        />
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      <Image
        source={LOGO}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Snakkly"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  brandInline: { fontWeight: '700' },
});
