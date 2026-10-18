import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchReferrals } from '../api';
import { useAuth } from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Referral'>;

export const ReferralScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetchReferrals();
        setData(res);
      } catch (err: any) {
        Alert.alert('Feil', err.message || 'Kunne ikke hente verveopplysninger');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user]);

  const handleShare = async () => {
    if (!data?.referralCode) return;
    try {
      await Share.share({
        message: `Hei! Øv til muntlig Norskprøve med meg på Norsk App. Registrer deg med vervekoden min ${data.referralCode} for å få tilgang!`,
      });
    } catch (err: any) {
      console.error('Share error:', err);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.title}>Verv en venn</Text>
          <Text style={styles.subtitle}>
            Logg inn for å få din personlige vervekode og motta ekstra daglige tester i 1 uke for hver venn du verver!
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Auth')}
          >
            <Text style={styles.loginButtonText}>Logg inn / Registrer deg</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const bonusPerDay = data?.referralSettings?.bonusDailyTests || 2;
  const durationDays = data?.referralSettings?.durationDays || 7;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Tilbake</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Verv en venn 🎉</Text>
          <Text style={styles.subtitle}>
            Få +{bonusPerDay} ekstra tester per dag i {durationDays} dager for hver venn som registrerer seg med din kode!
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.content}>
            {/* Referral Code Box */}
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>DIN PERSONLIGE VERVEKODE</Text>
              <Text style={styles.codeValue}>{data?.referralCode || '------'}</Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                <Text style={styles.shareButtonText}>Del kode med venner</Text>
              </TouchableOpacity>
            </View>

            {/* Stats Overview */}
            <View style={styles.statsCard}>
              <View style={styles.statCol}>
                <Text style={styles.statNumber}>{data?.stats?.totalReferredCount || 0}</Text>
                <Text style={styles.statLabel}>Venner vervet</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View style={styles.statCol}>
                <Text style={[styles.statNumber, { color: '#10B981' }]}>
                  +{data?.stats?.currentBonusTestsPerDay || 0}
                </Text>
                <Text style={styles.statLabel}>Ekstra tester i dag</Text>
              </View>
            </View>

            {/* Referral History */}
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>Dine vervebonuser</Text>
              {data?.rewards && data.rewards.length > 0 ? (
                data.rewards.map((r: any, idx: number) => {
                  const isActive = new Date(r.expiresAt) > new Date();
                  return (
                    <View key={idx} style={styles.rewardItem}>
                      <View>
                        <Text style={styles.rewardItemText}>
                          +{r.bonusTestsPerDay} tester/dag
                        </Text>
                        <Text style={styles.rewardSubtext}>
                          Utløper: {new Date(r.expiresAt).toLocaleDateString('no-NO')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          isActive ? styles.badgeActive : styles.badgeExpired,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isActive ? styles.textActive : styles.textExpired,
                          ]}
                        >
                          {isActive ? 'AKTIV' : 'UTLØPT'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyHistoryText}>
                  Du har ingen aktive vervebonuser ennå. Del koden din for å låse opp ekstra tester!
                </Text>
              )}
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
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  loginButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  content: {
    gap: 20,
  },
  codeBox: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  codeLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeValue: {
    color: '#38BDF8',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  dividerVertical: {
    width: 1,
    height: 40,
    backgroundColor: '#334155',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  historyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  rewardItemText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  rewardSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeExpired: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textActive: {
    color: '#10B981',
  },
  textExpired: {
    color: '#64748B',
  },
  emptyHistoryText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 12,
  },
});

