import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchTierConfigs, createStripeCheckout } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { Screen, AppHeader, Card, Badge, Button, Icon } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { t, strings } = useLocale();
  const [plans, setPlans] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

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

  const handleSubscribe = async (tier: 'STANDARD' | 'PREMIUM') => {
    if (!user) {
      Alert.alert(t('subscription.accountRequiredTitle'), t('subscription.accountRequiredBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.login'), onPress: () => navigation.navigate('Auth') },
      ]);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await createStripeCheckout(tier);
      if (res.url) {
        await Linking.openURL(res.url);
      }
    } catch (err: any) {
      Alert.alert(t('subscription.paymentErrorTitle'), err.message || t('subscription.paymentErrorBody'));
    } finally {
      setIsProcessing(false);
    }
  };

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
                    {standard.priceCents / 100} kr <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
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
                  disabled={isProcessing || currentTier === 'STANDARD'}
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
                    {premium.priceCents / 100} kr <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
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
                  disabled={isProcessing || currentTier === 'PREMIUM'}
                  loading={isProcessing}
                  onPress={() => handleSubscribe('PREMIUM')}
                />
              </Card>
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
});
