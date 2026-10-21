import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchCheckoutSession, fetchCurrentUser } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { Screen, Card, Button, Icon, type IconName } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentResult'>;
type Tier = 'FREE' | 'STANDARD' | 'PREMIUM';
type ViewState = 'confirming' | 'success' | 'pending' | 'canceled';

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 10;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Landing screen after a purchase: Stripe Checkout redirects here on web (`/payment/success?session_id=…`),
 * and the native IAP listener navigates here once the server has verified a store purchase.
 * The server is the source of truth — this screen only waits until the profile reflects the new tier.
 */
export const PaymentResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { result, session_id: sessionId, tier: verifiedTier } = route.params ?? {};
  const { refreshProfile, dailyTestStatus } = useAuth();
  const { t } = useLocale();
  const [state, setState] = useState<ViewState>(
    result === 'canceled' ? 'canceled' : result === 'pending' ? 'pending' : 'confirming'
  );
  const [tier, setTier] = useState<Tier | null>(null);

  useEffect(() => {
    if (result === 'canceled' || result === 'pending') return;
    let cancelled = false;

    async function confirm() {
      for (let attempt = 0; attempt < POLL_ATTEMPTS && !cancelled; attempt++) {
        try {
          if (sessionId) {
            const session = await fetchCheckoutSession(sessionId);
            if (session.status === 'expired') {
              setState('canceled');
              return;
            }
          }
          const me = await fetchCurrentUser();
          const currentTier: Tier = me?.user?.subscriptionTier ?? 'FREE';
          if (currentTier !== 'FREE' && (!verifiedTier || currentTier === verifiedTier)) {
            await refreshProfile();
            if (!cancelled) {
              setTier(currentTier);
              setState('success');
            }
            return;
          }
        } catch {
          // Transient network error: keep polling.
        }
        await wait(POLL_INTERVAL_MS);
      }
      if (!cancelled) {
        setState('pending');
        refreshProfile();
      }
    }

    confirm();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, sessionId, verifiedTier]);

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'ExamSetup' }] });
  const goToPlans = () =>
    navigation.reset({ index: 1, routes: [{ name: 'ExamSetup' }, { name: 'Subscription' }] });

  const tierName = tier === 'PREMIUM' ? 'Premium' : 'Standard';
  const content: Record<ViewState, { icon: IconName; color: string; bg: string; title: string; body: string }> = {
    confirming: {
      icon: 'time-outline',
      color: colors.navy,
      bg: colors.navySoft,
      title: t('payment.confirmingTitle'),
      body: t('payment.confirmingBody'),
    },
    success: {
      icon: 'checkmark',
      color: colors.success,
      bg: colors.successSoft,
      title: t('payment.successTitle', { tier: tierName }),
      body: t('payment.successBody', { count: dailyTestStatus?.baseLimit ?? '' }),
    },
    pending: {
      icon: 'hourglass-outline',
      color: colors.gold,
      bg: colors.goldSoft,
      title: t('payment.pendingTitle'),
      body: t('payment.pendingBody'),
    },
    canceled: {
      icon: 'close',
      color: colors.red,
      bg: colors.redSoft,
      title: t('payment.canceledTitle'),
      body: t('payment.canceledBody'),
    },
  };
  const c = content[state];

  return (
    <Screen>
      <View style={styles.center}>
        <Card style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: c.bg }]}>
            {state === 'confirming' ? (
              <ActivityIndicator size="large" color={c.color} />
            ) : (
              <Icon name={c.icon} size={32} color={c.color} />
            )}
          </View>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.body}>{c.body}</Text>

          {state !== 'confirming' && (
            <View style={styles.actions}>
              {state === 'canceled' ? (
                <Button title={t('payment.backToPlans')} size="lg" fullWidth onPress={goToPlans} />
              ) : (
                <Button title={t('payment.startTest')} size="lg" fullWidth icon="mic-outline" onPress={goHome} />
              )}
            </View>
          )}
        </Card>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: {
    ...type.title,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  body: {
    ...type.body,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: space.xl,
  },
});
