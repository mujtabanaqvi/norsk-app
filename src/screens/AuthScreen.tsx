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
  const { user, login, register, loginWithGoogle } = useAuth();

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
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
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
      const simulatedToken = `google_mock_token_${Date.now()}.${btoa(
        JSON.stringify({
          sub: `google_user_${Date.now()}`,
          email: email.trim() || 'bruker@gmail.com',
          name: name.trim() || 'Google Bruker',
        })
      )}.sig`;

      await loginWithGoogle(simulatedToken, referralCode.trim() || undefined);
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>← Tilbake</Text>
            </TouchableOpacity>
          )}

          {/* App Branding & Highlights Banner */}
          <View style={styles.brandContainer}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>NORSKPRØVEN B1 / B2</Text>
            </View>
            <Text style={styles.brandTitle}>Muntlig Eksamenssimulator</Text>
            <Text style={styles.brandSubtitle}>
              Øv på den offisielle muntlige prøven med AI-sensor og få umiddelbar HK-dir karaktervurdering.
            </Text>
          </View>

          {/* Smart Feature Showcase Cards */}
          <View style={styles.featuresGrid}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🎙️</Text>
              <View style={styles.featureTextWrapper}>
                <Text style={styles.featureTitle}>Full muntlig eksamen</Text>
                <Text style={styles.featureDesc}>
                  Del 1 (egenpresentasjon), Del 2 (samtale) og Del 3 (oppfølging).
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🤖</Text>
              <View style={styles.featureTextWrapper}>
                <Text style={styles.featureTitle}>Interaktiv AI-medkandidat</Text>
                <Text style={styles.featureDesc}>
                  Øv alene når det passer deg, eller ta prøven sammen med en venn.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📊</Text>
              <View style={styles.featureTextWrapper}>
                <Text style={styles.featureTitle}>HK-dir Sensorvurdering</Text>
                <Text style={styles.featureDesc}>
                  Detaljert poengsum på flyt, uttale, grammatikk og ordforråd.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>
              {isLoginMode ? 'Logg inn for å starte' : 'Opprett konto for å starte'}
            </Text>
            <Text style={styles.subtitle}>
              {isLoginMode
                ? 'Logg inn med din konto for å få tilgang til prøver og resultater.'
                : 'Registrer deg gratis for å øve til Norskprøven i dag.'}
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
              style={[styles.submitButton, isLoading && styles.disabledButton]}
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

            {/* Apple ID Placeholder */}
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

          {/* Public Legal & How-to Links */}
          <View style={styles.publicLinksContainer}>
            <TouchableOpacity
              onPress={() => navigation.navigate('HowTo')}
              style={styles.publicLinkBtn}
            >
              <Text style={styles.publicLinkText}>📖 Slik fungerer prøven</Text>
            </TouchableOpacity>

            <View style={styles.footerLinkRow}>
              <TouchableOpacity onPress={() => navigation.navigate('Terms')}>
                <Text style={styles.footerSubLink}>Vilkår for bruk</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}>•</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
                <Text style={styles.footerSubLink}>Personvernerklæring</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '600',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  brandBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    marginBottom: 8,
  },
  brandBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 6,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  featuresGrid: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
  },
  featureTextWrapper: {
    flex: 1,
  },
  featureTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  headerContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputGroup: {
    marginBottom: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  googleButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  switchModeButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchModeText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
  publicLinksContainer: {
    marginTop: 20,
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 16,
  },
  publicLinkBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  publicLinkText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  footerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerSubLink: {
    color: '#64748B',
    fontSize: 12,
  },
  footerDot: {
    color: '#475569',
    fontSize: 12,
  },
});
