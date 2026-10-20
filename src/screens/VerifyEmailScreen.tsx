import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { useAuth } from '../hooks/useAuth';
import { ApiError, resendVerificationEmail } from '../api';
import { Screen, Logo, Card, Button, Icon } from '../components/ui';
import { colors, radius, space, type } from '../theme';
import { OTP_LENGTH, otpSchema } from '../validation/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

const DEFAULT_COOLDOWN_SECONDS = 60;

export const VerifyEmailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { email } = route.params;
  const { verifyEmail } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState<number>(
    route.params.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS
  );
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (value: string = code) => {
    if (isVerifying) return;
    setNotice(null);
    const parsed = otpSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ugyldig kode');
      return;
    }
    setError(null);
    setIsVerifying(true);
    try {
      // On success the user is set in context and App switches to the authenticated stack.
      await verifyEmail(email, parsed.data);
    } catch (err: any) {
      setError(err?.message || 'Bekreftelsen mislyktes');
      if (err instanceof ApiError && (err.code === 'EXPIRED' || err.code === 'TOO_MANY_ATTEMPTS')) {
        setCode('');
      }
      setIsVerifying(false);
    }
  };

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === OTP_LENGTH) {
      submit(digits);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      const res = await resendVerificationEmail(email);
      setCode('');
      setNotice('Vi har sendt en ny kode. Sjekk innboksen (og søppelpost).');
      setCooldown(res.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS);
      inputRef.current?.focus();
    } catch (err: any) {
      if (err instanceof ApiError && err.retryAfterSeconds) {
        setCooldown(err.retryAfterSeconds);
      }
      setError(err?.message || 'Kunne ikke sende ny kode');
    } finally {
      setIsResending(false);
    }
  };

  const goToLogin = () => navigation.navigate('Auth', { email, mode: 'login' });

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <Pressable
              style={styles.backButton}
              onPress={goToLogin}
              accessibilityRole="button"
              accessibilityLabel="Tilbake"
            >
              <Icon name="chevron-back" size={20} color={colors.navy} />
              <Text style={styles.backButtonText}>Tilbake</Text>
            </Pressable>

            <View style={styles.header}>
              <Logo size={64} />
              <View style={styles.mailIcon}>
                <Icon name="mail-unread-outline" size={28} color={colors.red} />
              </View>
              <Text style={styles.title}>Bekreft e-postadressen din</Text>
              <Text style={styles.subtitle}>
                Vi har sendt en {OTP_LENGTH}-sifret kode og en bekreftelseslenke til
              </Text>
              <Text style={styles.email}>{email}</Text>
            </View>

            <Card style={styles.card}>
              <Text style={styles.inputLabel}>Bekreftelseskode</Text>
              <TextInput
                ref={inputRef}
                style={[styles.codeInput, !!error && styles.codeInputError]}
                value={code}
                onChangeText={handleChange}
                keyboardType="number-pad"
                inputMode="numeric"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                placeholder={'•'.repeat(OTP_LENGTH)}
                placeholderTextColor={colors.textMuted}
                autoFocus
                editable={!isVerifying}
                accessibilityLabel="Bekreftelseskode"
                onSubmitEditing={() => submit()}
              />

              {error && (
                <View style={styles.messageRow} accessibilityLiveRegion="polite">
                  <Icon name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              {notice && !error && (
                <View style={styles.messageRow} accessibilityLiveRegion="polite">
                  <Icon name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}

              <Button
                title="Bekreft og fortsett"
                variant="primary"
                size="lg"
                fullWidth
                loading={isVerifying}
                disabled={code.length !== OTP_LENGTH}
                onPress={() => submit()}
                style={styles.submit}
              />

              <Button
                title={cooldown > 0 ? `Send ny kode (${cooldown}s)` : 'Send ny kode'}
                variant="ghost"
                size="md"
                icon="refresh-outline"
                fullWidth
                loading={isResending}
                disabled={cooldown > 0}
                onPress={handleResend}
              />
            </Card>

            <View style={styles.linkHelp}>
              <Icon name="link-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.linkHelpText}>
                Har du heller trykket på lenken i e-posten? Da er kontoen bekreftet og du kan logge inn.
              </Text>
            </View>

            <Pressable style={styles.footerAction} onPress={goToLogin}>
              <Text style={styles.footerActionText}>Jeg har bekreftet – logg inn</Text>
            </Pressable>
            <Pressable
              style={styles.footerAction}
              onPress={() => navigation.navigate('Auth', { mode: 'register' })}
            >
              <Text style={styles.footerSubText}>Feil e-postadresse? Registrer deg på nytt</Text>
            </Pressable>
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
  header: {
    alignItems: 'center',
    marginBottom: space.xl,
  },
  mailIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    marginBottom: space.md,
  },
  title: {
    ...type.title,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  subtitle: {
    ...type.body,
    textAlign: 'center',
  },
  email: {
    ...type.bodyStrong,
    textAlign: 'center',
    marginTop: 2,
  },
  card: {
    padding: space.xl,
  },
  inputLabel: {
    ...type.caption,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
  },
  codeInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.text,
  },
  codeInputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
  },
  errorText: {
    ...type.caption,
    color: colors.danger,
    fontWeight: '600',
    flex: 1,
  },
  noticeText: {
    ...type.caption,
    color: colors.success,
    fontWeight: '600',
    flex: 1,
  },
  submit: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  linkHelp: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
    paddingHorizontal: space.sm,
  },
  linkHelpText: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  footerAction: {
    marginTop: space.md,
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  footerActionText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '700',
  },
  footerSubText: {
    ...type.caption,
    color: colors.textSecondary,
  },
});
