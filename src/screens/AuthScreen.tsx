import React, { useEffect, useRef, useState } from 'react';
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
import { useLocale } from '../hooks/useLocale';
import { ApiError } from '../api';
import {
  Screen,
  Logo,
  Card,
  Badge,
  Button,
  Icon,
  FormField,
  LanguageToggle,
} from '../components/ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { colors, radius, space, type } from '../theme';
import {
  loginSchema,
  registerSchema,
  fieldErrors as toFieldErrors,
  validateField,
  emailSchema,
  passwordRulesHint,
  type FieldErrors,
} from '../validation/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

type FieldName = 'name' | 'email' | 'password' | 'confirmPassword' | 'referralCode';

export const AuthScreen: React.FC<Props> = ({ navigation, route }) => {
  const { login, register, loginWithGoogle } = useAuth();
  const { locale, t } = useLocale();

  const [isLoginMode, setIsLoginMode] = useState<boolean>(route.params?.mode !== 'register');
  const [values, setValues] = useState<Record<FieldName, string>>({
    name: '',
    email: route.params?.email ?? '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);

  // Returning from VerifyEmail ("logg inn" / "registrer på nytt") passes new params.
  useEffect(() => {
    const mode = route.params?.mode;
    const email = route.params?.email;
    if (mode) setIsLoginMode(mode !== 'register');
    if (email !== undefined) {
      setValues((v) => ({ ...v, email, password: '', confirmPassword: '' }));
    }
  }, [route.params?.mode, route.params?.email]);

  const schema = isLoginMode ? loginSchema : registerSchema;
  const isBusy = isSubmitting || isGoogleLoading;

  // Re-translate any visible field errors when the UI language changes.
  useEffect(() => {
    setErrors((prev) => {
      const updated: FieldErrors = {};
      for (const field of Object.keys(prev)) {
        updated[field] = validateField(schema, values, field, locale) ?? prev[field];
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const setField = (field: FieldName, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    setErrorMessage(null);
    // Once a field has been visited, re-validate as the user types so errors clear as soon as fixed.
    if (touched[field] || errors[field]) {
      setErrors((prev) => {
        const updated = { ...prev };
        const message = validateField(schema, next, field, locale);
        if (message) updated[field] = message;
        else delete updated[field];
        // Keep "confirm password" in sync when the password itself changes.
        if (field === 'password' && (touched.confirmPassword || prev.confirmPassword)) {
          const confirmMessage = validateField(schema, next, 'confirmPassword', locale);
          if (confirmMessage) updated.confirmPassword = confirmMessage;
          else delete updated.confirmPassword;
        }
        return updated;
      });
    }
  };

  const handleBlur = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    // Don't flag a field that was merely tabbed past while still empty; submit catches that.
    if (!values[field]) return;
    const message = validateField(schema, values, field, locale);
    setErrors((prev) => {
      const updated = { ...prev };
      if (message) updated[field] = message;
      else delete updated[field];
      return updated;
    });
  };

  const switchMode = () => {
    setIsLoginMode((m) => !m);
    setErrors({});
    setTouched({});
    setErrorMessage(null);
    setValues((v) => ({ ...v, password: '', confirmPassword: '' }));
  };

  const handleSubmit = async () => {
    if (isBusy) return;
    setErrorMessage(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error, locale));
      setTouched({ name: true, email: true, password: true, confirmPassword: true, referralCode: true });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      if (isLoginMode) {
        // On success App swaps to the authenticated stack.
        await login({ email: values.email.trim(), password: values.password });
      } else {
        const res = await register({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          confirmPassword: values.confirmPassword,
          referralCode: values.referralCode.trim() || undefined,
        });
        navigation.navigate('VerifyEmail', {
          email: res.email,
          retryAfterSeconds: res.retryAfterSeconds,
        });
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_VERIFIED' || err.code === 'EMAIL_SEND_FAILED') {
          navigation.navigate('VerifyEmail', {
            email: err.email || values.email.trim().toLowerCase(),
            // If sending failed, let the user hit "Send ny kode" immediately.
            retryAfterSeconds: err.code === 'EMAIL_SEND_FAILED' ? 0 : err.retryAfterSeconds,
          });
          return;
        }
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          setErrors(err.fieldErrors);
          return;
        }
      }
      setErrorMessage(err?.message || t('common.unknownError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleIdToken = async (idToken: string) => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const referral = isLoginMode ? undefined : values.referralCode.trim() || undefined;
      await loginWithGoogle(idToken, referral);
    } catch (err: any) {
      setErrorMessage(err?.message || t('auth.googleFailed'));
      setIsGoogleLoading(false);
    }
  };

  const devGoogleEmail = emailSchema.safeParse(values.email);

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
            <View style={styles.topRow}>
              {navigation.canGoBack() ? (
                <Pressable
                  style={styles.backButton}
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Icon name="chevron-back" size={20} color={colors.navy} />
                  <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <LanguageToggle />
            </View>

            {/* App Branding & Highlights Hero */}
            <View style={styles.brandContainer}>
              <Logo size={76} withWordmark />
              <Badge
                label={t('auth.badge')}
                tone="red"
                style={styles.brandBadge}
              />
              <Text style={styles.brandTitle}>{t('auth.brandTitle')}</Text>
              <Text style={styles.brandSubtitle}>
                {t('auth.brandSubtitle')}
              </Text>
            </View>

            {/* Smart Feature Showcase Cards */}
            <View style={styles.featuresGrid}>
              <Card style={styles.featureCard}>
                <View style={styles.featureIconCircle}>
                  <Icon name="mic-outline" size={20} color={colors.red} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>{t('auth.feature1Title')}</Text>
                  <Text style={styles.featureDesc}>
                    {t('auth.feature1Desc')}
                  </Text>
                </View>
              </Card>

              <Card style={styles.featureCard}>
                <View style={[styles.featureIconCircle, { backgroundColor: colors.navySoft }]}>
                  <Icon name="people-outline" size={20} color={colors.navy} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>{t('auth.feature2Title')}</Text>
                  <Text style={styles.featureDesc}>
                    {t('auth.feature2Desc')}
                  </Text>
                </View>
              </Card>

              <Card style={styles.featureCard}>
                <View style={styles.featureIconCircle}>
                  <Icon name="analytics-outline" size={20} color={colors.red} />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={styles.featureTitle}>{t('auth.feature3Title')}</Text>
                  <Text style={styles.featureDesc}>
                    {t('auth.feature3Desc')}
                  </Text>
                </View>
              </Card>
            </View>

            <View style={styles.headerContainer}>
              <Text style={styles.title}>
                {isLoginMode ? t('auth.loginTitle') : t('auth.registerTitle')}
              </Text>
              <Text style={styles.subtitle}>
                {isLoginMode ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
              </Text>
            </View>

            {errorMessage && (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <Card style={styles.formCard}>
              {/* Google Authentication — Google has already verified the email */}
              <GoogleSignInButton
                disabled={isBusy}
                loading={isGoogleLoading}
                onIdToken={handleGoogleIdToken}
                onError={(message) => {
                  setErrorMessage(message);
                  setIsGoogleLoading(false);
                }}
                devIdentity={
                  devGoogleEmail.success
                    ? { email: devGoogleEmail.data, name: values.name.trim() || 'Google Bruker' }
                    : undefined
                }
                style={styles.socialButton}
              />

              {/* Apple ID Placeholder */}
              <Button
                title={t('auth.appleButton')}
                variant="outline"
                size="lg"
                icon="logo-apple"
                fullWidth
                disabled={true}
                onPress={() =>
                  Alert.alert(t('common.comingSoon'), t('auth.appleComingSoon'))
                }
              />

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth.dividerEmail')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {!isLoginMode && (
                <FormField
                  label={t('auth.nameLabel')}
                  placeholder={t('auth.namePlaceholder')}
                  value={values.name}
                  onChangeText={(text) => setField('name', text)}
                  onBlur={() => handleBlur('name')}
                  error={errors.name}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!isBusy}
                />
              )}

              <FormField
                ref={emailRef}
                label={t('auth.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                value={values.email}
                onChangeText={(text) => setField('email', text)}
                onBlur={() => handleBlur('email')}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isBusy}
              />

              <FormField
                ref={passwordRef}
                label={t('auth.passwordLabel')}
                placeholder={
                  isLoginMode ? t('auth.passwordPlaceholderLogin') : t('auth.passwordPlaceholderRegister')
                }
                value={values.password}
                onChangeText={(text) => setField('password', text)}
                onBlur={() => handleBlur('password')}
                error={errors.password}
                hint={isLoginMode ? undefined : passwordRulesHint(locale)}
                password
                autoCapitalize="none"
                autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                textContentType={isLoginMode ? 'password' : 'newPassword'}
                returnKeyType={isLoginMode ? 'go' : 'next'}
                onSubmitEditing={() => (isLoginMode ? handleSubmit() : confirmRef.current?.focus())}
                editable={!isBusy}
              />

              {!isLoginMode && (
                <FormField
                  ref={confirmRef}
                  label={t('auth.confirmPasswordLabel')}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={values.confirmPassword}
                  onChangeText={(text) => setField('confirmPassword', text)}
                  onBlur={() => handleBlur('confirmPassword')}
                  error={errors.confirmPassword}
                  password
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => referralRef.current?.focus()}
                  editable={!isBusy}
                />
              )}

              {!isLoginMode && (
                <FormField
                  ref={referralRef}
                  label={t('auth.referralLabel')}
                  placeholder={t('auth.referralPlaceholder')}
                  value={values.referralCode}
                  onChangeText={(text) => setField('referralCode', text)}
                  onBlur={() => handleBlur('referralCode')}
                  error={errors.referralCode}
                  autoCapitalize="characters"
                  maxLength={8}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  editable={!isBusy}
                />
              )}

              <Button
                title={isLoginMode ? t('auth.loginButton') : t('auth.registerButton')}
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                disabled={isGoogleLoading}
                onPress={handleSubmit}
                style={styles.submitButton}
              />

              {!isLoginMode && (
                <Text style={styles.verifyNote}>
                  {t('auth.verifyNote')}
                </Text>
              )}
            </Card>

            <Pressable style={styles.switchModeButton} onPress={switchMode} disabled={isBusy}>
              <Text style={styles.switchModeText}>
                {isLoginMode ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </Text>
            </Pressable>

            {/* Public Legal & How-to Links */}
            <View style={styles.publicLinksContainer}>
              <Pressable
                onPress={() => navigation.navigate('HowTo')}
                style={({ pressed }) => [styles.publicLinkBtn, pressed && styles.pressed]}
              >
                <Icon name="book-outline" size={16} color={colors.navy} />
                <Text style={styles.publicLinkText}>{t('nav.howTo')}</Text>
              </Pressable>

              <View style={styles.footerLinkRow}>
                <Pressable onPress={() => navigation.navigate('Terms')}>
                  <Text style={styles.footerSubLink}>{t('nav.terms')}</Text>
                </Pressable>
                <Text style={styles.footerDot}>•</Text>
                <Pressable onPress={() => navigation.navigate('PrivacyPolicy')}>
                  <Text style={styles.footerSubLink}>{t('nav.privacy')}</Text>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.sm,
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
  submitButton: {
    marginTop: space.xs,
  },
  verifyNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: space.sm,
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
