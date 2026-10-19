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
import type {
  CefrLevel,
  CoCandidateMode,
  ExamTopic,
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
} from '../components/ui';
import { colors, radius, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamSetup'>;

// Minimum audio quota required by backend (180 seconds / 3 minutes)
const MIN_REQUIRED_QUOTA_SECONDS = 180;

export const ExamSetupScreen: React.FC<Props> = ({ navigation }) => {
  const [targetLevel, setTargetLevel] = useState<CefrLevel>('B1');
  const [practiceMode, setPracticeMode] = useState<CoCandidateMode>('AI_PEER');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>('RANDOM');

  const [topics, setTopics] = useState<ExamTopic[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { user, dailyTestStatus, logout } = useAuth();

  /**
   * Fetch topics catalog and remaining user audio quota from backend
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
      setTopics(data.topics || []);

      if (data.quota && typeof data.quota.remainingAudioSeconds === 'number') {
        setRemainingSeconds(data.quota.remainingAudioSeconds);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ukjent feil under henting av data';
      setFetchError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExamCatalog();
  }, [loadExamCatalog]);

  // Filter topics matching currently selected CEFR level (B1 or B2)
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => t.level === targetLevel);
  }, [topics, targetLevel]);

  // Keep 'RANDOM' selected by default; if a manual topic was chosen and no longer matches level, reset to 'RANDOM'
  useEffect(() => {
    if (filteredTopics.length > 0) {
      if (selectedTopicId === 'RANDOM') {
        return;
      }
      const existsInFiltered = filteredTopics.some((t) => t.id === selectedTopicId);
      if (!existsInFiltered) {
        setSelectedTopicId('RANDOM');
      }
    } else {
      setSelectedTopicId(null);
    }
  }, [filteredTopics, selectedTopicId]);

  /**
   * Format audio quota seconds into user-friendly minutes & seconds
   */
  const formattedQuota = useMemo(() => {
    if (remainingSeconds === null) return '-- min';
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    if (minutes === 0) {
      return `${seconds} sek`;
    }
    return seconds > 0 ? `${minutes} min ${seconds} sek` : `${minutes} min`;
  }, [remainingSeconds]);

  const hasInsufficientQuota =
    remainingSeconds !== null && remainingSeconds < MIN_REQUIRED_QUOTA_SECONDS;

  /**
   * Call POST /api/exam/start and navigate to Active Exam Room
   */
  const handleStartExam = async () => {
    if (!user) {
      Alert.alert(
        'Innlogging påkrevd',
        'Du må være logget inn for å ta en muntlig prøve.',
        [{ text: 'Logg inn', onPress: () => navigation.navigate('Auth') }]
      );
      return;
    }

    if (!selectedTopicId || filteredTopics.length === 0) {
      Alert.alert('Velg tema', 'Ingen tilgjengelige eksamenstemaer for valgt nivå.');
      return;
    }

    if (hasInsufficientQuota) {
      Alert.alert(
        'Utilstrekkelig taletid',
        `Du har kun ${formattedQuota} igjen. Minimum ${MIN_REQUIRED_QUOTA_SECONDS / 60} minutter kreves for å starte en muntlig prøve.`
      );
      return;
    }

    const manualTopic =
      selectedTopicId !== 'RANDOM'
        ? topics.find((t) => t.id === selectedTopicId)
        : undefined;

    setIsStarting(true);
    try {
      const result = await startExamSession({
        topicId: selectedTopicId === 'RANDOM' ? 'RANDOM' : selectedTopicId,
        level: targetLevel,
        coCandidateMode: practiceMode,
      });

      const resolvedTopicTitle =
        result.topic?.titleNo || manualTopic?.titleNo || 'Muntlig prøve';
      const resolvedMonologuePrompt =
        result.topic?.monologuePromptNo || manualTopic?.monologuePromptNo;
      const resolvedDiscussionPrompt =
        result.topic?.discussionPromptNo || manualTopic?.discussionPromptNo;

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
      const message = err instanceof Error ? err.message : 'Oppstart av muntlig prøve mislyktes';
      Alert.alert('Kunne ikke starte prøven', message);
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
            Norskprøven Muntlig{user ? ` · ${user.name || user.email.split('@')[0]}` : ''}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {user ? (
            <Pressable
              onPress={() => navigation.navigate('Subscription')}
              accessibilityRole="button"
              accessibilityLabel="Abonnement"
            >
              <TierBadge tier={user.subscriptionTier} />
            </Pressable>
          ) : (
            <Button
              title="Logg inn"
              variant="outline"
              size="sm"
              icon="person-outline"
              onPress={() => navigation.navigate('Auth')}
            />
          )}

          <Pressable
            onPress={() => navigation.navigate('HowTo')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Veileder"
          >
            <Icon name="help-circle-outline" size={20} color={colors.navy} />
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Referral')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Verv en venn"
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
            accessibilityLabel="Oppgrader"
          >
            <Icon name="star" size={18} color={colors.gold} />
          </Pressable>

          {user && (
            <Pressable
              onPress={logout}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Logg ut"
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
            Lav talekvote. Du trenger minst {MIN_REQUIRED_QUOTA_SECONDS / 60} minutter for å gjennomføre en full prøve.
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.red} />
          <Text style={styles.loadingText}>Henter tilgjengelige temaer og talekvote...</Text>
        </View>
      ) : fetchError ? (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Icon name="alert-circle" size={28} color={colors.danger} />
          </View>
          <Text style={styles.errorTitle}>Tilkoblingsfeil</Text>
          <Text style={styles.errorMessage}>{fetchError}</Text>
          <Button
            title="Prøv på nytt"
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
                  <Text style={styles.statOverline}>TALEKVOTE</Text>
                  <Text
                    style={[
                      styles.statValue,
                      hasInsufficientQuota && { color: colors.danger },
                    ]}
                  >
                    {formattedQuota}
                  </Text>
                  <Text style={styles.statCaption}>Tilgjengelig taletid</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statColumn}>
                  <Text style={styles.statOverline}>ØVINGSTESTER I DAG</Text>
                  <Text style={styles.statValue}>
                    {dailyTestStatus
                      ? `${dailyTestStatus.testsUsedToday} / ${dailyTestStatus.totalAllowedToday}`
                      : '--'}
                  </Text>
                  <Text style={styles.statCaption}>
                    {dailyTestStatus
                      ? dailyTestStatus.remainingToday > 0
                        ? `${dailyTestStatus.remainingToday} gjenstår i dag`
                        : 'Dagens grense er nådd'
                      : 'Nullstilles ved midnatt'}
                    {dailyTestStatus && dailyTestStatus.bonusTests > 0
                      ? ` (+${dailyTestStatus.bonusTests} bonus)`
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
                        Dagens grense er nådd. Nullstilles ved midnatt.
                      </Text>
                      <Button
                        title="Lås opp flere"
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
              <Text style={styles.sectionOverline}>1. VELG MÅLNIVÅ (CEFR)</Text>
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
                        Nivå {level}
                      </Text>
                      <Text
                        style={[
                          styles.segmentSubtitle,
                          isSelected && styles.segmentSubtitleSelected,
                        ]}
                      >
                        {level === 'B1'
                          ? 'Selvstendig bruker (Middels)'
                          : 'Flytende & Nyansert (Høyere)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section 2: Practice Mode Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionOverline}>2. VELG ØVINGSMODUS</Text>

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
                      Øv alene (AI Sensor + AI Medkandidat)
                    </Text>
                    <Badge
                      label="Anbefalt for egentrening"
                      tone="red"
                      style={styles.modeBadge}
                    />
                  </View>
                </View>
                <Text style={styles.modeCardDescription}>
                  AI spiller både den autoriserte sensoren og en vennlig medkandidat i samtaledelen. Full samtalesimulering direkte på telefonen.
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
                      Øv med en venn ved siden av deg (Delt mikrofon)
                    </Text>
                    <Badge
                      label="Delt mikrofon (2 personer)"
                      tone="navy"
                      style={styles.modeBadge}
                    />
                  </View>
                </View>
                <Text style={styles.modeCardDescription}>
                  AI-sensor leder prøven mens to kandidater sitter fysisk sammen og deler telefonens mikrofon. Sensoren lytter passivt under Del 2 (Samtaleoppgave).
                </Text>
              </Card>
            </View>

            {/* Section 3: Topic Selection */}
            <View style={styles.section}>
              <View style={styles.topicSectionHeader}>
                <Text style={styles.sectionOverline}>3. VELG EKSAMENSTEMA</Text>
                <Text style={styles.topicCounter}>
                  {filteredTopics.length} temaer for {targetLevel}
                </Text>
              </View>

              {filteredTopics.length === 0 ? (
                <Card style={styles.emptyTopicsBox}>
                  <Text style={styles.emptyTopicsText}>
                    Ingen temaer funnet for nivå {targetLevel}.
                  </Text>
                </Card>
              ) : (
                <>
                  {/* Random Exam Option (Default) */}
                  <Card
                    selected={selectedTopicId === 'RANDOM'}
                    onPress={() => setSelectedTopicId('RANDOM')}
                    style={styles.topicCard}
                  >
                    <View style={styles.topicCardTop}>
                      <Badge label="TILFELDIG" tone="solidRed" icon="shuffle" />
                      <Text style={styles.topicCardTitle}>
                        Tilfeldig prøve (Anbefalt)
                      </Text>
                      {selectedTopicId === 'RANDOM' && (
                        <Icon name="checkmark-circle" size={22} color={colors.red} />
                      )}
                    </View>

                    <Text style={styles.topicCardPreview}>
                      Som på den ekte Norskprøven trekkes eksamenstema og oppfølgingsspørsmål for nivå {targetLevel} tilfeldig fra databasen når du starter prøven ({filteredTopics.length} tilgjengelige prøver).
                    </Text>
                  </Card>

                  {filteredTopics.map((topic) => {
                    const isSelected = selectedTopicId === topic.id;
                    return (
                      <Card
                        key={topic.id}
                        selected={isSelected}
                        onPress={() => setSelectedTopicId(topic.id)}
                        style={styles.topicCard}
                      >
                        <View style={styles.topicCardTop}>
                          <Badge label={topic.level} tone="navy" />
                          <Text style={styles.topicCardTitle}>{topic.titleNo}</Text>
                          {isSelected && (
                            <Icon name="checkmark-circle" size={22} color={colors.red} />
                          )}
                        </View>

                        <Text
                          style={styles.topicCardPreview}
                          numberOfLines={3}
                          ellipsizeMode="tail"
                        >
                          {topic.monologuePromptNo || topic.discussionPromptNo}
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
            title={isStarting ? 'Forbereder eksamensrom...' : 'Start muntlig prøve'}
            variant="primary"
            size="lg"
            icon="mic"
            fullWidth
            loading={isStarting}
            disabled={isStarting || !selectedTopicId || hasInsufficientQuota}
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
  },
  headerSubtitle: {
    ...type.caption,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
