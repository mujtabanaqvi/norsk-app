import React, { useEffect, useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Button, GoogleIcon } from './ui';
import { useLocale } from '../hooks/useLocale';
import { signInWithGoogleNative } from '../lib/native-google-signin';

// Completes the OAuth popup/redirect on web.
WebBrowser.maybeCompleteAuthSession();

// EXPO_PUBLIC_* vars must be referenced statically to be inlined by Metro.
const GOOGLE_CLIENT_IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};

// Android signs in natively and requests the token for the web client ID; the browser flow
// there would send a custom-scheme redirect, which Google rejects with "invalid_request".
const platformClientId = Platform.select({
  ios: GOOGLE_CLIENT_IDS.iosClientId,
  android: GOOGLE_CLIENT_IDS.webClientId,
  default: GOOGLE_CLIENT_IDS.webClientId,
});

interface GoogleSignInButtonProps {
  disabled?: boolean;
  loading?: boolean;
  /** Called with a Google ID token to send to /api/auth/google. */
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
  /** Dev-only: build an unsigned token when no client ID is configured. */
  devIdentity?: { email: string; name: string };
  /** Short label and medium size, for placing next to another provider button. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const OAuthGoogleButton: React.FC<GoogleSignInButtonProps> = ({
  disabled,
  loading,
  onIdToken,
  onError,
  compact,
  style,
}) => {
  const { t } = useLocale();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_CLIENT_IDS);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token || response.authentication?.idToken;
      if (idToken) {
        onIdToken(idToken);
      } else {
        onError(t('auth.googleNoToken'));
      }
    } else if (response.type === 'error') {
      onError(response.error?.message || t('auth.googleCancelled'));
    }
    // 'cancel' / 'dismiss' — user closed the popup; nothing to report.
  }, [response]);

  return (
    <Button
      title={compact ? t('auth.googleShort') : t('auth.googleButton')}
      variant="outline"
      size={compact ? 'md' : 'lg'}
      leading={<GoogleIcon size={20} />}
      fullWidth
      loading={loading}
      disabled={disabled || !request}
      onPress={() => promptAsync()}
      style={style}
    />
  );
};

const NativeGoogleButton: React.FC<GoogleSignInButtonProps & { webClientId: string }> = ({
  webClientId,
  disabled,
  loading,
  onIdToken,
  onError,
  compact,
  style,
}) => {
  const { t } = useLocale();
  const [inProgress, setInProgress] = useState(false);

  const handlePress = async () => {
    setInProgress(true);
    try {
      const idToken = await signInWithGoogleNative(webClientId);
      if (idToken) onIdToken(idToken);
      // null — user closed the account picker; nothing to report.
    } catch (error) {
      onError(error instanceof Error && error.message ? error.message : t('auth.googleNoToken'));
    } finally {
      setInProgress(false);
    }
  };

  return (
    <Button
      title={compact ? t('auth.googleShort') : t('auth.googleButton')}
      variant="outline"
      size={compact ? 'md' : 'lg'}
      leading={<GoogleIcon size={20} />}
      fullWidth
      loading={loading}
      disabled={disabled || inProgress}
      onPress={handlePress}
      style={style}
    />
  );
};

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = (props) => {
  const { t } = useLocale();
  if (Platform.OS === 'android' && platformClientId) {
    return <NativeGoogleButton {...props} webClientId={platformClientId} />;
  }
  if (platformClientId) {
    return <OAuthGoogleButton {...props} />;
  }

  // No client ID for this platform: in development, fall back to an unsigned token the
  // server accepts only when it has no Google client IDs configured either.
  return (
    <Button
      title={(() => {
        const label = props.compact ? t('auth.googleShort') : t('auth.googleButton');
        return __DEV__ ? `${label} (dev)` : label;
      })()}
      variant="outline"
      size={props.compact ? 'md' : 'lg'}
      leading={<GoogleIcon size={20} />}
      fullWidth
      loading={props.loading}
      disabled={props.disabled || !__DEV__}
      onPress={() => {
        const identity = props.devIdentity ?? { email: 'bruker@gmail.com', name: 'Google Bruker' };
        const payload = btoa(
          JSON.stringify({ sub: `google_dev_${identity.email}`, email: identity.email, name: identity.name })
        );
        props.onIdToken(`dev.${payload}.sig`);
      }}
      style={props.style}
    />
  );
};
