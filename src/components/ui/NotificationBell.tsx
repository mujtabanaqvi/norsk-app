import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotifications } from '../../hooks/useNotifications';
import { colors, space, type } from '../../theme';
import { Icon } from './Icon';

interface NotificationBellProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onPress,
  accessibilityLabel = 'Varsler',
}) => {
  const { unreadCount } = useNotifications();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Icon
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={22}
        color={unreadCount > 0 ? colors.navy : colors.textSecondary}
      />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  btnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: {
    ...type.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 12,
  },
});

