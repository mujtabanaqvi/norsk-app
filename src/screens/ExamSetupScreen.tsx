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
import { fetchLearningProfile, fetchTopicsAndQuota, startExamSession } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamTheme,
  RootStackParamList,
} from '../types/exam';
import type { LearningInsight } from '../types/learning-profile';
import { TREND_ICON, TREND_LABEL_KEY } from '../lib/learning-profile-ui';
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
import { colors, radius, shadow, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamSetup'>;

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

  const { user, dailyTestStatus, logout } = useAuth();
  const { t } = useLocale();

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

  const menuItems: { icon: IconName; label: string; color?: string; onPress: () => void }[] = [
    { icon: 'help-circle-outline', label: t('nav.howTo'), onPress: () => navigation.navigate('HowTo') },
    { icon: 'gift-outline', label: t('nav.referral'), onPress: () => navigation.navigate('Referral') },
    { icon: 'star', label: t('setup.a11yUpgrade'), color: colors.gold, onPress: () => navigation.navigate('Subscription') },
    ...(user
      ? [{ icon: 'log-out-outline' as IconName, label: t('setup.a11yLogout'), color: colors.red, onPress: logout }]
      : []),
  ];

  const stats = learningInsight?.stats;
  const trend = stats ? TREND_ICON[stats.overallTrend] : null;

  return (
    <Screen>
      {/* Compact header: brand + the few actions used most; the rest live in the overflow menu */}
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Logo size={42} withWordmark />
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {t('setup.headerSubtitle')}{user ? ` · ${user.name || user.email.split('@')[0]}` : ''}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {user ? (
            <Pressable
              onPress={() => navigation.navigate('Subscription')}
              accessibilityRole="button"
              accessibilityLabel={t('nav.subscription')}
            >
              <TierBadge tier={user.subscriptionTier} />
            </Pressable>
          ) : (
            <Button
              title={t('common.login')}
              variant="outline"
              size="sm"
              icon="person-outline"
              onPress={() => navigation.navigate('Auth')}
            />
          )}

          <LanguageToggle />

          <Pressable
            onPress={() => setIsMenuOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('setup.more')}
          >
            <Icon name="ellipsis-horizontal" size={22} color={colors.navy} />
          </Pressable>
        </View>
      </View>

      {/* Overflow menu */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setIsMenuOpen(false)}>
          <View style={[styles.menuCard, { top: insets.top + 56 }]}>
            {menuItems.map((item, index) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setIsMenuOpen(false);
                  item.onPress();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  index > 0 && styles.menuItemBorder,
                  pressed && styles.menuItemPressed,
                ]}
                accessibilityRole="button"
              >
                <Icon name={item.icon} size={20} color={item.color ?? colors.navy} />
                <Text style={[styles.menuItemText, item.color === colors.red && { color: colors.red }]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
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
                      ? t('setup.bonus', { count: dailyTestStatus.bonusTests })
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  brandBlock: {
    flexShrink: 1,
    minWidth: 160,
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
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: space.lg,
    minWidth: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.xs,
    ...shadow.raised,
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
    backgroundColor: colors.surface,
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
