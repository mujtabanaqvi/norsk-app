import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, fetchLearningProfile, fetchTopicsAndQuota, startExamSession } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_TAGS } from '../i18n';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamTheme,
  RootStackParamList,
} from '../types/exam';
import type { LearningInsight } from '../types/learning-profile';
import { TREND_ICON, TREND_LABEL_KEY } from '../lib/learning-profile-ui';
import { openSupportEmail, usePublicLinks } from '../lib/public-links';
import {
  Screen,
  Logo,
  Card,
  Badge,
  TierBadge,
  Button,
  Icon,
  LanguageToggle,
  type IconName,
} from '../components/ui';
import { colors, radius, shadow, space, tierColors, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamSetup'>;

type MenuItem = { icon: IconName; label: string; color?: string; onPress: () => void };

// Minimum audio quota required by backend (180 seconds / 3 minutes)
const MIN_REQUIRED_QUOTA_SECONDS = 180;

export const ExamSetupScreen: React.FC<Props> = ({ navigation }) => {
  const [targetLevel, setTargetLevel] = useState<CefrLevel>('B1');
  const [practiceMode, setPracticeMode] = useState<CoCandidateMode>('AI_PEER');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>('RANDOM');

  const [themes, setThemes] = useState<ExamTheme[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [learningInsight, setLearningInsight] = useState<LearningInsight | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  const { user, dailyTestStatus, logout, refreshProfile } = useAuth();
  const { t, locale } = useLocale();
  const publicLinks = usePublicLinks();

  // There is no self-service delete endpoint: the request goes to support (see the privacy policy, #slett-konto).
  const confirmDeleteAccount = (email: string) =>
    Alert.alert(t('support.deleteTitle'), t('support.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('support.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          openSupportEmail(locale, publicLinks.supportEmail, {
            subject: t('support.deleteSubject'),
            body: t('support.deleteMailBody', { email }),
          }),
      },
    ]);

  /**
   * Fetch theme catalog and remaining user audio quota from backend
   */
  const loadExamCatalog = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    try {
      const data = await fetchTopicsAndQuota();
      setThemes(data.themes || []);

      if (data.quota && typeof data.quota.remainingAudioSeconds === 'number') {
        setRemainingSeconds(data.quota.remainingAudioSeconds);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('setup.fetchError');
      setFetchError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadExamCatalog();
  }, [loadExamCatalog]);

  /**
   * Small progress summary from the learning profile. Non-blocking: if it fails the card
   * simply shows the empty hint. Re-fetched on focus so it updates after an exam.
   */
  const loadProgress = useCallback(async () => {
    if (!user) {
      setLearningInsight(null);
      return;
    }
    try {
      const res = await fetchLearningProfile();
      setLearningInsight(res.insight);
    } catch {
      // Keep whatever we had; the full profile screen surfaces errors.
    }
  }, [user]);

  useEffect(() => {
    loadProgress();
    return navigation.addListener('focus', loadProgress);
  }, [navigation, loadProgress]);

  // Keep the "tests today" card current after returning from an exam
  useEffect(() => navigation.addListener('focus', () => { refreshProfile(); }), [navigation, refreshProfile]);

  // Themes that have at least one question set for the selected CEFR level (B1 or B2)
  const filteredThemes = useMemo(() => {
    return themes.filter((t) => (t.setCounts?.[targetLevel] ?? 0) > 0);
  }, [themes, targetLevel]);

  // Keep 'RANDOM' selected by default; if a manual theme was chosen and no longer matches level, reset to 'RANDOM'
  useEffect(() => {
    if (filteredThemes.length > 0) {
      if (selectedThemeId === 'RANDOM') {
        return;
      }
      const existsInFiltered = filteredThemes.some((t) => t.id === selectedThemeId);
      if (!existsInFiltered) {
        setSelectedThemeId('RANDOM');
      }
    } else {
      setSelectedThemeId(null);
    }
  }, [filteredThemes, selectedThemeId]);

  /**
   * Format audio quota seconds into user-friendly minutes & seconds
   */
  const formattedQuota = useMemo(() => {
    if (remainingSeconds === null) return '-- min';
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    if (minutes === 0) {
      return t('setup.quotaSec', { sec: seconds });
    }
    return seconds > 0
      ? t('setup.quotaMinSec', { min: minutes, sec: seconds })
      : t('setup.quotaMin', { min: minutes });
  }, [remainingSeconds, t]);

  const hasInsufficientQuota =
    remainingSeconds !== null && remainingSeconds < MIN_REQUIRED_QUOTA_SECONDS;

  /**
   * Friendly upsell when today's tests are used up. Premium is the top tier, so it only
   * gets the reset notice; everyone else is offered the subscription screen.
   */
  const showDailyLimitReached = () => {
    if (user?.subscriptionTier === 'PREMIUM') {
      Alert.alert(t('setup.dailyLimitTitle'), t('setup.dailyLimitBodyTopTier'));
      return;
    }
    Alert.alert(t('setup.dailyLimitTitle'), t('setup.dailyLimitBody'), [
      { text: t('setup.dailyLimitLater'), style: 'cancel' },
      { text: t('setup.dailyLimitUpgrade'), onPress: () => navigation.navigate('Subscription') },
    ]);
  };

  /**
   * Call POST /api/exam/start and navigate to Active Exam Room
   */
  const handleStartExam = async () => {
    if (!user) {
      Alert.alert(t('setup.loginRequiredTitle'), t('setup.loginRequiredBody'), [
        { text: t('common.login'), onPress: () => navigation.navigate('Auth') },
      ]);
      return;
    }

    if (!selectedThemeId || filteredThemes.length === 0) {
      Alert.alert(t('setup.chooseThemeTitle'), t('setup.noThemesForLevel'));
      return;
    }

    if (hasInsufficientQuota) {
      Alert.alert(
        t('setup.insufficientTitle'),
        t('setup.insufficientBody', {
          quota: formattedQuota,
          minutes: MIN_REQUIRED_QUOTA_SECONDS / 60,
        })
      );
      return;
    }

    if (dailyTestStatus && dailyTestStatus.remainingToday <= 0) {
      showDailyLimitReached();
      return;
    }

    setIsStarting(true);
    try {
      const result = await startExamSession({
        themeId: selectedThemeId,
        level: targetLevel,
        coCandidateMode: practiceMode,
      });

      const resolvedTopicTitle = result.topic?.titleNo || t('setup.fallbackTopic');
      const resolvedMonologuePrompt = result.topic?.monologuePromptNo;
      const resolvedDiscussionPrompt = result.topic?.discussionPromptNo;

      // Navigate to the Active Exam Room Screen
      navigation.navigate('ExamRoom', {
        sessionId: result.sessionId,
        level: targetLevel,
        coCandidateMode: practiceMode,
        topicTitle: resolvedTopicTitle,
        monologuePromptNo: resolvedMonologuePrompt,
        discussionPromptNo: resolvedDiscussionPrompt,
        initialReplies: result.replies || [],
        initialTranscript: result.transcript || [],
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DAILY_LIMIT_REACHED') {
        // Our cached count was stale; sync it so the card shows the limit too.
        refreshProfile();
        showDailyLimitReached();
        return;
      }
      const message = err instanceof Error ? err.message : t('setup.startFailed');
      Alert.alert(t('setup.startFailedTitle'), message);
    } finally {
      setIsStarting(false);
    }
  };

  const dailyProgressRatio = useMemo(() => {
    if (!dailyTestStatus || !dailyTestStatus.totalAllowedToday) return 0;
    const used = Math.min(dailyTestStatus.testsUsedToday, dailyTestStatus.totalAllowedToday);
    return used / dailyTestStatus.totalAllowedToday;
  }, [dailyTestStatus]);

  const selectedTheme = useMemo(
    () => filteredThemes.find((th) => th.id === selectedThemeId) ?? null,
    [filteredThemes, selectedThemeId]
  );

  const selectedThemeDescription =
    selectedThemeId === 'RANDOM'
      ? t('setup.randomDesc', { level: targetLevel, count: filteredThemes.length })
      : selectedTheme
        ? [selectedTheme.descriptionNo, t('setup.setCount', { count: selectedTheme.setCounts?.[targetLevel] ?? 0 })]
            .filter(Boolean)
            .join(' · ')
        : '';

  const isPremium = user?.subscriptionTier === 'PREMIUM';
  const openProgress = () => navigation.navigate(user ? 'LearningProfile' : 'Auth');

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: t('setup.menuPractice'),
      items: [
        { icon: 'help-circle-outline', label: t('nav.howTo'), onPress: () => navigation.navigate('HowTo') },
        { icon: 'stats-chart-outline', label: t('nav.profile'), onPress: openProgress },
        { icon: 'gift-outline', label: t('nav.referral'), onPress: () => navigation.navigate('Referral') },
      ],
    },
    {
      title: t('setup.menuHelp'),
      items: [
        { icon: 'mail-outline', label: t('nav.support'), onPress: () => openSupportEmail(locale, publicLinks.supportEmail) },
        { icon: 'document-text-outline', label: t('nav.terms'), onPress: () => navigation.navigate('Terms') },
        { icon: 'shield-checkmark-outline', label: t('nav.privacy'), onPress: () => navigation.navigate('PrivacyPolicy') },
      ],
    },
    ...(user
      ? [
          {
            title: t('setup.menuAccount'),
            items: [
              { icon: 'trash-outline' as IconName, label: t('nav.deleteAccount'), onPress: () => confirmDeleteAccount(user.email) },
              { icon: 'log-out-outline' as IconName, label: t('setup.a11yLogout'), color: colors.red, onPress: logout },
            ],
          },
        ]
      : []),
  ];

  const quickActions: { icon: IconName; label: string; tint: string; iconColor: string; onPress: () => void }[] = [
    { icon: 'gift-outline', label: t('setup.quickReferral'), tint: colors.redSoft, iconColor: colors.red, onPress: () => navigation.navigate('Referral') },
    { icon: 'stats-chart-outline', label: t('setup.quickProgress'), tint: colors.navySoft, iconColor: colors.navy, onPress: openProgress },
    { icon: 'help-circle-outline', label: t('setup.quickHowTo'), tint: colors.navySoft, iconColor: colors.navy, onPress: () => navigation.navigate('HowTo') },
    {
      icon: 'star',
      label: isPremium ? t('setup.quickMyPlan') : t('setup.quickUpgrade'),
      tint: colors.goldSoft,
      iconColor: colors.gold,
      onPress: () => navigation.navigate('Subscription'),
    },
  ];

  const selectionSummary = [
    targetLevel,
    practiceMode === 'AI_PEER' ? t('setup.aiPeerShort') : t('setup.humanShort'),
    selectedThemeId === 'RANDOM' ? t('setup.randomShort') : selectedTheme?.titleNo,
  ]
    .filter(Boolean)
    .join(' · ');

  const stats = learningInsight?.stats;
  const trend = stats ? TREND_ICON[stats.overallTrend] : null;
  const tierRing = user ? tierColors(user.subscriptionTier) : null;
  const closeMenuThen = (action: () => void) => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <Screen>
      {/* Header: brand on the left, at most two fixed-size controls on the right so it never overflows */}
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Logo size={46} withWordmark />
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {t('setup.headerSubtitle')}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {!user && (
            <Button
              title={t('common.login')}
              variant="outline"
              size="sm"
              icon="person-outline"
              onPress={() => navigation.navigate('Auth')}
            />
          )}

          <Pressable
            onPress={() => setIsMenuOpen(true)}
            style={({ pressed }) => [
              styles.iconBtn,
              user && tierRing && [styles.avatarBtn, { borderColor: tierRing.border }],
              pressed && styles.iconBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('setup.accountMenu')}
          >
            {user ? (
              <>
                <Text style={styles.avatarInitial}>
                  {(user.name || user.email).trim().charAt(0).toUpperCase()}
                </Text>
                {isPremium && (
                  <View style={styles.avatarStar}>
                    <Icon name="star" size={9} color={colors.white} />
                  </View>
                )}
              </>
            ) : (
              <Icon name="menu" size={22} color={colors.navy} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Account & settings sheet: slides up from the bottom and scrolls, so it always fits on screen */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setIsMenuOpen(false)} accessibilityLabel={t('common.hide')} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              {user ? (
                <View style={styles.accountCard}>
                  <View style={styles.accountRow}>
                    <View style={[styles.accountAvatar, tierRing && { borderColor: tierRing.border }]}>
                      <Text style={styles.avatarInitial}>
                        {(user.name || user.email).trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.accountMeta}>
                      <Text style={styles.accountName} numberOfLines={1}>
                        {user.name || user.email.split('@')[0]}
                      </Text>
                      <Text style={styles.accountEmail} numberOfLines={1}>
                        {user.email}
                      </Text>
                    </View>
                    <TierBadge tier={user.subscriptionTier} />
                  </View>
                  <Button
                    title={isPremium ? t('setup.managePlan') : t('setup.upgradePlan')}
                    variant={isPremium ? 'outline' : 'gold'}
                    size="sm"
                    icon="star"
                    fullWidth
                    onPress={() => closeMenuThen(() => navigation.navigate('Subscription'))}
                  />
                </View>
              ) : (
                <Button
                  title={t('common.login')}
                  variant="primary"
                  icon="person-outline"
                  fullWidth
                  onPress={() => closeMenuThen(() => navigation.navigate('Auth'))}
                />
              )}

              <View style={styles.languageRow}>
                <View style={styles.languageLabelGroup}>
                  <Icon name="language-outline" size={20} color={colors.navy} />
                  <Text style={styles.menuItemText}>{t('common.language')}</Text>
                </View>
                <LanguageToggle />
              </View>

              {menuSections.map((section) => (
                <View key={section.title} style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>{section.title}</Text>
                  <View style={styles.menuGroup}>
                    {section.items.map((item, index) => (
                      <Pressable
                        key={item.label}
                        onPress={() => closeMenuThen(item.onPress)}
                        style={({ pressed }) => [
                          styles.menuItem,
                          index > 0 && styles.menuItemBorder,
                          pressed && styles.menuItemPressed,
                        ]}
                        accessibilityRole="button"
                      >
                        <Icon name={item.icon} size={20} color={item.color ?? colors.navy} />
                        <Text style={[styles.menuItemText, styles.menuItemLabel, item.color && { color: item.color }]}>
                          {item.label}
                        </Text>
                        <Icon name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Insufficient Quota Warning Banner */}
      {hasInsufficientQuota && (
        <View style={styles.warningBanner}>
          <Icon name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.warningBannerText}>
            {t('setup.lowQuotaBanner', { minutes: MIN_REQUIRED_QUOTA_SECONDS / 60 })}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.red} />
          <Text style={styles.loadingText}>{t('setup.loading')}</Text>
        </View>
      ) : fetchError ? (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Icon name="alert-circle" size={28} color={colors.danger} />
          </View>
          <Text style={styles.errorTitle}>{t('setup.connectionError')}</Text>
          <Text style={styles.errorMessage}>{fetchError}</Text>
          <Button
            title={t('common.retry')}
            variant="primary"
            icon="refresh"
            onPress={() => loadExamCatalog(false)}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadExamCatalog(true)}
              tintColor={colors.red}
              colors={[colors.red]}
            />
          }
        >
          <View style={styles.contentWrapper}>
            {/* Progress + quota summary card (tap to open the full learning profile) */}
            <Card
              style={styles.statsCard}
              onPress={user ? () => navigation.navigate('LearningProfile') : undefined}
              accessibilityLabel={t('profile.seeProgress')}
            >
              <View style={styles.progressHeaderRow}>
                <Text style={styles.statOverline}>{t('setup.progressTitle')}</Text>
                {user && (
                  <View style={styles.seeProgressRow}>
                    <Text style={styles.seeProgressText}>{t('profile.seeProgress')}</Text>
                    <Icon name="chevron-forward" size={16} color={colors.red} />
                  </View>
                )}
              </View>

              {stats && trend ? (
                <View style={styles.progressBody}>
                  <View style={styles.levelBlock}>
                    <Text style={styles.levelValue}>{stats.currentLevel}</Text>
                    <Text style={styles.statCaption}>{t('profile.currentLevel')}</Text>
                  </View>
                  <View style={styles.readinessBlock}>
                    <View style={styles.readinessLabelRow}>
                      <Text style={styles.readinessLabel} numberOfLines={1}>
                        {t('profile.readiness', { level: stats.targetLevel })}
                      </Text>
                      <Text style={styles.readinessLabel}>{stats.readinessPct}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, stats.readinessPct)}%`,
                            backgroundColor: stats.readinessPct >= 100 ? colors.success : colors.red,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.trendRow}>
                      <Icon name={trend.name} size={16} color={trend.color} />
                      <Text style={[styles.trendText, { color: trend.color }]}>
                        {t(TREND_LABEL_KEY[stats.overallTrend])}
                      </Text>
                      <Text style={styles.statCaption}>
                        {' · '}
                        {t('profile.average')} {stats.recentAvg.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.progressEmpty}>{t('setup.progressEmpty')}</Text>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statColumn}>
                  <Text style={styles.statOverline}>{t('setup.quotaOverline')}</Text>
                  <Text
                    style={[
                      styles.statValue,
                      hasInsufficientQuota && { color: colors.danger },
                    ]}
                  >
                    {formattedQuota}
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statColumn}>
                  <Text style={styles.statOverline}>{t('setup.dailyOverline')}</Text>
                  <View style={styles.dailyRow}>
                    <Text style={styles.statValue}>
                      {dailyTestStatus
                        ? `${dailyTestStatus.testsUsedToday} / ${dailyTestStatus.totalAllowedToday}`
                        : '--'}
                    </Text>
                    {dailyTestStatus && (
                      <View style={[styles.progressTrack, styles.dailyTrack]}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.round(dailyProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                  <Text style={styles.statCaption} numberOfLines={1}>
                    {dailyTestStatus
                      ? dailyTestStatus.remainingToday > 0
                        ? t('setup.remainingToday', { count: dailyTestStatus.remainingToday })
                        : t('setup.limitReached')
                      : t('setup.resetsMidnight')}
                    {dailyTestStatus && dailyTestStatus.bonusTests > 0
                      ? dailyTestStatus.bonusExpiresAt
                        ? t('setup.bonusUntil', {
                            count: dailyTestStatus.bonusTests,
                            date: new Date(dailyTestStatus.bonusExpiresAt).toLocaleDateString(
                              LOCALE_TAGS[locale],
                              { day: 'numeric', month: 'short' }
                            ),
                          })
                        : t('setup.bonus', { count: dailyTestStatus.bonusTests })
                      : ''}
                  </Text>
                </View>
              </View>

              {dailyTestStatus && dailyTestStatus.remainingToday === 0 && (
                <View style={styles.unlockRow}>
                  <Text style={styles.unlockHint}>{t('setup.limitReachedHint')}</Text>
                  <Button
                    title={t('setup.unlockMore')}
                    variant="gold"
                    size="sm"
                    icon="star"
                    onPress={() => navigation.navigate('Subscription')}
                  />
                </View>
              )}
            </Card>

            {/* Quick actions: the most-used shortcuts, one tap from the home screen */}
            <View style={styles.quickActionsRow}>
              {quickActions.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: action.tint }]}>
                    <Icon name={action.icon} size={22} color={action.iconColor} />
                  </View>
                  <Text style={styles.quickActionLabel} numberOfLines={2}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Section 1: Target Level Selector (Segmented Control) */}
            <View style={styles.section}>
              <Text style={styles.sectionOverline}>{t('setup.step1')}</Text>
              <View style={styles.segmentedControl}>
                {(['B1', 'B2'] as CefrLevel[]).map((level) => {
                  const isSelected = targetLevel === level;
                  return (
                    <Pressable
                      key={level}
                      style={[
                        styles.segmentOption,
                        isSelected && styles.segmentOptionSelected,
                      ]}
                      onPress={() => setTargetLevel(level)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityHint={level === 'B1' ? t('setup.levelB1Desc') : t('setup.levelB2Desc')}
                    >
                      <Text
                        style={[
                          styles.segmentTitle,
                          isSelected && styles.segmentTitleSelected,
                        ]}
                      >
                        {t('setup.levelLabel', { level })}
                      </Text>
                      <Text
                        style={[
                          styles.segmentSubtitle,
                          isSelected && styles.segmentSubtitleSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {level === 'B1' ? t('setup.levelB1Desc') : t('setup.levelB2Desc')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section 2: Practice Mode Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionOverline}>{t('setup.step2')}</Text>
              <View style={styles.segmentedControl}>
                {(
                  [
                    { mode: 'AI_PEER', icon: 'sparkles-outline', label: t('setup.aiPeerShort'), a11y: t('setup.aiPeerTitle') },
                    { mode: 'HUMAN_LOCAL', icon: 'people-outline', label: t('setup.humanShort'), a11y: t('setup.humanTitle') },
                  ] as const
                ).map((opt) => {
                  const isSelected = practiceMode === opt.mode;
                  return (
                    <Pressable
                      key={opt.mode}
                      style={[
                        styles.segmentOption,
                        styles.segmentOptionRow,
                        isSelected && styles.segmentOptionSelected,
                      ]}
                      onPress={() => setPracticeMode(opt.mode)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={opt.a11y}
                    >
                      <Icon
                        name={opt.icon}
                        size={20}
                        color={isSelected ? colors.white : colors.navy}
                      />
                      <Text
                        style={[
                          styles.segmentModeTitle,
                          isSelected && styles.segmentTitleSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.modeHintRow}>
                <Badge
                  label={practiceMode === 'AI_PEER' ? t('setup.aiPeerBadge') : t('setup.humanBadge')}
                  tone={practiceMode === 'AI_PEER' ? 'red' : 'navy'}
                />
              </View>
              <Text style={styles.modeCardDescription} numberOfLines={3}>
                {practiceMode === 'AI_PEER' ? t('setup.aiPeerDesc') : t('setup.humanDesc')}
              </Text>
            </View>

            {/* Section 3: Theme Selection (horizontal carousel) */}
            <View style={styles.section}>
              <View style={styles.topicSectionHeader}>
                <Text style={[styles.sectionOverline, styles.noMargin]}>{t('setup.step3')}</Text>
                <Text style={styles.topicCounter}>
                  {t('setup.themesForLevel', { count: filteredThemes.length, level: targetLevel })}
                </Text>
              </View>

              {filteredThemes.length === 0 ? (
                <Card style={styles.emptyTopicsBox}>
                  <Text style={styles.emptyTopicsText}>
                    {t('setup.noThemesFound', { level: targetLevel })}
                  </Text>
                </Card>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.themeScroller}
                    contentContainerStyle={styles.themeRow}
                  >
                    <Card
                      selected={selectedThemeId === 'RANDOM'}
                      onPress={() => setSelectedThemeId('RANDOM')}
                      style={styles.themeChip}
                      accessibilityLabel={t('setup.randomTitle')}
                    >
                      <View style={styles.themeChipTop}>
                        <Icon name="shuffle" size={21} color={colors.red} />
                        {selectedThemeId === 'RANDOM' && (
                          <Icon name="checkmark-circle" size={20} color={colors.red} />
                        )}
                      </View>
                      <Text style={styles.themeChipTitle} numberOfLines={2}>
                        {t('setup.randomTitle')}
                      </Text>
                      <Text style={styles.themeChipMeta} numberOfLines={1}>
                        {t('setup.themesForLevel', { count: filteredThemes.length, level: targetLevel })}
                      </Text>
                    </Card>

                    {filteredThemes.map((theme) => {
                      const isSelected = selectedThemeId === theme.id;
                      const setCount = theme.setCounts?.[targetLevel] ?? 0;
                      return (
                        <Card
                          key={theme.id}
                          selected={isSelected}
                          onPress={() => setSelectedThemeId(theme.id)}
                          style={styles.themeChip}
                          accessibilityLabel={theme.titleNo}
                        >
                          <View style={styles.themeChipTop}>
                            <Badge label={targetLevel} tone="navy" />
                            {isSelected && (
                              <Icon name="checkmark-circle" size={20} color={colors.red} />
                            )}
                          </View>
                          <Text style={styles.themeChipTitle} numberOfLines={2}>
                            {theme.titleNo}
                          </Text>
                          <Text style={styles.themeChipMeta} numberOfLines={1}>
                            {t('setup.setCountShort', { count: setCount })}
                          </Text>
                        </Card>
                      );
                    })}
                  </ScrollView>

                  {!!selectedThemeDescription && (
                    <Text style={styles.themeDescription} numberOfLines={3}>
                      {selectedThemeDescription}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Sticky Footer Start Button */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          {!!selectionSummary && (
            <Text style={styles.footerSummary} numberOfLines={1}>
              {selectionSummary}
            </Text>
          )}
          <Button
            title={isStarting ? t('setup.starting') : t('setup.start')}
            variant="primary"
            size="lg"
            icon="mic"
            fullWidth
            loading={isStarting}
            disabled={isStarting || !selectedThemeId || hasInsufficientQuota}
            onPress={handleStartExam}
          />
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  brandBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerSubtitle: {
    ...type.caption,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.navySoft,
  },
  avatarBtn: {
    backgroundColor: colors.surface,
    borderWidth: 2,
  },
  avatarInitial: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  avatarStar: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '85%',
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
    ...shadow.raised,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: space.sm,
  },
  sheetContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.md,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountMeta: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    ...type.bodyStrong,
  },
  accountEmail: {
    ...type.caption,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  languageLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  menuSection: {
    gap: space.xs,
  },
  menuSectionTitle: {
    ...type.overline,
    marginLeft: space.xs,
  },
  menuGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  menuItemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  menuItemText: {
    ...type.bodyStrong,
    fontSize: 14,
  },
  menuItemLabel: {
    flex: 1,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.lg,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
  },
  warningBannerText: {
    ...type.caption,
    color: colors.warning,
    fontWeight: '600',
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.lg,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  statsCard: {
    marginBottom: space.lg,
    padding: space.md,
    gap: space.sm,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeProgressText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '700',
  },
  progressBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  levelBlock: {
    alignItems: 'center',
    minWidth: 64,
  },
  levelValue: {
    ...type.title,
    fontWeight: '800',
  },
  readinessBlock: {
    flex: 1,
    gap: 4,
  },
  readinessLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  readinessLabel: {
    ...type.caption,
    color: colors.text,
    fontWeight: '700',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressEmpty: {
    ...type.caption,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statColumn: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
    marginHorizontal: space.md,
  },
  statOverline: {
    ...type.overline,
    marginBottom: 2,
  },
  statValue: {
    ...type.heading,
    fontWeight: '800',
  },
  statCaption: {
    ...type.caption,
    fontSize: 12,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dailyTrack: {
    flex: 1,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.navySoft,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.red,
    borderRadius: radius.pill,
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  unlockHint: {
    ...type.caption,
    color: colors.warning,
    flex: 1,
  },
  section: {
    marginBottom: space.lg,
  },
  sectionOverline: {
    ...type.overline,
    color: colors.navy,
    marginBottom: space.sm,
  },
  noMargin: {
    marginBottom: 0,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  segmentOption: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 11,
  },
  segmentOptionSelected: {
    backgroundColor: colors.red,
  },
  segmentTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  segmentModeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  segmentTitleSelected: {
    color: colors.white,
  },
  segmentSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  segmentSubtitleSelected: {
    color: colors.white,
  },
  modeHintRow: {
    flexDirection: 'row',
    marginTop: space.sm,
  },
  modeCardDescription: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 6,
  },
  topicSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  topicCounter: {
    ...type.caption,
  },
  emptyTopicsBox: {
    padding: space.xl,
    alignItems: 'center',
  },
  emptyTopicsText: {
    ...type.body,
  },
  themeScroller: {
    // Let the carousel run edge to edge inside the padded scroll view.
    marginHorizontal: -space.lg,
  },
  themeRow: {
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  themeChip: {
    width: 158,
    padding: space.md,
    gap: 6,
  },
  themeChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 22,
  },
  themeChipTitle: {
    ...type.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
    minHeight: 38,
  },
  themeChipMeta: {
    ...type.caption,
    fontSize: 12,
  },
  themeDescription: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: space.sm,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerSummary: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: space.sm,
  },
  footerInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
  loadingText: {
    ...type.body,
    marginTop: space.md,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  errorTitle: {
    ...type.title,
    color: colors.danger,
    marginBottom: space.xs,
  },
  errorMessage: {
    ...type.body,
    textAlign: 'center',
    marginBottom: space.lg,
  },
});
