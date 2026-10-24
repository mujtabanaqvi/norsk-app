// Native Google sign-in is Android-only (see native-google-signin.android.ts); web and iOS
// use the expo-auth-session flow in GoogleSignInButton.
export async function signInWithGoogleNative(_webClientId: string): Promise<string | null> {
  throw new Error('Native Google sign-in is only available on Android');
}
