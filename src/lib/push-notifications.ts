import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerPushTokenApi, unregisterPushTokenApi } from '../api';

// Configure how notifications appear when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedPushToken: string | null = null;

/**
 * Ensures the default high-importance notification channel is configured on Android.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Snakkly Varsler',
      description: 'Varsler for daglige taleminutter, påminnelser og kunngjøringer',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#BA0C2F',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  }
}

/**
 * Requests permission, obtains the device's Expo push token, and registers it with the backend.
 */
export async function registerDevicePushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return null;
    }

    // Set up Android notification channel
    await setupNotificationChannel();

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Notification permission not granted:', finalStatus);
      return null;
    }

    // Get Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? 'd5e390c5-69b7-4798-b01d-15b3ecb57aab';

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    if (!token) {
      console.warn('[Push] Empty push token received from Expo');
      return null;
    }

    cachedPushToken = token;
    console.log('[Push] Successfully obtained Expo push token:', token);

    // Register token with backend
    await registerPushTokenApi(token, Platform.OS);
    return token;
  } catch (error) {
    console.warn('[Push] Error registering device push token:', error);
    return null;
  }
}

/**
 * Unregisters the push token from the backend.
 */
export async function unregisterDevicePushToken(): Promise<void> {
  try {
    if (cachedPushToken) {
      await unregisterPushTokenApi(cachedPushToken);
      cachedPushToken = null;
    }
  } catch (error) {
    console.warn('[Push] Error unregistering device push token:', error);
  }
}

/**
 * Subscribes to notification responses (e.g. user tapping a notification banner).
 */
export function subscribeToNotificationResponse(
  onNavigate: (actionRoute: string, data?: Record<string, unknown>) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const actionRoute = data?.actionRoute;
      if (typeof actionRoute === 'string' && actionRoute.trim()) {
        onNavigate(actionRoute.trim(), data);
      }
    } catch (e) {
      console.warn('[Push] Error processing notification tap response:', e);
    }
  });

  return () => {
    subscription.remove();
  };
}
