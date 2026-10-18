import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/hooks/useAuth';
import { ExamSetupScreen } from './src/screens/ExamSetupScreen';
import { ExamRoomScreen } from './src/screens/ExamRoomScreen';
import { ExamResultsScreen } from './src/screens/ExamResultsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { SubscriptionScreen } from './src/screens/SubscriptionScreen';
import { ReferralScreen } from './src/screens/ReferralScreen';
import type { RootStackParamList } from './src/types/exam';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />
          <Stack.Navigator
            initialRouteName="ExamSetup"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0B0F19' },
              animation: 'fade',
            }}
          >
            <Stack.Screen
              name="ExamSetup"
              component={ExamSetupScreen}
              options={{ title: 'Eksamensforberedelse' }}
            />
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ title: 'Innlogging & Registrering' }}
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
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
