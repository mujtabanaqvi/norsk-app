import React from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { ExamSetupScreen } from './src/screens/ExamSetupScreen';
import { ExamRoomScreen } from './src/screens/ExamRoomScreen';
import { ExamResultsScreen } from './src/screens/ExamResultsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { SubscriptionScreen } from './src/screens/SubscriptionScreen';
import { ReferralScreen } from './src/screens/ReferralScreen';
import { HowToScreen } from './src/screens/HowToScreen';
import { TermsScreen } from './src/screens/TermsScreen';
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen';
import type { RootStackParamList } from './src/types/exam';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigation() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0F19' },
          animation: 'fade',
        }}
      >
        {user ? (
          // Authenticated Stack: Full functionality and prøve access
          <>
            <Stack.Screen
              name="ExamSetup"
              component={ExamSetupScreen}
              options={{ title: 'Eksamensforberedelse' }}
            />
            <Stack.Screen
              name="ExamRoom"
              component={ExamRoomScreen}
              options={{
                title: 'Muntlig Eksamensrom',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="ExamResults"
              component={ExamResultsScreen}
              options={{
                title: 'Resultater & Tilbakemelding',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
              options={{ title: 'Abonnement' }}
            />
            <Stack.Screen
              name="Referral"
              component={ReferralScreen}
              options={{ title: 'Verv en venn' }}
            />
            <Stack.Screen
              name="HowTo"
              component={HowToScreen}
              options={{ title: 'Slik fungerer prøven' }}
            />
            <Stack.Screen
              name="Terms"
              component={TermsScreen}
              options={{ title: 'Vilkår for bruk' }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: 'Personvernerklæring' }}
            />
          </>
        ) : (
          // Unauthenticated Stack: Auth screen with smart showcases & public info screens
          <>
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ title: 'Innlogging & Registrering' }}
            />
            <Stack.Screen
              name="HowTo"
              component={HowToScreen}
              options={{ title: 'Slik fungerer prøven' }}
            />
            <Stack.Screen
              name="Terms"
              component={TermsScreen}
              options={{ title: 'Vilkår for bruk' }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: 'Personvernerklæring' }}
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
      <AuthProvider>
        <AppNavigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
