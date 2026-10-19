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
import { Screen, AppHeader, Card, Badge, Button, Icon } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    async function loadPlans() {
      try {
        const data = await fetchTierConfigs();
        setPlans(data.tiers);
      } catch (err: any) {
        Alert.alert('Feil', err.message || 'Kunne ikke hente abonnementsplaner');
      } finally {
        setIsLoading(false);
      }
    }
    loadPlans();
  }, []);

  const handleSubscribe = async (tier: 'STANDARD' | 'PREMIUM') => {
    if (!user) {
      Alert.alert(
        'Konto påkrevd',
        'Du må logge inn eller opprette en konto for å kjøpe et abonnement.',
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Logg inn', onPress: () => navigation.navigate('Auth') },
        ]
      );
      return;
    }

    setIsProcessing(true);
    try {
      const res = await createStripeCheckout(tier);
      if (res.url) {
        await Linking.openURL(res.url);
      }
    } catch (err: any) {
      Alert.alert('Feil under betaling', err.message || 'Kunne ikke åpne Stripe kasse');
    } finally {
      setIsProcessing(false);
    }
  };

  const freePlan = plans?.FREE || {
    priceCents: 0,
    dailyTestLimit: 1,
    features: ['1 test per dag', 'B1 og B2 temaer', 'AI-sensor og vurdering'],
  };

  const standard = plans?.STANDARD || {
    priceCents: 14900,
    dailyTestLimit: 5,
    features: ['5 tester per dag', 'B1 og B2 temaer', 'Prioritert AI stemme'],
  };

  const premium = plans?.PREMIUM || {
    priceCents: 29900,
    dailyTestLimit: 20,
    features: ['20 tester per dag', 'B1 og B2 temaer', 'Full historikk & uttaleanalyse', '24/7 tilgang'],
  };

  const currentTier = user?.subscriptionTier || 'FREE';

  return (
    <Screen>
      <AppHeader
        title="Abonnement"
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.title}>Velg ditt abonnement</Text>
            <Text style={styles.subtitle}>
              Få ubegrenset selvtillit til muntlig prøve med flere daglige øvingstester.
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
                    <Text style={styles.planName}>Gratis</Text>
                    {currentTier === 'FREE' && (
                      <Badge label="NÅVÆRENDE" tone="neutral" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    0 kr <Text style={styles.planPeriod}>/ mnd</Text>
                  </Text>
                </View>

                <Badge
                  label={`${freePlan.dailyTestLimit} test per dag`}
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
                      <Badge label="NÅVÆRENDE" tone="navy" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    {standard.priceCents / 100} kr <Text style={styles.planPeriod}>/ mnd</Text>
                  </Text>
                </View>

                <Badge
                  label={`${standard.dailyTestLimit} tester per dag`}
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
                  title={currentTier === 'STANDARD' ? 'Aktivt abonnement' : 'Velg Standard'}
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
                  <Badge label="MEST POPULÆR" tone="gold" icon="star" />
                  {currentTier === 'PREMIUM' && (
                    <Badge label="NÅVÆRENDE" tone="gold" />
                  )}
                </View>

                <View style={styles.planHeader}>
                  <Text style={[styles.planName, { color: colors.gold }]}>Premium</Text>
                  <Text style={styles.planPrice}>
                    {premium.priceCents / 100} kr <Text style={styles.planPeriod}>/ mnd</Text>
                  </Text>
                </View>

                <Badge
                  label={`${premium.dailyTestLimit} tester per dag (Ubegrenset)`}
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
                  title={currentTier === 'PREMIUM' ? 'Aktivt abonnement' : 'Velg Premium'}
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
