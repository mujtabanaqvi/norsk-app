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
  const [showReferral, setShowReferral] = useState<boolean>(false);

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
  const referralVisible = showReferral || !!values.referralCode || !!errors.referralCode;

  const features = [
    { icon: 'mic-outline', title: t('auth.feature1Title'), tint: colors.redSoft, color: colors.red },
    { icon: 'people-outline', title: t('auth.feature2Title'), tint: colors.navySoft, color: colors.navy },
    { icon: 'analytics-outline', title: t('auth.feature3Title'), tint: colors.redSoft, color: colors.red },
  ] as const;

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
            {/* Compact top bar: back (or logo) + language */}
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
                <Logo size={36} withWordmark />
              )}
              <LanguageToggle />
            </View>

            {/* Short headline so the form is visible straight away */}
            <View style={styles.headerContainer}>
              <Badge label={t('auth.badge')} tone="red" style={styles.brandBadge} />
              <Text style={styles.title}>
                {isLoginMode ? t('auth.loginTitle') : t('auth.registerTitle')}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {t('auth.brandTitle')}
              </Text>
            </View>

            {errorMessage && (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <Card style={styles.formCard}>
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
                  returnKeyType={referralVisible ? 'next' : 'go'}
                  onSubmitEditing={() =>
                    referralVisible ? referralRef.current?.focus() : handleSubmit()
                  }
                  editable={!isBusy}
                />
              )}

              {!isLoginMode &&
                (referralVisible ? (
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
                ) : (
                  <Pressable
                    onPress={() => {
                      setShowReferral(true);
                      setTimeout(() => referralRef.current?.focus(), 50);
                    }}
                    disabled={isBusy}
                    style={styles.referralToggle}
                    accessibilityRole="button"
                  >
                    <Icon name="gift-outline" size={15} color={colors.navy} />
                    <Text style={styles.referralToggleText}>{t('auth.haveReferral')}</Text>
                  </Pressable>
                ))}

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

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social providers side by side — Google has already verified the email */}
              <View style={styles.socialRow}>
                <View style={styles.socialItem}>
                  <GoogleSignInButton
                    compact
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
                  />
                </View>
                <View style={styles.socialItem}>
                  <Button
                    title={t('auth.appleShort')}
                    variant="outline"
                    size="md"
                    icon="logo-apple"
                    fullWidth
                    disabled={true}
                    accessibilityLabel={t('auth.appleButton')}
                    onPress={() =>
                      Alert.alert(t('common.comingSoon'), t('auth.appleComingSoon'))
                    }
                  />
                </View>
              </View>
            </Card>

            <Pressable style={styles.switchModeButton} onPress={switchMode} disabled={isBusy}>
              <Text style={styles.switchModeText}>
                {isLoginMode ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </Text>
            </Pressable>

            {/* Compact feature strip, below the form */}
            <View style={styles.featuresRow}>
              {features.map((f) => (
                <View key={f.title} style={styles.featureItem}>
                  <View style={[styles.featureIconCircle, { backgroundColor: f.tint }]}>
                    <Icon name={f.icon} size={18} color={f.color} />
                  </View>
                  <Text style={styles.featureTitle} numberOfLines={2}>
                    {f.title}
                  </Text>
                </View>
              ))}
            </View>

            {/* Public Legal & How-to Links */}
            <View style={styles.footerLinkRow}>
              <Pressable
                onPress={() => navigation.navigate('HowTo')}
                style={({ pressed }) => [styles.footerLinkBtn, pressed && styles.pressed]}
              >
                <Icon name="book-outline" size={14} color={colors.navy} />
                <Text style={styles.footerLinkStrong}>{t('nav.howTo')}</Text>
              </Pressable>
              <Text style={styles.footerDot}>•</Text>
              <Pressable onPress={() => navigation.navigate('Terms')}>
                <Text style={styles.footerSubLink}>{t('nav.terms')}</Text>
              </Pressable>
              <Text style={styles.footerDot}>•</Text>
              <Pressable onPress={() => navigation.navigate('PrivacyPolicy')}>
                <Text style={styles.footerSubLink}>{t('nav.privacy')}</Text>
              </Pressable>
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
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
    minHeight: 40,
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
  headerContainer: {
    marginBottom: space.md,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    marginBottom: space.sm,
  },
  title: {
    ...type.title,
    marginBottom: 2,
  },
  subtitle: {
    ...type.caption,
    color: colors.textSecondary,
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
    padding: space.lg,
  },
  referralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: space.xs,
    marginBottom: space.md,
  },
  referralToggleText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
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
    marginVertical: space.md,
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
  socialRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  socialItem: {
    flex: 1,
  },
  switchModeButton: {
    marginTop: space.md,
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  switchModeText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  featuresRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  featureItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  featureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  footerLinkStrong: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  footerSubLink: {
    ...type.caption,
  },
  footerDot: {
    ...type.caption,
  },
});
