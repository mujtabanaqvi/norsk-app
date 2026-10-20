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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchTopicsAndQuota, startExamSession } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamTheme,
  RootStackParamList,
} from '../types/exam';
import {
  Screen,
  Logo,
  Card,
  Badge,
  TierBadge,
  Button,
  Icon,
  LanguageToggle,
} from '../components/ui';
import { colors, radius, space, type } from '../theme';

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

  return (
    <Screen>
      {/* Clean Single Top Header */}
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Logo size={32} withWordmark />
          <Text style={styles.headerSubtitle}>
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
            onPress={() => navigation.navigate('HowTo')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('setup.a11yGuide')}
          >
            <Icon name="help-circle-outline" size={20} color={colors.navy} />
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Referral')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('nav.referral')}
          >
            <Icon name="gift-outline" size={19} color={colors.navy} />
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Subscription')}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
              pressed && styles.iconBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('setup.a11yUpgrade')}
          >
            <Icon name="star" size={18} color={colors.gold} />
          </Pressable>

          {user && (
            <Pressable
              onPress={logout}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t('setup.a11yLogout')}
            >
              <Icon name="log-out-outline" size={19} color={colors.red} />
            </Pressable>
          )}
        </View>
      </View>

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
            {/* Unified Quota & Daily Tests Stat Card */}
            <Card style={styles.statsCard}>
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
                  <Text style={styles.statCaption}>{t('setup.quotaCaption')}</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statColumn}>
                  <Text style={styles.statOverline}>{t('setup.dailyOverline')}</Text>
                  <Text style={styles.statValue}>
                    {dailyTestStatus
                      ? `${dailyTestStatus.testsUsedToday} / ${dailyTestStatus.totalAllowedToday}`
                      : '--'}
                  </Text>
                  <Text style={styles.statCaption}>
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

              {dailyTestStatus && (
                <View style={styles.progressSection}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(dailyProgressRatio * 100)}%` },
                      ]}
                    />
                  </View>

                  {dailyTestStatus.remainingToday === 0 && (
                    <View style={styles.unlockRow}>
                      <Text style={styles.unlockHint}>
                        {t('setup.limitReachedHint')}
                      </Text>
                      <Button
                        title={t('setup.unlockMore')}
                        variant="gold"
                        size="sm"
                        icon="star"
                        onPress={() => navigation.navigate('Subscription')}
                      />
                    </View>
                  )}
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

              {/* AI_PEER Card */}
              <Card
                selected={practiceMode === 'AI_PEER'}
                onPress={() => setPracticeMode('AI_PEER')}
                style={styles.modeCard}
              >
                <View style={styles.modeCardHeader}>
                  <View
                    style={[
                      styles.radioOuter,
                      practiceMode === 'AI_PEER' && styles.radioOuterSelected,
                    ]}
                  >
                    {practiceMode === 'AI_PEER' && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.modeTitleContainer}>
                    <Text style={styles.modeCardTitle}>
                      {t('setup.aiPeerTitle')}
                    </Text>
                    <Badge
                      label={t('setup.aiPeerBadge')}
                      tone="red"
                      style={styles.modeBadge}
                    />
                  </View>
                </View>
                <Text style={styles.modeCardDescription}>
                  {t('setup.aiPeerDesc')}
                </Text>
              </Card>

              {/* HUMAN_LOCAL Card */}
              <Card
                selected={practiceMode === 'HUMAN_LOCAL'}
                onPress={() => setPracticeMode('HUMAN_LOCAL')}
                style={styles.modeCard}
              >
                <View style={styles.modeCardHeader}>
                  <View
                    style={[
                      styles.radioOuter,
                      practiceMode === 'HUMAN_LOCAL' && styles.radioOuterSelected,
                    ]}
                  >
                    {practiceMode === 'HUMAN_LOCAL' && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.modeTitleContainer}>
                    <Text style={styles.modeCardTitle}>
                      {t('setup.humanTitle')}
                    </Text>
                    <Badge
                      label={t('setup.humanBadge')}
                      tone="navy"
                      style={styles.modeBadge}
                    />
                  </View>
                </View>
                <Text style={styles.modeCardDescription}>
                  {t('setup.humanDesc')}
                </Text>
              </Card>
            </View>

            {/* Section 3: Theme Selection */}
            <View style={styles.section}>
              <View style={styles.topicSectionHeader}>
                <Text style={styles.sectionOverline}>{t('setup.step3')}</Text>
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
                  {/* Random Exam Option (Default) */}
                  <Card
                    selected={selectedThemeId === 'RANDOM'}
                    onPress={() => setSelectedThemeId('RANDOM')}
                    style={styles.topicCard}
                  >
                    <View style={styles.topicCardTop}>
                      <Badge label={t('setup.randomBadge')} tone="solidRed" icon="shuffle" />
                      <Text style={styles.topicCardTitle}>
                        {t('setup.randomTitle')}
                      </Text>
                      {selectedThemeId === 'RANDOM' && (
                        <Icon name="checkmark-circle" size={22} color={colors.red} />
                      )}
                    </View>

                    <Text style={styles.topicCardPreview}>
                      {t('setup.randomDesc', { level: targetLevel, count: filteredThemes.length })}
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
                        style={styles.topicCard}
                      >
                        <View style={styles.topicCardTop}>
                          <Badge label={targetLevel} tone="navy" />
                          <Text style={styles.topicCardTitle}>{theme.titleNo}</Text>
                          {isSelected && (
                            <Icon name="checkmark-circle" size={22} color={colors.red} />
                          )}
                        </View>

                        {!!theme.descriptionNo && (
                          <Text
                            style={styles.topicCardPreview}
                            numberOfLines={3}
                            ellipsizeMode="tail"
                          >
                            {theme.descriptionNo}
                          </Text>
                        )}
                        <Text style={styles.topicCounter}>
                          {t('setup.setCount', { count: setCount })}
                        </Text>
                      </Card>
                    );
                  })}
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
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  brandBlock: {
    flexShrink: 1,
    minWidth: 128,
  },
  headerSubtitle: {
    ...type.caption,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    // Wrap onto a second row on narrow phones instead of squashing the logo.
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.navySoft,
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
    paddingBottom: space.xxl,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  statsCard: {
    marginBottom: space.xl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statColumn: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.border,
    marginHorizontal: space.lg,
  },
  statOverline: {
    ...type.overline,
    marginBottom: 2,
  },
  statValue: {
    ...type.title,
    fontWeight: '800',
  },
  statCaption: {
    ...type.caption,
    marginTop: 2,
  },
  progressSection: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
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
    marginTop: 4,
  },
  unlockHint: {
    ...type.caption,
    color: colors.warning,
    flex: 1,
  },
  section: {
    marginBottom: space.xl,
  },
  sectionOverline: {
    ...type.overline,
    color: colors.navy,
    marginBottom: space.sm,
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
    paddingVertical: 14,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  segmentOptionSelected: {
    backgroundColor: colors.red,
  },
  segmentTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  segmentTitleSelected: {
    color: colors.white,
  },
  segmentSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  segmentSubtitleSelected: {
    color: colors.white,
  },
  modeCard: {
    marginBottom: space.md,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: space.xs,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 10,
    backgroundColor: colors.surface,
  },
  radioOuterSelected: {
    borderColor: colors.red,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red,
  },
  modeTitleContainer: {
    flex: 1,
  },
  modeCardTitle: {
    ...type.bodyStrong,
  },
  modeBadge: {
    marginTop: 6,
  },
  modeCardDescription: {
    ...type.caption,
    color: colors.textSecondary,
    paddingLeft: 30,
    marginTop: 4,
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
  topicCard: {
    marginBottom: space.md,
  },
  topicCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  topicCardTitle: {
    ...type.heading,
    fontSize: 16,
    flex: 1,
  },
  topicCardPreview: {
    ...type.body,
    fontSize: 14,
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
