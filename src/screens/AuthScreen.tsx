import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { useAuth } from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export const AuthScreen: React.FC<Props> = ({ navigation }) => {
  const { login, register, loginWithGoogle } = useAuth();

  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Vennligst fyll ut e-post og passord.');
      return;
    }

    setIsLoading(true);
    try {
      if (isLoginMode) {
        await login({ email: email.trim(), password });
      } else {
        await register({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          referralCode: referralCode.trim() || undefined,
        });
      }
      navigation.goBack();
    } catch (err: any) {
      setErrorMessage(err.message || 'Det oppstod en feil.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      // In dev or web environment, simulate / invoke Google auth flow
      // A mock/placeholder token is used for initial scaffolding if Google OAuth SDK is not yet linked
      const simulatedToken = `google_mock_token_${Date.now()}.${btoa(
        JSON.stringify({
          sub: `google_user_${Date.now()}`,
          email: email.trim() || 'bruker@gmail.com',
          name: name.trim() || 'Google Bruker',
        })
      )}.sig`;

      await loginWithGoogle(simulatedToken, referralCode.trim() || undefined);
      navigation.goBack();
    } catch (err: any) {
      setErrorMessage(err.message || 'Google-innlogging feilet');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Tilbake</Text>
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>
              {isLoginMode ? 'Velkommen tilbake' : 'Opprett konto'}
            </Text>
            <Text style={styles.subtitle}>
              {isLoginMode
                ? 'Logg inn for å få tilgang til dine tester og abonnement'
                : 'Registrer deg for å øve til Norskprøven'}
            </Text>
          </View>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.formCard}>
            {!isLoginMode && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Fullt navn</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ola Nordmann"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>E-postadresse</Text>
              <TextInput
                style={styles.input}
                placeholder="ola@eksempel.no"
                placeholderTextColor="#64748B"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Passord</Text>
              <TextInput
                style={styles.input}
                placeholder="Minst 6 tegn"
                placeholderTextColor="#64748B"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {!isLoginMode && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vervekode (valgfritt)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="F.eks. A1B2C3D4"
                  placeholderTextColor="#64748B"
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLoginMode ? 'Logg inn' : 'Registrer konto'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ELLER</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Authentication */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.googleButtonText}>Fortsett med Google</Text>
            </TouchableOpacity>

            {/* Apple ID Placeholder (disabled for future) */}
            <TouchableOpacity
              style={[styles.appleButton, styles.disabledButton]}
              disabled={true}
              onPress={() => Alert.alert('Kommer snart', 'Apple ID-innlogging blir tilgjengelig snart.')}
            >
              <Text style={styles.appleButtonText}> Logg inn med Apple (Kommer snart)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => {
              setIsLoginMode(!isLoginMode);
              setErrorMessage(null);
            }}
          >
            <Text style={styles.switchModeText}>
              {isLoginMode
                ? 'Har du ikke en konto? Registrer deg her'
                : 'Har du allerede en konto? Logg inn'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748B',
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  appleButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  switchModeButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchModeText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
});

