import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchReferrals } from '../api';
import { useAuth } from '../hooks/useAuth';
import { Screen, AppHeader, Card, Badge, Button, Icon } from '../components/ui';
import { colors, radius, space, type } from '../theme';

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
        message: `Hei! Øv til muntlig Norskprøve med meg på Snakkly. Registrer deg med vervekoden min ${data.referralCode} for å få tilgang!`,
      });
    } catch (err: any) {
      console.error('Share error:', err);
    }
  };

  if (!user) {
    return (
      <Screen>
        <AppHeader
          title="Verv en venn"
          onBack={() => navigation.goBack()}
          bordered
        />
        <View style={styles.emptyContainer}>
          <View style={styles.giftCircle}>
            <Icon name="gift-outline" size={32} color={colors.red} />
          </View>
          <Text style={styles.title}>Verv en venn</Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: space.xl }]}>
            Logg inn for å få din personlige vervekode og motta ekstra daglige tester i 1 uke for hver venn du verver!
          </Text>
          <Button
            title="Logg inn / Registrer deg"
            variant="primary"
            size="lg"
            icon="person-outline"
            onPress={() => navigation.navigate('Auth')}
          />
        </View>
      </Screen>
    );
  }

  const bonusPerDay = data?.referralSettings?.bonusDailyTests || 2;
  const durationDays = data?.referralSettings?.durationDays || 7;

  return (
    <Screen>
      <AppHeader
        title="Verv en venn"
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.giftCircleSmall}>
                <Icon name="gift-outline" size={22} color={colors.red} />
              </View>
              <Text style={styles.title}>Verv en venn</Text>
            </View>
            <Text style={styles.subtitle}>
              Få +{bonusPerDay} ekstra tester per dag i {durationDays} dager for hver venn som registrerer seg med din kode!
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.red} />
            </View>
          ) : (
            <View style={styles.content}>
              {/* Referral Code Ticket Card */}
              <View style={styles.ticketCard}>
                <Text style={styles.codeLabel}>DIN PERSONLIGE VERVEKODE</Text>
                <Text selectable style={styles.codeValue}>
                  {data?.referralCode || '------'}
                </Text>
                <Button
                  title="Del kode med venner"
                  variant="primary"
                  size="lg"
                  icon="share-outline"
                  fullWidth
                  onPress={handleShare}
                />
              </View>

              {/* Stats Overview */}
              <Card style={styles.statsCard}>
                <View style={styles.statCol}>
                  <Text style={styles.statNumber}>{data?.stats?.totalReferredCount || 0}</Text>
                  <Text style={styles.statLabel}>Venner vervet</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View style={styles.statCol}>
                  <Text style={[styles.statNumber, { color: colors.success }]}>
                    +{data?.stats?.currentBonusTestsPerDay || 0}
                  </Text>
                  <Text style={styles.statLabel}>Ekstra tester i dag</Text>
                </View>
              </Card>

              {/* Referral History */}
              <Card>
                <Text style={styles.historyTitle}>Dine vervebonuser</Text>
                {data?.rewards && data.rewards.length > 0 ? (
                  data.rewards.map((r: any, idx: number) => {
                    const isActive = new Date(r.expiresAt) > new Date();
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.rewardItem,
                          idx === data.rewards.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View>
                          <Text style={styles.rewardItemText}>
                            +{r.bonusTestsPerDay} tester/dag
                          </Text>
                          <Text style={styles.rewardSubtext}>
                            Utløper: {new Date(r.expiresAt).toLocaleDateString('no-NO')}
                          </Text>
                        </View>
                        <Badge
                          label={isActive ? 'AKTIV' : 'UTLØPT'}
                          tone={isActive ? 'success' : 'neutral'}
                        />
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyHistoryText}>
                    Du har ingen aktive vervebonuser ennå. Del koden din for å låse opp ekstra tester!
                  </Text>
                )}
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
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  giftCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  giftCircleSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...type.display,
  },
  subtitle: {
    ...type.body,
  },
  emptyContainer: {
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxWidth: 480,
    alignSelf: 'center',
  },
  loadingBox: {
    paddingVertical: space.xxxl,
    alignItems: 'center',
  },
  content: {
    gap: space.lg,
  },
  ticketCard: {
    backgroundColor: colors.redSoft,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.red,
  },
  codeLabel: {
    ...type.overline,
    color: colors.red,
    marginBottom: space.sm,
  },
  codeValue: {
    color: colors.navy,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: space.lg,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xl,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  dividerVertical: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  statNumber: {
    ...type.title,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    ...type.caption,
  },
  historyTitle: {
    ...type.heading,
    marginBottom: space.md,
  },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rewardItemText: {
    ...type.bodyStrong,
  },
  rewardSubtext: {
    ...type.caption,
    marginTop: 2,
  },
  emptyHistoryText: {
    ...type.body,
    textAlign: 'center',
    paddingVertical: space.md,
  },
});
