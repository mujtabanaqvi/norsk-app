import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, type } from '../../theme';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useLocale } from '../../hooks/useLocale';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  /** Show the Snakkly logo mark before the title. */
  showLogo?: boolean;
  right?: React.ReactNode;
  /** Draw a hairline below the header. */
  bordered?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  onBack,
  showLogo = false,
  right,
  bordered = false,
}) => {
  const { t } = useLocale();
  return (
    <View style={[styles.header, bordered && styles.bordered]}>
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Icon name="chevron-back" size={22} color={colors.navy} />
        </Pressable>
      )}
      {showLogo && <Logo size={30} />}
      <View style={styles.titles}>
        {!!title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 60,
    backgroundColor: colors.bg,
  },
  bordered: { borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnPressed: { backgroundColor: colors.surfaceMuted },
  titles: { flex: 1 },
  title: { ...type.heading, fontSize: 18 },
  subtitle: { ...type.caption, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

