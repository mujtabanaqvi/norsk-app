import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let configuredFor: string | null = null;

/**
 * Signs in with Google's native Android flow (Credential Manager) and returns the ID token,
 * or null if the user cancelled. Its audience is the *web* client ID, which the server accepts;
 * the Android OAuth client only has to exist in Google Cloud with this package name and the
 * signing certificate's SHA-1.
 */
export async function signInWithGoogleNative(webClientId: string): Promise<string | null> {
  if (configuredFor !== webClientId) {
    GoogleSignin.configure({ webClientId });
    configuredFor = webClientId;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    // DEVELOPER_ERROR (code 10) means no Android OAuth client matches the package + SHA-1.
    console.warn('Native Google sign-in failed:', error);
    throw error;
  }
}
