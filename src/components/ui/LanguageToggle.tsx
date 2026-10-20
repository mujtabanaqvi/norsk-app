import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';
import { useLocale } from '../../hooks/useLocale';
import type { Locale } from '../../i18n';

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: 'nb', label: 'NO' },
  { locale: 'en', label: 'EN' },
];

/** Compact NO | EN switch for the app's UI language. */
export const LanguageToggle: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => {
  const { locale, setLocale, t } = useLocale();

  return (
    <View style={[styles.pill, style]} accessibilityRole="radiogroup" accessibilityLabel={t('common.language')}>
      {OPTIONS.map((option) => {
        const selected = option.locale === locale;
        return (
          <Pressable
            key={option.locale}
            onPress={() => setLocale(option.locale)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(option.locale === 'nb' ? 'common.switchToNb' : 'common.switchToEn')}
            hitSlop={4}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  option: {
    height: '100%',
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.navy,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.navy,
  },
  labelSelected: {
    color: colors.white,
  },
});
