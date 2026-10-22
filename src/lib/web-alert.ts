import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * react-native-web ships `Alert.alert` as an empty function, so every error and confirmation shown with it
 * silently disappears in the browser. This maps it onto the browser's own dialogs:
 * - one button (or none): `window.alert`, then that button's onPress
 * - two or more: `window.confirm`; OK runs the first non-cancel button, Cancel runs the cancel button
 * Call once at startup.
 */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancel = buttons.find((b) => b.style === 'cancel');
    const confirm = buttons.find((b) => b !== cancel) ?? buttons[0];
    if (window.confirm(text)) confirm.onPress?.();
    else cancel?.onPress?.();
  };
}
