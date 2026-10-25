/**
 * Snakkly design tokens.
 * Brand colors are taken directly from the Snakkly logo (Norwegian flag palette: #BA0C2F, #00205B, #FFFFFF).
 */
import type { TextStyle } from 'react-native';

export const colors = {
  // Brand
  red: '#BA0C2F',
  redPressed: '#960A26',
  redSoft: '#FCEBEE',
  navy: '#00205B',
  navyLight: '#1B3A78',
  navySoft: '#E9EDF5',
  white: '#FFFFFF',
  gold: '#C98A00',
  goldSoft: '#FFF5DB',

  // Surfaces
  bg: '#FFFDFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2F7',
  border: '#E3E7EF',
  borderStrong: '#CDD3DF',

  // Text
  text: '#00205B',
  textSecondary: '#55627D',
  textMuted: '#8B95A9',
  textOnBrand: '#FFFFFF',

  // Semantic
  success: '#0F7B5A',
  successSoft: '#E6F4EF',
  warning: '#B86E00',
  warningSoft: '#FFF4E0',
  danger: '#BA0C2F',
  dangerSoft: '#FCEBEE',

  overlay: 'rgba(0, 32, 91, 0.45)',
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, fontWeight: '500', lineHeight: 22, color: colors.textSecondary },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 22, color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18, color: colors.textMuted },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  /** Used sparingly: primary CTA and the mic button only. */
  raised: {
    shadowColor: colors.navy,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

export type TierName = 'FREE' | 'STANDARD' | 'PREMIUM' | string;

/** Tier badge palette: FREE = grey outline, STANDARD = navy, PREMIUM = gold. */
export function tierColors(tier: TierName): { bg: string; fg: string; border: string } {
  switch (tier) {
    case 'PREMIUM':
      return { bg: colors.gold, fg: colors.white, border: colors.gold };
    case 'STANDARD':
      return { bg: colors.navy, fg: colors.white, border: colors.navy };
    default:
      return { bg: colors.surface, fg: colors.textSecondary, border: colors.borderStrong };
  }
}

