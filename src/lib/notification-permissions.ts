import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Requests notification permission from the operating system (Android 13+ / iOS).
 * Returns true if granted or if the OS version does not require runtime permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ (API level 33+) requires runtime permission for POST_NOTIFICATIONS
    if (Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('[NotificationPermissions] Request failed:', err);
        return false;
      }
    }
    return true;
  }
  return true;
}

/**
 * Checks whether notification permission is currently granted.
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      try {
        return await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      } catch (err) {
        console.warn('[NotificationPermissions] Check failed:', err);
        return false;
      }
    }
    return true;
  }
  return true;
}

