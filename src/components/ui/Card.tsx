import React from 'react';
import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Minimal white surface with a hairline border. Becomes pressable when `onPress` is set. */
export const Card: React.FC<CardProps> = ({
  children,
  selected = false,
  onPress,
  disabled,
  padded = true,
  style,
  accessibilityLabel,
}) => {
  const base = [styles.card, padded && styles.padded, selected && styles.selected, style];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...base, pressed && !selected && styles.pressed]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: space.lg },
  selected: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    borderWidth: 1.5,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
});

