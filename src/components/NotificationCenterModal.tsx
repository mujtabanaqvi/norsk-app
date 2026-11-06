import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../hooks/useNotifications';
import { useLocale } from '../hooks/useLocale';
import { Icon, type IconName } from './ui';
import { colors, radius, shadow, space, type } from '../theme';
import type { UserNotificationItem } from '../api';
import {
  checkNotificationPermission,
  requestNotificationPermission,
} from '../lib/notification-permissions';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}

function getCategoryConfig(type: string): { icon: IconName; color: string; bg: string } {
  switch (type) {
    case 'DAILY_CREDITS':
      return { icon: 'flash', color: colors.gold, bg: colors.goldSoft };
    case 'PRACTICE_REMINDER':
      return { icon: 'flame', color: colors.red, bg: colors.redSoft };
    case 'PROMOTION':
      return { icon: 'star', color: colors.gold, bg: colors.goldSoft };
    case 'SYSTEM':
      return { icon: 'information-circle', color: colors.navy, bg: colors.navySoft };
    case 'ANNOUNCEMENT':
    default:
      return { icon: 'megaphone', color: colors.navy, bg: colors.navySoft };
  }
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  visible,
  onClose,
  onNavigate,
}) => {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, removeNotification } =
    useNotifications();
  const { t, locale } = useLocale();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [hasDevicePermission, setHasDevicePermission] = useState<boolean>(true);

  // Check device notification permission when modal opens
  useEffect(() => {
    if (visible) {
      checkNotificationPermission().then(setHasDevicePermission);
    }
  }, [visible]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setHasDevicePermission(granted);
  };

  const filteredItems = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  const formatRelativeTime = (isoString?: string | null): string => {
    if (!isoString) return '';
    try {
      const then = new Date(isoString).getTime();
      if (isNaN(then)) return '';
      const diffMs = Math.max(0, Date.now() - then);
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return t('notifications.justNow');
      if (diffMins < 60) return t('notifications.minutesAgo', { minutes: diffMins });
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return t('notifications.hoursAgo', { hours: diffHours });
      const diffDays = Math.floor(diffHours / 24);
      return t('notifications.daysAgo', { days: diffDays });
    } catch {
      return '';
    }
  };

  const handleCardPress = (item: UserNotificationItem) => {
    if (!item.isRead) {
      markAsRead(item.id);
    }
    if (item.actionRoute && onNavigate) {
      onClose();
      onNavigate(item.actionRoute);
    }
  };

  const getActionLabel = (route: string): string => {
    switch (route) {
      case 'ExamSetup':
        return t('notifications.actionPractice');
      case 'Subscription':
        return t('notifications.actionUpgrade');
      default:
        return t('notifications.actionGo');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, space.md),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t('notifications.title')}</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <Pressable
                  onPress={markAllAsRead}
                  hitSlop={8}
                  style={({ pressed }) => [styles.markAllBtn, pressed && styles.pressedOpacity]}
                >
                  <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.pressedOpacity]}
              >
                <Icon name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* System notification permission banner if blocked on device */}
          {!hasDevicePermission && (
            <View style={styles.permissionBanner}>
              <View style={styles.permissionBannerIcon}>
                <Icon name="notifications-outline" size={18} color={colors.navy} />
              </View>
              <View style={styles.permissionBannerText}>
                <Text style={styles.permissionBannerTitle}>
                  {t('notifications.permissionBannerTitle')}
                </Text>
                <Text style={styles.permissionBannerBody}>
                  {t('notifications.permissionBannerBody')}
                </Text>
              </View>
              <Pressable
                onPress={handleRequestPermission}
                style={({ pressed }) => [
                  styles.permissionBannerBtn,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text style={styles.permissionBannerBtnText}>
                  {t('notifications.enableNotifications')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Filter Segment */}
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setFilter('all')}
              style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
                {t('notifications.all')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFilter('unread')}
              style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
                {t('notifications.unread')} {unreadCount > 0 ? `(${unreadCount})` : ''}
              </Text>
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading && notifications.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.red} />
              </View>
            ) : filteredItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="notifications-off-outline" size={32} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>{t('notifications.emptyTitle')}</Text>
                <Text style={styles.emptyBody}>
                  {filter === 'unread'
                    ? t('notifications.emptyUnreadBody')
                    : t('notifications.emptyBody')}
                </Text>
              </View>
            ) : (
              filteredItems.map((item) => {
                const cfg = getCategoryConfig(item.type);
                const title =
                  (locale === 'en' && item.titleEn ? item.titleEn : item.titleNo) ||
                  item.titleNo ||
                  '';
                const message =
                  (locale === 'en' && item.messageEn ? item.messageEn : item.messageNo) ||
                  item.messageNo ||
                  '';

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleCardPress(item)}
                    style={({ pressed }) => [
                      styles.card,
                      !item.isRead && styles.cardUnread,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <View style={[styles.cardIconWrap, { backgroundColor: cfg.bg }]}>
                      <Icon name={cfg.icon} size={18} color={cfg.color} />
                    </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>
                          {title}
                        </Text>
                        <Text style={styles.cardTime}>{formatRelativeTime(item.createdAt)}</Text>
                      </View>

                      <Text style={styles.cardMessage}>{message}</Text>

                      <View style={styles.cardFooter}>
                        {item.actionRoute ? (
                          <View style={styles.actionBtn}>
                            <Text style={styles.actionBtnText}>{getActionLabel(item.actionRoute)}</Text>
                            <Icon name="arrow-forward" size={14} color={colors.red} />
                          </View>
                        ) : (
                          <View />
                        )}

                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            removeNotification(item.id);
                          }}
                          hitSlop={8}
                          accessibilityLabel={t('notifications.deleteNotification')}
                          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressedOpacity]}
                        >
                          <Icon name="trash-outline" size={15} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    </View>

                    {!item.isRead && <View style={styles.unreadDot} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    height: Platform.OS === 'web' ? '80%' : '72%',
    minHeight: 380,
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
    ...shadow.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  title: {
    ...type.heading,
    fontSize: 20,
    color: colors.text,
  },
  unreadPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.redSoft,
  },
  unreadPillText: {
    ...type.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.red,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  markAllText: {
    ...type.caption,
    fontSize: 12,
    color: colors.navy,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.sm,
    gap: space.sm,
  },
  permissionBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBannerText: {
    flex: 1,
  },
  permissionBannerTitle: {
    ...type.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  permissionBannerBody: {
    ...type.caption,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 1,
  },
  permissionBannerBtn: {
    backgroundColor: colors.navy,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  permissionBannerBtnText: {
    ...type.caption,
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: space.md,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  filterTabActive: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabText: {
    ...type.caption,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    gap: space.sm,
    paddingBottom: space.xl,
    flexGrow: 1,
  },
  loadingWrap: {
    flex: 1,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: {
    ...type.heading,
    fontSize: 16,
    color: colors.text,
  },
  emptyBody: {
    ...type.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  cardUnread: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: 4,
  },
  cardTitle: {
    ...type.heading,
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  cardTitleUnread: {
    color: colors.text,
    fontWeight: '700',
  },
  cardTime: {
    ...type.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  cardMessage: {
    ...type.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: space.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xxs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnText: {
    ...type.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.red,
  },
  deleteBtn: {
    padding: 4,
  },
  unreadDot: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.red,
  },
});
