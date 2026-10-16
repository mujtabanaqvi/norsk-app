import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface DeriveApiUrlOptions {
  envUrl?: string;
  platformOs?: string;
  expoHostUri?: string | null;
  webHostname?: string | null;
}

/**
 * Pure helper to derive the Next.js control plane base URL across:
 * - Web browser (uses window.location.hostname:3000)
 * - Physical phone in Expo Go (uses Constants.expoConfig.hostUri LAN IP:3000)
 * - Android emulator (uses 10.0.2.2:3000 when host is localhost/loopback)
 * - iOS simulator (uses localhost:3000)
 */
export function deriveApiBaseUrl(opts: DeriveApiUrlOptions = {}): string {
  const envUrl = opts.envUrl?.trim();
  const platformOs = opts.platformOs ?? Platform.OS;
  const hostUri = opts.expoHostUri ?? Constants.expoConfig?.hostUri ?? null;
  const webHost =
    opts.webHostname ??
    (typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : null);

  const hostFromExpo = hostUri ? hostUri.split(':')[0].trim() : '';
  const isLanHost =
    Boolean(hostFromExpo) &&
    hostFromExpo !== 'localhost' &&
    hostFromExpo !== '127.0.0.1' &&
    hostFromExpo !== '10.0.2.2';

  // If an explicit non-default env URL is set, respect it — EXCEPT when running on a physical LAN
  // device via Expo Go where a stale localhost / 10.0.2.2 env var would break connectivity.
  if (envUrl) {
    const cleaned = envUrl.replace(/\/+$/, '');
    const isEmulatorLoopback =
      cleaned.includes('10.0.2.2') ||
      cleaned.includes('localhost') ||
      cleaned.includes('127.0.0.1');
    if (!(isLanHost && isEmulatorLoopback)) {
      return cleaned;
    }
  }

  if (platformOs === 'web') {
    const hostname = webHost || 'localhost';
    return `http://${hostname}:3000`;
  }

  if (isLanHost) {
    return `http://${hostFromExpo}:3000`;
  }

  if (platformOs === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export const API_BASE_URL: string = deriveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL || process.env.REACT_NATIVE_API_URL,
});

