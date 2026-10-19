import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { colors } from '../../theme';

interface WaveformProps {
  /** Animate the bars (e.g. while speaking/recording). */
  active?: boolean;
  /** Bar color for the outer bars. */
  color?: string;
  /** Color of the emphasized center bar (navy in the logo). */
  accentColor?: string;
  height?: number;
  barWidth?: number;
  bars?: number;
}

/** Logo-inspired equalizer: rounded bars with an emphasized center bar. */
export const Waveform: React.FC<WaveformProps> = ({
  active = true,
  color = colors.white,
  accentColor = colors.navy,
  height = 32,
  barWidth = 5,
  bars = 5,
}) => {
  const anims = useRef(Array.from({ length: bars }, () => new Animated.Value(0.4))).current;
  // Resting profile mirrors the logo: short, tall, tallest, tall, short
  const center = Math.floor(bars / 2);
  const rest = anims.map((_, i) => 1 - (Math.abs(i - center) / (center + 1)) * 0.7);

  useEffect(() => {
    if (!active) {
      anims.forEach((a, i) => a.setValue(rest[i]));
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, {
            toValue: 1,
            duration: 320 + i * 70,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(a, {
            toValue: 0.3,
            duration: 320 + i * 70,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View style={[styles.row, { height, gap: barWidth * 0.8 }]}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: barWidth,
            height,
            borderRadius: barWidth / 2,
            backgroundColor: i === center ? accentColor : color,
            transform: [{ scaleY: a }],
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});

