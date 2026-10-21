import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchTierConfigs, createStripeCheckout, PurchaseVerificationError } from '../api';
import {
  buySubscription,
  getSubscriptionProducts,
  isIapSupported,
  openManageSubscriptions,
  restorePurchases,
} from '../lib/iap';
import type { PaidTier } from '../lib/iap-products';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { Screen, AppHeader, Card, Badge, Button, Icon } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { user, refreshProfile } = useAuth();
  const { t, strings } = useLocale();
  const [plans, setPlans] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [storePrices, setStorePrices] = useState<Partial<Record<PaidTier, string>>>({});

  // Native builds show the store's localized price, which is what the user is actually charged.
  useEffect(() => {
    if (!isIapSupported) return;
    getSubscriptionProducts()
      .then((products) =>
        setStorePrices({
          STANDARD: products.STANDARD?.displayPrice,
          PREMIUM: products.PREMIUM?.displayPrice,
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function loadPlans() {
      try {
        const data = await fetchTierConfigs();
        setPlans(data.tiers);
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message || t('subscription.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    }
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProvider = user?.activeSubscriptionProvider ?? null;
  const thisPlatformProvider = Platform.OS === 'ios' ? 'APPLE' : Platform.OS === 'android' ? 'GOOGLE' : 'STRIPE';
  const managedElsewhere = activeProvider !== null && activeProvider !== thisPlatformProvider;
  const storeLabel = (provider: string) =>
    provider === 'APPLE'
      ? t('subscription.storeApple')
      : provider === 'GOOGLE'
        ? t('subscription.storeGoogle')
        : t('subscription.storeWeb');

  const handleSubscribe = async (tier: PaidTier) => {
    if (!user) {
      Alert.alert(t('subscription.accountRequiredTitle'), t('subscription.accountRequiredBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.login'), onPress: () => navigation.navigate('Auth') },
      ]);
      return;
    }

    setIsProcessing(true);
    try {
      if (isIapSupported) {
        if (!user.iapAccountToken) throw new Error(t('subscription.storeUnavailable'));
        // The outcome is delivered to the purchase listener in App.tsx, which opens PaymentResult.
        await buySubscription(tier, user.iapAccountToken);
      } else if (Platform.OS !== 'web') {
        // Native app without the store module (e.g. Expo Go): purchases need a development build.
        throw new Error(t('subscription.storeUnavailable'));
      } else {
        const origin = window.location.origin;
        const res = await createStripeCheckout(
          tier,
          `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          `${origin}/payment/canceled`
        );
        if (res.url) {
          window.location.assign(res.url);
          return; // Keep the spinner while the browser navigates to Stripe.
        }
      }
    } catch (err: any) {
      Alert.alert(t('subscription.paymentErrorTitle'), err.message || t('subscription.paymentErrorBody'));
    }
    setIsProcessing(false);
  };

  const handleRestore = async () => {
    setIsProcessing(true);
    try {
      const result = await restorePurchases();
      await refreshProfile();
      if (result && result.tier !== 'FREE') {
        Alert.alert(t('subscription.restoreDoneTitle'), t('subscription.restoreDoneBody'));
      } else {
        Alert.alert(t('subscription.restore'), t('subscription.restoreNone'));
      }
    } catch (err: any) {
      const message =
        err instanceof PurchaseVerificationError && err.code === 'OWNED_BY_OTHER_ACCOUNT'
          ? t('subscription.ownedByOtherAccount')
          : err.message || t('subscription.storeUnavailable');
      Alert.alert(t('common.error'), message);
    } finally {
      setIsProcessing(false);
    }
  };

  const priceLabel = (tier: PaidTier, priceCents: number) => storePrices[tier] ?? `${priceCents / 100} kr`;

  const freePlan = plans?.FREE || {
    priceCents: 0,
    dailyTestLimit: 1,
    features: strings.subscription.freeFeatures,
  };

  const standard = plans?.STANDARD || {
    priceCents: 14900,
    dailyTestLimit: 5,
    features: strings.subscription.standardFeatures,
  };

  const premium = plans?.PREMIUM || {
    priceCents: 29900,
    dailyTestLimit: 20,
    features: strings.subscription.premiumFeatures,
  };

  const currentTier = user?.subscriptionTier || 'FREE';

  return (
    <Screen>
      <AppHeader
        title={t('nav.subscription')}
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.title}>{t('subscription.title')}</Text>
            <Text style={styles.subtitle}>
              {t('subscription.subtitle')}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.red} />
            </View>
          ) : (
            <View style={styles.cardsContainer}>
              {managedElsewhere && activeProvider && (
                <Card style={styles.noticeCard}>
                  <Icon name="information-circle-outline" size={20} color={colors.navy} />
                  <Text style={styles.noticeText}>
                    {t('subscription.managedBy', { store: storeLabel(activeProvider) })}
                  </Text>
                </Card>
              )}

              {/* Free Plan */}
              <Card style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleGroup}>
                    <Text style={styles.planName}>{t('subscription.free')}</Text>
                    {currentTier === 'FREE' && (
                      <Badge label={t('subscription.current')} tone="neutral" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    0 kr <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
                  </Text>
                </View>

                <Badge
                  label={t('subscription.testsPerDayOne', { count: freePlan.dailyTestLimit })}
                  tone="neutral"
                  icon="mic-outline"
                  style={styles.quotaBadge}
                />

                <View style={styles.featuresList}>
                  {freePlan.features?.map((f: string, i: number) => (
                    <View key={i} style={styles.featureRow}>
                      <Icon name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              {/* Standard Plan */}
              <Card style={[styles.planCard, styles.standardCard]}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleGroup}>
                    <Text style={styles.planName}>Standard</Text>
                    {currentTier === 'STANDARD' && (
                      <Badge label={t('subscription.current')} tone="navy" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    {priceLabel('STANDARD', standard.priceCents)} <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
                  </Text>
                </View>

                <Badge
                  label={t('subscription.testsPerDay', { count: standard.dailyTestLimit })}
                  tone="navy"
                  icon="flash"
                  style={styles.quotaBadge}
                />

                <View style={styles.featuresList}>
                  {standard.features?.map((f: string, i: number) => (
                    <View key={i} style={styles.featureRow}>
                      <Icon name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>

                <Button
                  title={currentTier === 'STANDARD' ? t('subscription.active') : t('subscription.chooseStandard')}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={isProcessing || managedElsewhere || currentTier === 'STANDARD'}
                  loading={isProcessing}
                  onPress={() => handleSubscribe('STANDARD')}
                />
              </Card>

              {/* Premium Plan */}
              <Card style={[styles.planCard, styles.premiumCard]}>
                <View style={styles.popularRow}>
                  <Badge label={t('subscription.mostPopular')} tone="gold" icon="star" />
                  {currentTier === 'PREMIUM' && (
                    <Badge label={t('subscription.current')} tone="gold" />
                  )}
                </View>

                <View style={styles.planHeader}>
                  <Text style={[styles.planName, { color: colors.gold }]}>Premium</Text>
                  <Text style={styles.planPrice}>
                    {priceLabel('PREMIUM', premium.priceCents)} <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
                  </Text>
                </View>

                <Badge
                  label={t('subscription.testsPerDayUnlimited', { count: premium.dailyTestLimit })}
                  tone="gold"
                  icon="star"
                  style={styles.quotaBadge}
                />

                <View style={styles.featuresList}>
                  {premium.features?.map((f: string, i: number) => (
                    <View key={i} style={styles.featureRow}>
                      <Icon name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>

                <Button
                  title={currentTier === 'PREMIUM' ? t('subscription.active') : t('subscription.choosePremium')}
                  variant="gold"
                  size="lg"
                  fullWidth
                  icon="star"
                  disabled={isProcessing || managedElsewhere || currentTier === 'PREMIUM'}
                  loading={isProcessing}
                  onPress={() => handleSubscribe('PREMIUM')}
                />
              </Card>

              <View style={styles.footer}>
                {isIapSupported && (
                  <View style={styles.footerActions}>
                    <Button
                      title={t('subscription.restore')}
                      variant="ghost"
                      size="sm"
                      disabled={isProcessing}
                      onPress={handleRestore}
                    />
                    {activeProvider === thisPlatformProvider && (
                      <Button
                        title={t('subscription.manage')}
                        variant="ghost"
                        size="sm"
                        onPress={() => openManageSubscriptions(currentTier === 'FREE' ? undefined : currentTier)}
                      />
                    )}
                  </View>
                )}
                <Text style={styles.disclosure}>
                  {t('subscription.disclosure', { store: storeLabel(thisPlatformProvider) })}
                </Text>
                <View style={styles.footerActions}>
                  <Button
                    title={t('subscription.termsLink')}
                    variant="ghost"
                    size="sm"
                    onPress={() => navigation.navigate('Terms')}
                  />
                  <Button
                    title={t('subscription.privacyLink')}
                    variant="ghost"
                    size="sm"
                    onPress={() => navigation.navigate('PrivacyPolicy')}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  container: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  hero: {
    marginBottom: space.xl,
  },
  title: {
    ...type.display,
    marginBottom: space.xs,
  },
  subtitle: {
    ...type.body,
  },
  loadingBox: {
    paddingVertical: space.xxxl,
    alignItems: 'center',
  },
  cardsContainer: {
    gap: space.lg,
  },
  planCard: {
    padding: space.xl,
  },
  standardCard: {
    borderColor: colors.navy,
    borderWidth: 1.5,
  },
  premiumCard: {
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  popularRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space.sm,
  },
  planTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  planName: {
    ...type.title,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  quotaBadge: {
    marginBottom: space.lg,
  },
  featuresList: {
    gap: space.sm,
    marginBottom: space.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  featureText: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: colors.navySoft,
  },
  noticeText: {
    ...type.body,
    color: colors.navy,
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    gap: space.sm,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  disclosure: {
    ...type.caption,
    textAlign: 'center',
  },
});
