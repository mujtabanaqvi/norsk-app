import React, { useEffect } from 'react';
import { Linking, Platform, StatusBar, View, ActivityIndicator } from 'react-native';
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
import { addCustomerInfoListener, configurePurchases, logOutPurchases } from './src/lib/purchases';
import { installWebAlert } from './src/lib/web-alert';
import {
  captureReferralFromUrl,
  captureReferralOnFirstLaunch,
  clearPendingReferral,
} from './src/lib/pending-referral';
import { Logo } from './src/components/ui';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/types/exam';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

installWebAlert();

// The launch URL only needs handling once, not again after every logout.
let initialUrlHandled = false;

// Web only: browser URLs for the main screens.
const linking: LinkingOptions<RootStackParamList> | undefined =
  Platform.OS === 'web'
    ? {
        prefixes: [typeof window !== 'undefined' ? window.location.origin : ''],
        config: {
          screens: {
            ExamSetup: '',
            Subscription: 'subscription',
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

  // RevenueCat follows the logged-in user. Renewals, expirations and purchases made on another device
  // reach the server through the RevenueCat webhook; the listener only refreshes the profile shown here.
  useEffect(() => {
    if (!userId) return;
    let removeListener = () => {};
    let active = true;
    configurePurchases(userId)
      .then(() => {
        if (active) removeListener = addCustomerInfoListener(() => refreshProfile());
      })
      .catch((err) => console.warn('RevenueCat setup failed', err));
    return () => {
      active = false;
      removeListener();
      logOutPurchases();
    };
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
