import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import {
  referralCodeFromClipboardMarker,
  referralCodeFromInstallReferrer,
  referralCodeFromUrl,
} from './referral-link';

/**
 * A referral code captured from a link, the Play install referrer or the iOS clipboard, kept until the
 * user registers so it survives app restarts between install and sign-up.
 */

const CODE_KEY = 'snakkly_pending_referral_code';
const FIRST_LAUNCH_KEY = 'snakkly_referral_first_launch_checked';

type Listener = (code: string | null) => void;

let current: string | null = null;
let loaded = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

async function set(code: string) {
  current = code;
  loaded = true;
  emit();
  await AsyncStorage.setItem(CODE_KEY, code).catch(() => {});
}

export async function getPendingReferral(): Promise<string | null> {
  if (!loaded) {
    current = (await AsyncStorage.getItem(CODE_KEY).catch(() => null)) ?? current;
    loaded = true;
  }
  return current;
}

export async function clearPendingReferral(): Promise<void> {
  current = null;
  loaded = true;
  emit();
  await AsyncStorage.removeItem(CODE_KEY).catch(() => {});
}

export function subscribePendingReferral(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns the code if the URL is a referral link (Universal/App Link or `snakkly://r/CODE`). */
export async function captureReferralFromUrl(url: string | null | undefined): Promise<string | null> {
  const code = referralCodeFromUrl(url);
  if (code) await set(code);
  return code;
}

/**
 * Once per install, recover the code of a link tapped before the app was installed:
 * Android via the Play install referrer, iOS via the clipboard text the landing page copied.
 */
export async function captureReferralOnFirstLaunch(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (await AsyncStorage.getItem(FIRST_LAUNCH_KEY).catch(() => null)) return null;
  await AsyncStorage.setItem(FIRST_LAUNCH_KEY, '1').catch(() => {});

  let code: string | null = null;
  try {
    if (Platform.OS === 'android') {
      code = referralCodeFromInstallReferrer(await Application.getInstallReferrerAsync());
    } else if (Platform.OS === 'ios' && (await Clipboard.hasStringAsync())) {
      // Reading shows iOS's one-time "Allow Paste" prompt, so only read when there is text at all.
      code = referralCodeFromClipboardMarker(await Clipboard.getStringAsync());
    }
  } catch (err) {
    console.warn('Referral first-launch check failed:', err);
  }
  if (code) await set(code);
  return code;
}
