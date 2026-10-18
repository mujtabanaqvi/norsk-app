import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchTierConfigs, createStripeCheckout } from '../api';
import { useAuth } from '../hooks/useAuth';

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Tilbake</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Velg ditt abonnement</Text>
          <Text style={styles.subtitle}>
            Få ubegrenset selvtillit til muntlig prøve med flere daglige øvingstester.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.cardsContainer}>
            {/* Standard Plan */}
            <View style={styles.card}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>Standard</Text>
                <Text style={styles.planPrice}>
                  {standard.priceCents / 100} kr <Text style={styles.planPeriod}>/ mnd</Text>
                </Text>
              </View>
              <Text style={styles.badgeText}>🔥 {standard.dailyTestLimit} tester per dag</Text>
              <View style={styles.featuresList}>
                {standard.features?.map((f: string, i: number) => (
                  <Text key={i} style={styles.featureItem}>
                    ✓ {f}
                  </Text>
                ))}
              </View>
              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={() => handleSubscribe('STANDARD')}
                disabled={isProcessing}
              >
                <Text style={styles.subscribeButtonText}>Velg Standard</Text>
              </TouchableOpacity>
            </View>

            {/* Premium Plan */}
            <View style={[styles.card, styles.premiumCard]}>
              <View style={styles.popularTag}>
                <Text style={styles.popularTagText}>MEST POPULÆR</Text>
              </View>
              <View style={styles.planHeader}>
                <Text style={[styles.planName, { color: '#F59E0B' }]}>Premium</Text>
                <Text style={styles.planPrice}>
                  {premium.priceCents / 100} kr <Text style={styles.planPeriod}>/ mnd</Text>
                </Text>
              </View>
              <Text style={[styles.badgeText, { color: '#F59E0B' }]}>
                ⭐ {premium.dailyTestLimit} tester per dag (Ubegrenset)
              </Text>
              <View style={styles.featuresList}>
                {premium.features?.map((f: string, i: number) => (
                  <Text key={i} style={styles.featureItem}>
                    ✓ {f}
                  </Text>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.subscribeButton, styles.premiumButton]}
                onPress={() => handleSubscribe('PREMIUM')}
                disabled={isProcessing}
              >
                <Text style={[styles.subscribeButtonText, { color: '#0F172A' }]}>
                  Velg Premium
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
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
  header: {
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
  cardsContainer: {
    gap: 20,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  premiumCard: {
    borderColor: '#F59E0B',
    backgroundColor: '#1E2433',
    position: 'relative',
  },
  popularTag: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularTagText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  planName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  planPeriod: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '400',
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  featuresList: {
    gap: 8,
    marginBottom: 20,
  },
  featureItem: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
  },
  subscribeButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  premiumButton: {
    backgroundColor: '#F59E0B',
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

