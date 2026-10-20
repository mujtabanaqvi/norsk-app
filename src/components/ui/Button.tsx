import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow } from '../../theme';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Custom leading element (e.g. a multicolour brand mark) rendered instead of `icon`. */
  leading?: React.ReactNode;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const VARIANTS: Record<ButtonVariant, { bg: string; bgPressed: string; fg: string; border: string }> = {
  primary: { bg: colors.red, bgPressed: colors.redPressed, fg: colors.white, border: colors.red },
  secondary: { bg: colors.navy, bgPressed: colors.navyLight, fg: colors.white, border: colors.navy },
  outline: { bg: colors.surface, bgPressed: colors.surfaceMuted, fg: colors.navy, border: colors.borderStrong },
  ghost: { bg: 'transparent', bgPressed: colors.navySoft, fg: colors.navy, border: 'transparent' },
  gold: { bg: colors.gold, bgPressed: colors.warning, fg: colors.white, border: colors.gold },
};

const SIZES: Record<ButtonSize, { h: number; px: number; font: number; icon: number }> = {
  sm: { h: 36, px: 14, font: 13, icon: 16 },
  md: { h: 46, px: 18, font: 15, icon: 18 },
  lg: { h: 56, px: 24, font: 16, icon: 20 },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  leading,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}) => {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          backgroundColor: pressed ? v.bgPressed : v.bg,
          borderColor: v.border,
        },
        variant === 'primary' && size === 'lg' && !isDisabled ? shadow.raised : null,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={styles.content}>
          {leading ?? (icon && <Icon name={icon} size={s.icon} color={v.fg} />)}
          <Text style={[styles.label, { color: v.fg, fontSize: s.font }]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Icon name={iconRight} size={s.icon} color={v.fg} />}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700', letterSpacing: -0.1 },
  disabled: { opacity: 0.45 },
});

