import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { useAuth } from '../hooks/useAuth';
import { Screen, Logo, Card, Badge, Button, Icon } from '../components/ui';
import { colors, radius, space, type } from '../theme';

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
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {navigation.canGoBack() && (
              <Pressable
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Tilbake"
              >
                <Icon name="chevron-back" size={20} color={colors.navy} />
                <Text style={styles.backButtonText}>Tilbake</Text>
              </Pressable>
            )}

            {/* App Branding & Highlights Hero */}
            <View style={styles.brandContainer}>
              <Logo size={76} withWordmark />
              <Badge
                label="NORSKPRØVEN MUNTLIG · B1 / B2"
                tone="red"
                style={styles.brandBadge}
              />
              <Text style={styles.brandTitle}>Muntlig Eksamenssimulator</Text>
              <Text style={styles.brandSubtitle}>
                Øv på den offisielle muntlige prøven med AI-sensor og få umiddelbar HK-dir karaktervurdering.
              </Text>
            </View>

            {/* Smart Feature Showcase Cards */}
            <View style={styles.featuresGrid}>
              <Card style={styles.featureCard}>
                <View style={styles.featureIconCircle}>
                  <Icon name="mic-outline" size={20} color={colors.red} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>Full muntlig eksamen</Text>
                  <Text style={styles.featureDesc}>
                    Del 1 (egenpresentasjon), Del 2 (samtale) og Del 3 (oppfølging).
                  </Text>
                </View>
              </Card>

              <Card style={styles.featureCard}>
                <View style={[styles.featureIconCircle, { backgroundColor: colors.navySoft }]}>
                  <Icon name="people-outline" size={20} color={colors.navy} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>Interaktiv AI-medkandidat</Text>
                  <Text style={styles.featureDesc}>
                    Øv alene når det passer deg, eller ta prøven sammen med en venn.
                  </Text>
                </View>
              </Card>

              <Card style={styles.featureCard}>
                <View style={styles.featureIconCircle}>
                  <Icon name="analytics-outline" size={20} color={colors.red} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>HK-dir Sensorvurdering</Text>
                  <Text style={styles.featureDesc}>
                    Detaljert poengsum på flyt, uttale, grammatikk og ordforråd.
                  </Text>
                </View>
              </Card>
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
                <Icon name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <Card style={styles.formCard}>
              {!isLoginMode && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Fullt navn</Text>
                  <TextInput
                    style={[
                      styles.input,
                      focusedField === 'name' && styles.inputFocused,
                    ]}
                    placeholder="Ola Nordmann"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-postadresse</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'email' && styles.inputFocused,
                  ]}
                  placeholder="ola@eksempel.no"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Passord</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                  placeholder="Minst 6 tegn"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry
                />
              </View>

              {!isLoginMode && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Vervekode (valgfritt)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      focusedField === 'referral' && styles.inputFocused,
                    ]}
                    placeholder="F.eks. A1B2C3D4"
                    placeholderTextColor={colors.textMuted}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    onFocus={() => setFocusedField('referral')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="characters"
                  />
                </View>
              )}

              <Button
                title={isLoginMode ? 'Logg inn' : 'Registrer konto'}
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                onPress={handleSubmit}
                style={styles.submitButton}
              />

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ELLER</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Authentication */}
              <Button
                title="Fortsett med Google"
                variant="outline"
                size="lg"
                icon="logo-google"
                fullWidth
                disabled={isLoading}
                onPress={handleGoogleSignIn}
                style={styles.socialButton}
              />

              {/* Apple ID Placeholder */}
              <Button
                title="Logg inn med Apple (Kommer snart)"
                variant="outline"
                size="lg"
                icon="logo-apple"
                fullWidth
                disabled={true}
                onPress={() =>
                  Alert.alert('Kommer snart', 'Apple ID-innlogging blir tilgjengelig snart.')
                }
              />
            </Card>

            <Pressable
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
            </Pressable>

            {/* Public Legal & How-to Links */}
            <View style={styles.publicLinksContainer}>
              <Pressable
                onPress={() => navigation.navigate('HowTo')}
                style={({ pressed }) => [styles.publicLinkBtn, pressed && styles.pressed]}
              >
                <Icon name="book-outline" size={16} color={colors.navy} />
                <Text style={styles.publicLinkText}>Slik fungerer prøven</Text>
              </Pressable>

              <View style={styles.footerLinkRow}>
                <Pressable onPress={() => navigation.navigate('Terms')}>
                  <Text style={styles.footerSubLink}>Vilkår for bruk</Text>
                </Pressable>
                <Text style={styles.footerDot}>•</Text>
                <Pressable onPress={() => navigation.navigate('PrivacyPolicy')}>
                  <Text style={styles.footerSubLink}>Personvernerklæring</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.sm,
    marginBottom: space.sm,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '600',
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  brandBadge: {
    marginTop: space.md,
    marginBottom: space.sm,
    alignSelf: 'center',
  },
  brandTitle: {
    ...type.title,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  brandSubtitle: {
    ...type.body,
    textAlign: 'center',
  },
  featuresGrid: {
    gap: space.sm,
    marginBottom: space.xl,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrapper: {
    flex: 1,
  },
  featureTitle: {
    ...type.bodyStrong,
  },
  featureDesc: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headerContainer: {
    marginBottom: space.md,
  },
  title: {
    ...type.title,
    marginBottom: 4,
  },
  subtitle: {
    ...type.body,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  errorText: {
    ...type.body,
    color: colors.danger,
    fontWeight: '600',
    flex: 1,
  },
  formCard: {
    padding: space.xl,
  },
  inputGroup: {
    marginBottom: space.md,
  },
  inputLabel: {
    ...type.caption,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.red,
    backgroundColor: colors.surface,
  },
  submitButton: {
    marginTop: space.xs,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...type.overline,
    marginHorizontal: space.md,
  },
  socialButton: {
    marginBottom: space.sm,
  },
  switchModeButton: {
    marginTop: space.lg,
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  switchModeText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '700',
  },
  publicLinksContainer: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
    gap: space.md,
  },
  publicLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  publicLinkText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  footerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  footerSubLink: {
    ...type.caption,
  },
  footerDot: {
    ...type.caption,
  },
});
