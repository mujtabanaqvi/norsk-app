import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, tierColors } from '../../theme';
import { Icon, type IconName } from './Icon';

export type BadgeTone = 'red' | 'navy' | 'neutral' | 'success' | 'warning' | 'gold' | 'solidRed' | 'solidNavy';

const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  red: { bg: colors.redSoft, fg: colors.red, border: colors.redSoft },
  navy: { bg: colors.navySoft, fg: colors.navy, border: colors.navySoft },
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, border: colors.surfaceMuted },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningSoft },
  gold: { bg: colors.goldSoft, fg: colors.gold, border: colors.goldSoft },
  solidRed: { bg: colors.red, fg: colors.white, border: colors.red },
  solidNavy: { bg: colors.navy, fg: colors.white, border: colors.navy },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({ label, tone = 'navy', icon, style }) => {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      {icon && <Icon name={icon} size={12} color={t.fg} />}
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
};

/** Subscription tier pill: FREE = grey outline, STANDARD = navy, PREMIUM = gold. */
export const TierBadge: React.FC<{ tier: string; style?: StyleProp<ViewStyle> }> = ({ tier, style }) => {
  const t = tierColors(tier);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      {tier === 'PREMIUM' && <Icon name="star" size={11} color={t.fg} />}
      <Text style={[styles.text, { color: t.fg }]}>{tier}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
});

