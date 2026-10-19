import React from 'react';
import { Image, View, Text, StyleSheet, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { colors } from '../../theme';

const LOGO = require('../../../assets/brand/snakkly-icon-192.png');

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
  size?: number;
  /** Show the "Snakkly" wordmark next to the mark. */
  withWordmark?: boolean;
  /** Primary wordmark color for "Snakk" (defaults to navy). */
  wordmarkColor?: string;
  /** Accent color for "ly" (defaults to red). */
  accentColor?: string;
  style?: ViewStyle;
}

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  withWordmark = false,
  wordmarkColor = colors.navy,
  accentColor = colors.red,
  style,
}) => (
  <View style={[styles.row, style]}>
    <Image
      source={LOGO}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Snakkly"
    />
    {withWordmark && (
      <BrandText
        snakkColor={wordmarkColor}
        lyColor={accentColor}
        style={[
          styles.wordmark,
          { fontSize: Math.round(size * 0.64) },
        ]}
      />
    )}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontWeight: '800', letterSpacing: -0.6 },
  brandInline: { fontWeight: '700' },
});
