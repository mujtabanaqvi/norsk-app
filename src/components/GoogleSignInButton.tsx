import React, { useEffect } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Button, GoogleIcon } from './ui';

// Completes the OAuth popup/redirect on web.
WebBrowser.maybeCompleteAuthSession();

// EXPO_PUBLIC_* vars must be referenced statically to be inlined by Metro.
const GOOGLE_CLIENT_IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};

const platformClientId = Platform.select({
  ios: GOOGLE_CLIENT_IDS.iosClientId,
  android: GOOGLE_CLIENT_IDS.androidClientId,
  default: GOOGLE_CLIENT_IDS.webClientId,
});

const TITLE = 'Fortsett med Google';

interface GoogleSignInButtonProps {
  disabled?: boolean;
  loading?: boolean;
  /** Called with a Google ID token to send to /api/auth/google. */
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
  /** Dev-only: build an unsigned token when no client ID is configured. */
  devIdentity?: { email: string; name: string };
  style?: StyleProp<ViewStyle>;
}

const OAuthGoogleButton: React.FC<GoogleSignInButtonProps> = ({
  disabled,
  loading,
  onIdToken,
  onError,
  style,
}) => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_CLIENT_IDS);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token || response.authentication?.idToken;
      if (idToken) {
        onIdToken(idToken);
      } else {
        onError('Google returnerte ingen ID-token. Prøv igjen.');
      }
    } else if (response.type === 'error') {
      onError(response.error?.message || 'Google-innlogging ble avbrutt.');
    }
    // 'cancel' / 'dismiss' — user closed the popup; nothing to report.
  }, [response]);

  return (
    <Button
      title={TITLE}
      variant="outline"
      size="lg"
      leading={<GoogleIcon size={20} />}
      fullWidth
      loading={loading}
      disabled={disabled || !request}
      onPress={() => promptAsync()}
      style={style}
    />
  );
};

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = (props) => {
  if (platformClientId) {
    return <OAuthGoogleButton {...props} />;
  }

  // No client ID for this platform: in development, fall back to an unsigned token the
  // server accepts only when it has no Google client IDs configured either.
  return (
    <Button
      title={__DEV__ ? `${TITLE} (dev)` : TITLE}
      variant="outline"
      size="lg"
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
