import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

export interface DeriveApiUrlOptions {
  envUrl?: string;
  platformOs?: string;
  expoHostUri?: string | null;
  webHostname?: string | null;
}

/**
 * Extract a clean hostname or IPv4 address from an Expo/Metro URI
 * such as "192.168.1.182:8081", "exp://192.168.1.182:8081/--/", or
 * "http://192.168.1.182:8081/index.bundle?platform=android".
 */
export function extractHostnameFromUri(rawUri?: string | null): string {
  if (!rawUri) return '';
  const trimmed = rawUri.trim();
  if (!trimmed) return '';
  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const authority = withoutScheme.split('/')[0]?.split('?')[0] ?? '';
  const host = authority.split(':')[0]?.trim() ?? '';
  return host;
}

function detectRuntimeExpoHostUri(): string | null {
  const anyConstants = Constants as unknown as {
    expoConfig?: { hostUri?: string | null } | null;
    expoGoConfig?: { debuggerHost?: string | null } | null;
    manifest2?: {
      extra?: {
        expoGo?: { debuggerHost?: string | null };
        expoClient?: { hostUri?: string | null };
      };
    } | null;
    experienceUrl?: string | null;
    linkingUri?: string | null;
  };

  const scriptURL: string | undefined = (
    NativeModules as { SourceCode?: { scriptURL?: string } } | undefined
  )?.SourceCode?.scriptURL;

  const candidates = [
    anyConstants.expoConfig?.hostUri,
    anyConstants.expoGoConfig?.debuggerHost,
    anyConstants.manifest2?.extra?.expoGo?.debuggerHost,
    anyConstants.manifest2?.extra?.expoClient?.hostUri,
    scriptURL,
    anyConstants.experienceUrl,
    anyConstants.linkingUri,
  ];

  for (const candidate of candidates) {
    const host = extractHostnameFromUri(candidate);
    if (host) {
      return candidate ?? null;
    }
  }
  return null;
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
  const hostUri =
    opts.expoHostUri !== undefined ? opts.expoHostUri : detectRuntimeExpoHostUri();
  const webHost =
    opts.webHostname ??
    (typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : null);

  const hostFromExpo = extractHostnameFromUri(hostUri);
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

/**
 * Ordered list of candidate API base URLs to try on mobile/emulator.
 * Allows automatic fallback between LAN IP (for physical phones on Wi-Fi)
 * and 10.0.2.2 / localhost (for Android Emulator / iOS Simulator when Expo runs in LAN mode).
 */
export function getCandidateApiBaseUrls(opts: DeriveApiUrlOptions = {}): string[] {
  const primary = deriveApiBaseUrl(opts);
  const platformOs = opts.platformOs ?? Platform.OS;
  if (platformOs === 'web') {
    return [primary];
  }

  const hostUri =
    opts.expoHostUri !== undefined ? opts.expoHostUri : detectRuntimeExpoHostUri();
  const hostFromExpo = extractHostnameFromUri(hostUri);
  const candidates: string[] = [primary];

  if (
    hostFromExpo &&
    hostFromExpo !== 'localhost' &&
    hostFromExpo !== '127.0.0.1' &&
    hostFromExpo !== '10.0.2.2'
  ) {
    candidates.push(`http://${hostFromExpo}:3000`);
  }

  if (platformOs === 'android') {
    candidates.push('http://10.0.2.2:3000');
    candidates.push('http://localhost:3000');
  } else if (platformOs === 'ios') {
    candidates.push('http://localhost:3000');
  }

  return Array.from(new Set(candidates));
}

export const API_BASE_URL: string = deriveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL || process.env.REACT_NATIVE_API_URL,
});


