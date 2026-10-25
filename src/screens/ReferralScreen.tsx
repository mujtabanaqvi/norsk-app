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
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { fetchReferrals } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_TAGS } from '../i18n';
import { Screen, AppHeader, Card, Badge, Button, Icon } from '../components/ui';
import { colors, radius, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Referral'>;

export const ReferralScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

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
        Alert.alert(t('common.error'), err.message || t('referral.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const bonusPerDay = data?.referralSettings?.bonusDailyTests || 2;
  const durationDays = data?.referralSettings?.durationDays || 7;

  const handleShare = async () => {
    if (!data?.referralCode) return;
    const params = { code: data.referralCode, bonus: bonusPerDay, days: durationDays };
    try {
      await Share.share({
        message: data.referralLink
          ? t('referral.shareLinkMessage', { ...params, link: data.referralLink })
          : t('referral.shareMessage', params),
      });
    } catch (err: any) {
      console.error('Share error:', err);
    }
  };

  const handleCopy = async (kind: 'link' | 'code') => {
    const value = kind === 'link' ? data?.referralLink : data?.referralCode;
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(kind);
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
  };

  if (!user) {
    return (
      <Screen>
        <AppHeader
          title={t('referral.title')}
          onBack={() => navigation.goBack()}
          bordered
        />
        <View style={styles.emptyContainer}>
          <View style={styles.giftCircle}>
            <Icon name="gift-outline" size={32} color={colors.red} />
          </View>
          <Text style={styles.title}>{t('referral.title')}</Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: space.xl }]}>
            {t('referral.loggedOutBody')}
          </Text>
          <Button
            title={t('referral.loginOrRegister')}
            variant="primary"
            size="lg"
            icon="person-outline"
            onPress={() => navigation.navigate('Auth')}
          />
        </View>
      </Screen>
    );
  }

  const welcomeBonus = data?.welcomeBonus;
  const welcomeBonusActive = welcomeBonus && new Date(welcomeBonus.expiresAt) > new Date();

  return (
    <Screen>
      <AppHeader
        title={t('referral.title')}
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
              <Text style={styles.title}>{t('referral.title')}</Text>
            </View>
            <Text style={styles.subtitle}>
              {t('referral.heroBody', { bonus: bonusPerDay, days: durationDays })}
            </Text>
            <View style={styles.validityNote}>
              <Icon name="time-outline" size={16} color={colors.red} />
              <Text style={styles.validityNoteText}>
                {t('referral.validityNote', { days: durationDays })}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.red} />
            </View>
          ) : (
            <View style={styles.content}>
              {/* Referral Code Ticket Card */}
              <View style={styles.ticketCard}>
                <Text style={styles.codeLabel}>{t('referral.codeLabel')}</Text>
                <Text selectable style={styles.codeValue}>
                  {data?.referralCode || '------'}
                </Text>
                {data?.referralLink ? (
                  <View style={styles.linkBox}>
                    <Text style={styles.linkLabel}>{t('referral.linkLabel')}</Text>
                    <Text selectable numberOfLines={1} style={styles.linkValue}>
                      {data.referralLink}
                    </Text>
                  </View>
                ) : null}
                <Button
                  title={data?.referralLink ? t('referral.shareLink') : t('referral.shareCode')}
                  variant="primary"
                  size="lg"
                  icon="share-outline"
                  fullWidth
                  onPress={handleShare}
                />
                <View style={styles.copyRow}>
                  {data?.referralLink ? (
                    <Button
                      title={copied === 'link' ? t('referral.copied') : t('referral.copyLink')}
                      variant="outline"
                      size="md"
                      icon={copied === 'link' ? 'checkmark' : 'link-outline'}
                      style={styles.copyButton}
                      onPress={() => handleCopy('link')}
                    />
                  ) : null}
                  <Button
                    title={copied === 'code' ? t('referral.copied') : t('referral.copyCode')}
                    variant="outline"
                    size="md"
                    icon={copied === 'code' ? 'checkmark' : 'copy-outline'}
                    style={styles.copyButton}
                    onPress={() => handleCopy('code')}
                  />
                </View>
              </View>

              {/* Welcome bonus for signing up with a friend's code */}
              {welcomeBonusActive ? (
                <Card style={styles.welcomeCard}>
                  <View style={styles.rewardItemBody}>
                    <Text style={styles.rewardItemText}>
                      {t('referral.welcomeBonus', { count: welcomeBonus.bonusTestsPerDay })}
                    </Text>
                    <Text style={styles.rewardSubtext}>
                      {t('referral.usableUntil', {
                        date: new Date(welcomeBonus.expiresAt).toLocaleDateString(LOCALE_TAGS[locale]),
                      })}
                    </Text>
                  </View>
                  <Badge label={t('referral.active')} tone="success" />
                </Card>
              ) : null}

              {/* Stats Overview */}
              <Card style={styles.statsCard}>
                <View style={styles.statCol}>
                  <Text style={styles.statNumber}>{data?.stats?.totalReferredCount || 0}</Text>
                  <Text style={styles.statLabel}>{t('referral.friendsReferred')}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View style={styles.statCol}>
                  <Text style={[styles.statNumber, { color: colors.success }]}>
                    +{data?.stats?.currentBonusTestsPerDay || 0}
                  </Text>
                  <Text style={styles.statLabel}>{t('referral.bonusToday')}</Text>
                </View>
              </Card>

              {/* Referral History */}
              <Card>
                <Text style={styles.historyTitle}>{t('referral.historyTitle')}</Text>
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
                        <View style={styles.rewardItemBody}>
                          <Text style={styles.rewardItemText}>
                            {t('referral.rewardTests', { count: r.bonusTestsPerDay })}
                          </Text>
                          <Text style={styles.rewardSubtext}>
                            {t('referral.usableUntil', {
                              date: new Date(r.expiresAt).toLocaleDateString(LOCALE_TAGS[locale]),
                            })}
                          </Text>
                        </View>
                        <Badge
                          label={isActive ? t('referral.active') : t('referral.expired')}
                          tone={isActive ? 'success' : 'neutral'}
                        />
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyHistoryText}>
                    {t('referral.empty')}
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
  validityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  validityNoteText: {
    ...type.caption,
    flex: 1,
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  rewardItemBody: {
    flex: 1,
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
  linkBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.lg,
  },
  linkLabel: {
    ...type.caption,
    marginBottom: 2,
  },
  linkValue: {
    ...type.bodyStrong,
    color: colors.navy,
  },
  copyRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
    width: '100%',
  },
  copyButton: {
    flex: 1,
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
