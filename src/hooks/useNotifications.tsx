import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from './useAuth';
import {
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type UserNotificationItem,
} from '../api';
import { requestNotificationPermission } from '../lib/notification-permissions';

interface NotificationsContextType {
  notifications: UserNotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isFetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await fetchUserNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      // Background refresh failures can fail silently
      console.warn('[useNotifications] refresh failed:', err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [user]);

  // Initial fetch and user changes
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    refresh();
    requestNotificationPermission().catch(() => {});
  }, [user, refresh]);

  // Refresh whenever app returns to foreground
  useEffect(() => {
    if (!user) return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refresh();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [user, refresh]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationRead(id);
    } catch (err) {
      console.warn('[useNotifications] markAsRead failed:', err);
      // Re-sync on failure
      refresh();
    }
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.warn('[useNotifications] markAllAsRead failed:', err);
      refresh();
    }
  }, [refresh]);

  const removeNotification = useCallback(async (id: string) => {
    const item = notifications.find((n) => n.id === id);
    const wasUnread = item && !item.isRead;

    // Optimistic update
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await deleteNotification(id);
    } catch (err) {
      console.warn('[useNotifications] removeNotification failed:', err);
      refresh();
    }
  }, [notifications, refresh]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        refresh,
        markAsRead,
        markAllAsRead,
        removeNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export function useNotifications(): NotificationsContextType {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}

