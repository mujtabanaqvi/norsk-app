import React, { useEffect } from 'react';
import { Alert, Linking, Platform, StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { LocaleProvider, useLocale } from './src/hooks/useLocale';
import { ExamSetupScreen } from './src/screens/ExamSetupScreen';
import { ExamRoomScreen } from './src/screens/ExamRoomScreen';
import { ExamResultsScreen } from './src/screens/ExamResultsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
import { SubscriptionScreen } from './src/screens/SubscriptionScreen';
import { ReferralScreen } from './src/screens/ReferralScreen';
import { LearningProfileScreen } from './src/screens/LearningProfileScreen';
import { HowToScreen } from './src/screens/HowToScreen';
import { TermsScreen } from './src/screens/TermsScreen';
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen';
import { PaymentResultScreen } from './src/screens/PaymentResultScreen';
import { startIapListener } from './src/lib/iap';
import {
  captureReferralFromUrl,
  captureReferralOnFirstLaunch,
  clearPendingReferral,
} from './src/lib/pending-referral';
import { PurchaseVerificationError } from './src/api';
import { Logo } from './src/components/ui';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/types/exam';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// The launch URL only needs handling once, not again after every logout.
let initialUrlHandled = false;

// Web only: lets Stripe Checkout return into the app (`/payment/success?session_id=…`).
const linking: LinkingOptions<RootStackParamList> | undefined =
  Platform.OS === 'web'
    ? {
        prefixes: [typeof window !== 'undefined' ? window.location.origin : ''],
        config: {
          screens: {
            ExamSetup: '',
            Subscription: 'subscription',
            PaymentResult: 'payment/:result',
          },
        },
      }
    : undefined;

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.red,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.red,
  },
};

function AppNavigation() {
  const { user, isLoading, refreshProfile } = useAuth();
  const { t, isLoading: isLocaleLoading } = useLocale();
  const userId = user?.id;

  // Store purchases (iOS/Android) are delivered asynchronously, so the listener lives for the whole session.
  useEffect(() => {
    if (!userId) return;
    return startIapListener({
      onVerified: (result, userInitiated) => {
        if (userInitiated && navigationRef.isReady()) {
          navigationRef.navigate('PaymentResult', { result: 'success', tier: result.tier });
        } else {
          refreshProfile();
        }
      },
      onPending: () => {
        if (navigationRef.isReady()) navigationRef.navigate('PaymentResult', { result: 'pending' });
      },
      onError: (error) => {
        const message =
          error instanceof PurchaseVerificationError && error.code === 'OWNED_BY_OTHER_ACCOUNT'
            ? t('subscription.ownedByOtherAccount')
            : (error as any)?.message || t('subscription.paymentErrorBody');
        Alert.alert(t('subscription.paymentErrorTitle'), message);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Referral links (https://snakkly.no/r/CODE) only matter before sign-up; AuthScreen prefills the code.
  useEffect(() => {
    if (isLoading) return;
    if (userId) {
      clearPendingReferral();
      return;
    }
    const handleUrl = async (url: string | null) => {
      if ((await captureReferralFromUrl(url)) && navigationRef.isReady()) {
        navigationRef.navigate('Auth', { mode: 'register' });
      }
    };
    if (!initialUrlHandled) {
      initialUrlHandled = true;
      Linking.getInitialURL().then(handleUrl).catch(() => {});
      captureReferralOnFirstLaunch();
    }
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [userId, isLoading]);

  if (isLoading || isLocaleLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <Logo size={96} />
        <ActivityIndicator size="small" color={colors.red} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={linking}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        {user ? (
          // Authenticated Stack: Full functionality and prøve access
          <>
            <Stack.Screen
              name="ExamSetup"
              component={ExamSetupScreen}
              options={{ title: t('nav.examSetup') }}
            />
            <Stack.Screen
              name="ExamRoom"
              component={ExamRoomScreen}
              options={{
                title: t('nav.examRoom'),
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="ExamResults"
              component={ExamResultsScreen}
              options={{
                title: t('nav.examResults'),
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
              options={{ title: t('nav.subscription') }}
            />
            <Stack.Screen
              name="PaymentResult"
              component={PaymentResultScreen}
              options={{ title: t('nav.subscription'), gestureEnabled: false }}
            />
            <Stack.Screen
              name="Referral"
              component={ReferralScreen}
              options={{ title: t('nav.referral') }}
            />
            <Stack.Screen
              name="LearningProfile"
              component={LearningProfileScreen}
              options={{ title: t('nav.profile') }}
            />
            <Stack.Screen
              name="HowTo"
              component={HowToScreen}
              options={{ title: t('nav.howTo') }}
            />
            <Stack.Screen
              name="Terms"
              component={TermsScreen}
              options={{ title: t('nav.terms') }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: t('nav.privacy') }}
            />
          </>
        ) : (
          // Unauthenticated Stack: Auth screen with smart showcases & public info screens
          <>
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ title: t('nav.auth') }}
            />
            <Stack.Screen
              name="VerifyEmail"
              component={VerifyEmailScreen}
              options={{ title: t('nav.verifyEmail') }}
            />
            <Stack.Screen
              name="HowTo"
              component={HowToScreen}
              options={{ title: t('nav.howTo') }}
            />
            <Stack.Screen
              name="Terms"
              component={TermsScreen}
              options={{ title: t('nav.terms') }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: t('nav.privacy') }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <AppNavigation />
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
