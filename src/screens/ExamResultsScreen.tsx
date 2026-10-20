import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
  UIManager,
  Share,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchExamResults } from '../api';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_TAGS } from '../i18n';
import type {
  RootStackParamList,
  ExamResultsResponse,
  CandidateEvaluation,
  CriterionScore,
  ConcreteCorrection,
  TranscriptTurn,
  UsageLedgerEntry,
  AssessedLevel,
} from '../types/exam';
import {
  Screen,
  AppHeader,
  Logo,
  Card,
  Badge,
  Button,
  Icon,
} from '../components/ui';
import { colors, radius, space, type } from '../theme';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'ExamResults'>;

// Polling interval in milliseconds
const POLLING_INTERVAL_MS = 3000;

/**
 * Helper to format timestamp into MM:SS
 */
function formatTimestamp(timestamp: number, baseTimestamp?: number): string {
  if (!timestamp || timestamp <= 0) return '00:00';
  let diffSec: number;
  if (baseTimestamp && baseTimestamp > 0 && timestamp >= baseTimestamp) {
    diffSec = Math.floor((timestamp - baseTimestamp) / 1000);
  } else if (timestamp > 1000000000000) {
    // Unix epoch ms without base: show time of day
    const date = new Date(timestamp);
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${mm}:${ss}`;
  } else {
    diffSec = Math.floor(timestamp);
  }
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Criterion Progress Bar Component
 */
const CriterionProgressBar: React.FC<{
  score: number; // 1 - 10
}> = ({ score }) => {
  const clampedScore = Math.max(1, Math.min(10, score));
  const percentage = (clampedScore / 10) * 100;

  // Determine color based on HK-dir B1/B2 scale
  let barColor: string = colors.red; // Red (1 - 3)
  if (clampedScore >= 7) {
    barColor = colors.success; // Green (7 - 10) -> Solid B2
  } else if (clampedScore >= 5) {
    barColor = colors.navy; // Navy (5 - 6) -> Solid B1
  } else if (clampedScore >= 4) {
    barColor = colors.warning; // Amber (4) -> Under B1 borderline
  }

  return (
    <View style={styles.progressBarTrack}>
      <View
        style={[
          styles.progressBarFill,
          {
            width: `${percentage}%`,
            backgroundColor: barColor,
          },
        ]}
      />
    </View>
  );
};

/**
 * Single HK-dir Criterion Card Component
 */
const CriterionCard: React.FC<{
  titleNo: string;
  titleEn: string;
  criterion: CriterionScore;
  showEnglish: boolean;
}> = ({ titleNo, titleEn, criterion, showEnglish }) => {
  const { t } = useLocale();
  const score = criterion.score || 1;
  const feedbackText = showEnglish
    ? criterion.feedbackEn || criterion.feedbackNo
    : criterion.feedbackNo;

  const getScoreBadgeText = (val: number) => {
    if (val >= 8) return t('results.bandStrongB2');
    if (val >= 6) return t('results.bandB2');
    if (val >= 5) return t('results.bandB1');
    if (val >= 4) return t('results.bandNearB1');
    return t('results.bandBelowB1');
  };

  return (
    <Card style={styles.criterionCard}>
      <View style={styles.criterionHeader}>
        <View style={styles.criterionTitleContainer}>
          <Text style={styles.criterionTitleNo}>{titleNo}</Text>
          <Text style={styles.criterionTitleEn}>{titleEn}</Text>
        </View>
        <View style={styles.criterionScoreBadge}>
          <Text style={styles.criterionScoreNumber}>{score}</Text>
          <Text style={styles.criterionScoreDenominator}>/ 10</Text>
        </View>
      </View>

      <View style={styles.criterionProgressSection}>
        <CriterionProgressBar score={score} />
        <View style={styles.criterionLevelRow}>
          <Badge
            label={getScoreBadgeText(score)}
            tone={score >= 7 ? 'success' : score >= 5 ? 'navy' : score >= 4 ? 'warning' : 'red'}
          />
          <Text style={styles.criterionLevelPercent}>{t('results.hkdirStandard')}</Text>
        </View>
      </View>

      <View style={styles.criterionFeedbackBox}>
        <Text style={styles.criterionFeedbackText}>{feedbackText}</Text>
      </View>
    </Card>
  );
};

export const ExamResultsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { sessionId } = route.params;
  const { locale, t, strings } = useLocale();
  // Engaging messages cycled during HK-dir gpt-4o evaluation
  const loadingSteps = strings.results.loadingSteps;

  // Polling & Data State
  const [resultsData, setResultsData] = useState<ExamResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Active Candidate Index (0 = CANDIDATE_1, 1 = CANDIDATE_2)
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);

  // Bilingual Feedback Toggle (false = Norwegian, true = English); starts in the UI language
  const [showEnglishFeedback, setShowEnglishFeedback] = useState<boolean>(locale === 'en');

  // Accordion Expand/Collapse States
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState<boolean>(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState<boolean>(false);

  // Loading Animation Values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [loadingStepIndex, setLoadingStepIndex] = useState<number>(0);

  // Polling ref to safely clear timer across unmounts
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingStepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Start engaging loading pulse
   */
  useEffect(() => {
    if (!isLoading) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    loadingStepTimerRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 3200);

    return () => {
      pulseLoop.stop();
      if (loadingStepTimerRef.current) {
        clearInterval(loadingStepTimerRef.current);
        loadingStepTimerRef.current = null;
      }
    };
  }, [isLoading, pulseAnim, loadingSteps.length]);

  const resultsDataRef = useRef<ExamResultsResponse | null>(null);
  resultsDataRef.current = resultsData;

  /**
   * Poll results from backend API
   */
  const fetchResults = useCallback(async (isManualRefresh = false) => {
    if (!sessionId) {
      setPollError(t('results.invalidSession'));
      setIsLoading(false);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchExamResults(sessionId);
      setResultsData(data);
      setPollError(null);

      // Check if evaluation is finished
      const isEvalReady = data.evaluationJson !== null;
      const isStatusTerminal = data.status === 'COMPLETED' || data.status === 'FAILED';

      if (isEvalReady || (isStatusTerminal && data.status === 'FAILED')) {
        // Evaluation completed or session marked failed
        setIsLoading(false);
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('results.fetchFailed');
      // If we haven't loaded anything yet, surface error
      if (!resultsDataRef.current) {
        setPollError(message);
      }
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      }
    }
  }, [sessionId, t]);

  /**
   * Setup polling every 3 seconds while active or evaluation is null, with 3-minute timeout
   */
  useEffect(() => {
    // Initial fetch immediately
    fetchResults();

    // Start 3s interval timer
    pollTimerRef.current = setInterval(() => {
      fetchResults();
    }, POLLING_INTERVAL_MS);

    // Timeout safety net (stop polling after 180s / 3 minutes)
    const timeoutTimer = setTimeout(() => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (!resultsDataRef.current?.evaluationJson) {
        setIsLoading(false);
        setPollError(t('results.timeout'));
      }
    }, 180_000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (loadingStepTimerRef.current) {
        clearInterval(loadingStepTimerRef.current);
        loadingStepTimerRef.current = null;
      }
      clearTimeout(timeoutTimer);
    };
    // Only restart polling for a new session, not on a language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /**
   * Candidates list and active candidate
   */
  const evaluation = resultsData?.evaluationJson;
  const candidates: CandidateEvaluation[] = useMemo(() => {
    return evaluation?.candidates || [];
  }, [evaluation]);

  const hasDualCandidates = candidates.length === 2;

  const currentCandidate: CandidateEvaluation | null = useMemo(() => {
    if (!candidates.length) return null;
    return candidates[activeCandidateIndex] || candidates[0];
  }, [candidates, activeCandidateIndex]);

  /**
   * Calculate average score for the active candidate
   */
  const averageScore = useMemo(() => {
    if (!currentCandidate) return 0;
    const scores = [
      currentCandidate.criteriaScores.formidlingOgFlyt.score,
      currentCandidate.criteriaScores.uttaleOgForstaelighet.score,
      currentCandidate.criteriaScores.ordforrad.score,
      currentCandidate.criteriaScores.grammatikkOgSetningsstruktur.score,
    ];
    const sum = scores.reduce((acc, val) => acc + val, 0);
    return (sum / scores.length).toFixed(1);
  }, [currentCandidate]);

  /**
   * Aggregate total session usage metrics from usageLedger
   */
  const sessionUsageSummary = useMemo(() => {
    const entries: UsageLedgerEntry[] = resultsData?.usage || [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTtsChars = 0;
    let totalSttSeconds = 0;
    let totalCostUsd = 0;

    for (const entry of entries) {
      totalPromptTokens += entry.llmPromptTokens || 0;
      totalCompletionTokens += entry.llmCompletionTokens || 0;
      totalTtsChars += entry.ttsCharacters || 0;
      totalSttSeconds += parseFloat(String(entry.sttAudioSeconds || 0));
      totalCostUsd += parseFloat(String(entry.estimatedCostUsd || 0));
    }

    return {
      totalTokens: totalPromptTokens + totalCompletionTokens,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTtsChars,
      totalSttSeconds: Math.round(totalSttSeconds),
      totalCostUsdFormatted: totalCostUsd.toFixed(4),
      entriesCount: entries.length,
    };
  }, [resultsData]);

  /**
   * Share / Export summary
   */
  const handleShareResults = async () => {
    if (!currentCandidate) return;
    try {
      const overallSummary =
        locale === 'en'
          ? currentCandidate.overallSummaryEn || currentCandidate.overallSummaryNo
          : currentCandidate.overallSummaryNo;
      const summary = [
        t('results.shareHeading', { level: currentCandidate.targetLevel }),
        t('results.shareCandidate', {
          name:
            currentCandidate.speakerRole === 'CANDIDATE_1'
              ? t('common.candidate1')
              : t('common.candidate2'),
        }),
        t('results.shareAssessed', { level: currentCandidate.assessedLevel }),
        t('results.shareTarget', {
          status: currentCandidate.passedTargetLevel
            ? t('results.sharePassed')
            : t('results.shareFailed'),
        }),
        t('results.shareAverage', { score: averageScore }),
        '',
        t('results.shareSummary', { summary: overallSummary }),
      ].join('\n');

      await Share.share({
        message: summary,
        title: t('results.shareTitle'),
      });
    } catch {
      // Ignore share dismissal
    }
  };

  /**
   * Helper to return badge color for assessed levels
   */
  const getLevelBadgeColors = (level: AssessedLevel) => {
    switch (level) {
      case 'Over B2':
      case 'B2':
      case 'B1':
        return { bg: colors.redSoft, text: colors.red, border: colors.red };
      case 'Under B1':
      default:
        return { bg: colors.warningSoft, text: colors.warning, border: colors.warning };
    }
  };

  // Base transcript timestamp for offset calculation
  const baseTimestamp = useMemo(() => {
    const list = resultsData?.transcriptJson || [];
    return list.length > 0 ? list[0].timestamp : 0;
  }, [resultsData]);

  // ==========================================
  // RENDER: Loading / Sensor Evaluating State
  // ==========================================
  if (isLoading || (!evaluation && resultsData?.status === 'ACTIVE')) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <Badge label={t('results.badge')} tone="red" icon="analytics-outline" />

          {/* Animated Logo Pulse */}
          <Animated.View
            style={[
              styles.pulseCircleOuter,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <View style={styles.pulseCircleInner}>
              <Logo size={64} />
            </View>
          </Animated.View>

          <ActivityIndicator size="small" color={colors.red} style={{ marginBottom: space.md }} />

          <Text style={styles.loadingMainTitle}>{t('results.loadingTitle')}</Text>

          <Card style={styles.loadingStepCard}>
            <View style={styles.loadingStepDot} />
            <Text style={styles.loadingStepText}>
              {loadingSteps[loadingStepIndex % loadingSteps.length]}
            </Text>
          </Card>

          <View style={styles.loadingProgressSteps}>
            <View style={styles.stepItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>1</Text>
              </View>
              <Text style={styles.stepLabel}>{t('results.stepTranscription')}</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>2</Text>
              </View>
              <Text style={styles.stepLabel}>{t('results.stepRubric')}</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>3</Text>
              </View>
              <Text style={styles.stepLabel}>{t('results.stepCorrections')}</Text>
            </View>
          </View>

          <Text style={styles.loadingHelpNote}>
            {t('results.loadingNote')}
          </Text>

          {pollError && (
            <View style={styles.pollErrorBanner}>
              <Text style={styles.pollErrorText}>{pollError}</Text>
              <Button
                title={t('common.tryAgain')}
                variant="primary"
                size="sm"
                onPress={() => fetchResults(true)}
              />
            </View>
          )}
        </View>
      </Screen>
    );
  }

  // ==========================================
  // RENDER: Error / Missing Evaluation State
  // ==========================================
  if (pollError && !resultsData) {
    return (
      <Screen>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Icon name="alert-circle" size={32} color={colors.danger} />
          </View>
          <Text style={styles.errorTitle}>{t('results.loadFailedTitle')}</Text>
          <Text style={styles.errorMessage}>{pollError}</Text>
          <Button
            title={t('common.retry')}
            variant="primary"
            size="lg"
            icon="refresh"
            onPress={() => {
              setIsLoading(true);
              fetchResults(true);
            }}
            style={{ marginBottom: space.sm }}
          />
          <Button
            title={t('results.backToStart')}
            variant="ghost"
            size="md"
            onPress={() => navigation.replace('ExamSetup')}
          />
        </View>
      </Screen>
    );
  }

  // Safety fallback if evaluation object is null
  if (!currentCandidate) {
    return (
      <Screen>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Icon name="document-text-outline" size={32} color={colors.navy} />
          </View>
          <Text style={styles.errorTitle}>{t('results.noEvalTitle')}</Text>
          <Text style={styles.errorMessage}>
            {t('results.noEvalBody')}
          </Text>
          <Button
            title={t('results.startNew')}
            variant="primary"
            size="lg"
            onPress={() => navigation.replace('ExamSetup')}
          />
        </View>
      </Screen>
    );
  }

  const badgeColors = getLevelBadgeColors(currentCandidate.assessedLevel);
  const isPassed = currentCandidate.passedTargetLevel;

  return (
    <Screen>
      {/* TOP APP BAR */}
      <AppHeader
        title={resultsData?.topic?.titleNo || t('results.headerFallback')}
        subtitle={t('results.headerSubtitle')}
        onBack={() => navigation.replace('ExamSetup')}
        bordered
        right={
          <Button
            title={t('results.share')}
            variant="outline"
            size="sm"
            icon="share-outline"
            onPress={handleShareResults}
          />
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchResults(true)}
            tintColor={colors.red}
            colors={[colors.red]}
          />
        }
      >
        <View style={styles.contentWrapper}>
          {/* SEGMENTED TAB SWITCHER: DUAL CANDIDATE MODE (HUMAN_LOCAL) */}
          {hasDualCandidates && (
            <Card style={styles.dualTabsContainer}>
              <View style={styles.dualTabsNotice}>
                <Icon name="people-outline" size={16} color={colors.navy} />
                <Text style={styles.dualTabsNoticeText}>
                  {t('results.dualNotice')}
                </Text>
              </View>
              <View style={styles.dualTabsRow}>
                {[0, 1].map((idx) => {
                  const active = activeCandidateIndex === idx;
                  const cand = candidates[idx];
                  return (
                    <Pressable
                      key={idx}
                      style={[
                        styles.dualTabButton,
                        active && styles.dualTabButtonActive,
                      ]}
                      onPress={() => setActiveCandidateIndex(idx)}
                    >
                      <Text
                        style={[
                          styles.dualTabTitle,
                          active && styles.dualTabTitleActive,
                        ]}
                      >
                        {idx === 0 ? t('common.candidate1') : t('common.candidate2')}
                      </Text>
                      <Badge
                        label={cand?.assessedLevel || '--'}
                        tone={cand?.passedTargetLevel ? 'success' : 'warning'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}

          {/* 1. SCORECARD HERO CARD */}
          <Card style={styles.scorecardHeaderCard}>
            <View style={styles.headerCandidateRow}>
              <Text style={styles.headerCandidateLabel}>
                {currentCandidate.speakerRole === 'CANDIDATE_1'
                  ? t('common.candidate1')
                  : t('common.candidate2')}
                {hasDualCandidates ? '' : t('results.youSuffix')}
              </Text>
              <Badge
                label={t('results.targetLevelBadge', { level: currentCandidate.targetLevel })}
                tone="navy"
              />
            </View>

            {/* Big Assessed Level Highlight */}
            <View style={styles.levelAssessmentRow}>
              <View
                style={[
                  styles.assessedLevelBigBadge,
                  {
                    backgroundColor: badgeColors.bg,
                    borderColor: badgeColors.border,
                  },
                ]}
              >
                <Text style={styles.assessedLevelLabel}>{t('results.assessedLevel')}</Text>
                <Text
                  style={[
                    styles.assessedLevelValue,
                    { color: badgeColors.text },
                  ]}
                >
                  {currentCandidate.assessedLevel}
                </Text>
              </View>

              <View style={styles.scoreMetricCard}>
                <Text style={styles.scoreMetricLabel}>{t('results.average')}</Text>
                <Text style={styles.scoreMetricValue}>{averageScore}</Text>
                <Text style={styles.scoreMetricSub}>{t('results.outOf10')}</Text>
              </View>
            </View>

            {/* Pass / Needs Work Banner */}
            <View
              style={[
                styles.passStatusBanner,
                isPassed ? styles.passStatusSuccess : styles.passStatusNeedsWork,
              ]}
            >
              <Icon
                name={isPassed ? 'checkmark-circle' : 'alert-circle'}
                size={22}
                color={isPassed ? colors.success : colors.warning}
              />
              <View style={styles.passStatusTextContainer}>
                <Text
                  style={[
                    styles.passStatusTitle,
                    { color: isPassed ? colors.success : colors.warning },
                  ]}
                >
                  {isPassed ? t('results.passed') : t('results.needsWork')}
                </Text>
                <Text style={styles.passStatusSubtitle}>
                  {isPassed
                    ? t('results.passedBody', { level: currentCandidate.targetLevel })
                    : t('results.needsWorkBody', {
                        assessed: currentCandidate.assessedLevel,
                        target: currentCandidate.targetLevel,
                      })}
                </Text>
              </View>
            </View>
          </Card>

          {/* 2. OVERALL SUMMARY SECTION WITH BILINGUAL TOGGLE */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t('results.summaryTitle')}</Text>
              <Pressable
                style={styles.langTogglePill}
                onPress={() => setShowEnglishFeedback(!showEnglishFeedback)}
              >
                <Icon name="language-outline" size={14} color={colors.navy} />
                <Text style={styles.langToggleLabel}>
                  {showEnglishFeedback ? t('results.feedbackShowNo') : t('results.feedbackShowEn')}
                </Text>
              </Pressable>
            </View>

            <Card style={styles.summaryCard}>
              <View style={styles.summaryQuoteBar} />
              <Text style={styles.summaryText}>
                {showEnglishFeedback
                  ? currentCandidate.overallSummaryEn || currentCandidate.overallSummaryNo
                  : currentCandidate.overallSummaryNo}
              </Text>
            </Card>
          </View>

          {/* 3. 4 OFFICIAL HK-DIR CRITERIA CARDS */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t('results.criteriaTitle')}</Text>
              <Text style={styles.sectionSubtitle}>{t('results.scale')}</Text>
            </View>

            <CriterionCard
              titleNo="1. Formidling og flyt"
              titleEn="Fluency, Cohesion & Turn-taking"
              criterion={currentCandidate.criteriaScores.formidlingOgFlyt}
              showEnglish={showEnglishFeedback}
            />

            <CriterionCard
              titleNo="2. Uttale og forståelighet"
              titleEn="Pronunciation & Intonation"
              criterion={currentCandidate.criteriaScores.uttaleOgForstaelighet}
              showEnglish={showEnglishFeedback}
            />

            <CriterionCard
              titleNo="3. Ordforråd"
              titleEn="Vocabulary Breadth & Idiomatic Usage"
              criterion={currentCandidate.criteriaScores.ordforrad}
              showEnglish={showEnglishFeedback}
            />

            <CriterionCard
              titleNo="4. Grammatikk og setningsstruktur"
              titleEn="V2 Inversion & Clause Structure"
              criterion={currentCandidate.criteriaScores.grammatikkOgSetningsstruktur}
              showEnglish={showEnglishFeedback}
            />
          </View>

          {/* 4. CONCRETE CORRECTIONS LIST */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                {t('results.correctionsTitle')}
              </Text>
              <Badge
                label={t('results.examplesCount', { count: currentCandidate.concreteCorrections.length })}
                tone="navy"
              />
            </View>
            <Text style={styles.sectionExplainer}>
              {t('results.correctionsExplainer')}
            </Text>

            {currentCandidate.concreteCorrections.length === 0 ? (
              <Card style={styles.emptyCorrectionsCard}>
                <Icon name="checkmark-circle" size={24} color={colors.success} />
                <Text style={styles.emptyCorrectionsText}>
                  {t('results.noCorrections')}
                </Text>
              </Card>
            ) : (
              currentCandidate.concreteCorrections.map((item: ConcreteCorrection, idx: number) => (
                <Card key={idx} style={styles.correctionCard}>
                  <View style={styles.correctionHeaderRow}>
                    <Badge label={t('results.point', { n: idx + 1 })} tone="neutral" />
                  </View>

                  {/* Red Box: Hva du sa */}
                  <View style={styles.correctionBoxRed}>
                    <View style={styles.correctionBoxLabelRow}>
                      <Icon name="close-circle" size={15} color={colors.danger} />
                      <Text style={styles.correctionLabelRed}>{t('results.whatYouSaid')}</Text>
                    </View>
                    <Text style={styles.quoteTextRed}>
                      "{item.originalQuote}"
                    </Text>
                  </View>

                  {/* Green Box: Slik bør det sies */}
                  <View style={styles.correctionBoxGreen}>
                    <View style={styles.correctionBoxLabelRow}>
                      <Icon name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={styles.correctionLabelGreen}>{t('results.howToSay')}</Text>
                    </View>
                    <Text style={styles.quoteTextGreen}>
                      "{item.correctedNorwegian}"
                    </Text>
                  </View>

                  {/* Rule Explanation Box */}
                  <View style={styles.ruleExplanationBox}>
                    <View style={styles.correctionBoxLabelRow}>
                      <Icon name="bulb-outline" size={15} color={colors.navy} />
                      <Text style={styles.ruleLabel}>{t('results.rule')}</Text>
                    </View>
                    <Text style={styles.ruleText}>{item.grammarOrVocabRule}</Text>
                  </View>
                </Card>
              ))
            )}
          </View>

          {/* 5. COLLAPSIBLE FULL TRANSCRIPT */}
          <View style={styles.sectionContainer}>
            <Card
              onPress={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
              style={styles.accordionHeader}
            >
              <View style={styles.accordionTitleRow}>
                <View style={styles.accordionIconCircle}>
                  <Icon name="chatbubbles-outline" size={18} color={colors.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accordionTitle}>{t('results.transcriptTitle')}</Text>
                  <Text style={styles.accordionSubtitle}>
                    {t('results.transcriptSubtitle', { count: (resultsData?.transcriptJson || []).length })}
                  </Text>
                </View>
              </View>
              <View style={styles.accordionRightRow}>
                <Text style={styles.accordionChevron}>
                  {isTranscriptExpanded ? t('common.hide') : t('common.show')}
                </Text>
                <Icon
                  name={isTranscriptExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.red}
                />
              </View>
            </Card>

            {isTranscriptExpanded && (
              <Card style={styles.transcriptListContainer}>
                {(resultsData?.transcriptJson || []).length === 0 ? (
                  <Text style={styles.emptyTranscriptText}>
                    {t('results.noTranscript')}
                  </Text>
                ) : (
                  resultsData?.transcriptJson.map((turn: TranscriptTurn, index: number) => {
                    const isExaminer = turn.role === 'EXAMINER';
                    const isPeer = turn.role === 'AI_COCANDIDATE';
                    const isCandidate2 = turn.role === 'CANDIDATE_2';

                    const roleName = isExaminer
                      ? t('common.examiner')
                      : isPeer
                        ? t('common.aiCoCandidate')
                        : isCandidate2
                          ? t('common.candidate2')
                          : t('common.candidate1');

                    const timeStr = formatTimestamp(turn.timestamp, baseTimestamp);

                    return (
                      <View
                        key={turn.id || index}
                        style={[
                          styles.transcriptTurnCard,
                          isExaminer
                            ? styles.turnBubbleExaminer
                            : isPeer
                              ? styles.turnBubblePeer
                              : styles.turnBubbleCandidate,
                        ]}
                      >
                        <View style={styles.turnHeader}>
                          <Badge
                            label={roleName}
                            tone={isExaminer ? 'solidNavy' : isPeer ? 'neutral' : 'solidRed'}
                          />
                          <Text style={styles.turnTimeText}>{timeStr}</Text>
                        </View>
                        <Text style={styles.turnMessageText}>{turn.text}</Text>
                      </View>
                    );
                  })
                )}
              </Card>
            )}
          </View>

          {/* 6. COLLAPSIBLE SESSION USAGE & COST FOOTER */}
          <View style={styles.sectionContainer}>
            <Card
              onPress={() => setIsUsageExpanded(!isUsageExpanded)}
              style={styles.accordionHeader}
            >
              <View style={styles.accordionTitleRow}>
                <View style={styles.accordionIconCircle}>
                  <Icon name="flash-outline" size={18} color={colors.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accordionTitle}>{t('results.usageTitle')}</Text>
                  <Text style={styles.accordionSubtitle}>
                    {t('results.usageSubtitle')}
                  </Text>
                </View>
              </View>
              <View style={styles.accordionRightRow}>
                <Text style={styles.accordionChevron}>
                  {isUsageExpanded ? t('common.hide') : t('common.show')}
                </Text>
                <Icon
                  name={isUsageExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.red}
                />
              </View>
            </Card>

            {isUsageExpanded && (
              <Card style={styles.usageDetailsCard}>
                <View style={styles.usageMetricGrid}>
                  <View style={styles.usageMetricBox}>
                    <Text style={styles.usageMetricVal}>
                      {t('results.seconds', { sec: sessionUsageSummary.totalSttSeconds })}
                    </Text>
                    <Text style={styles.usageMetricSub}>{t('results.sttLabel')}</Text>
                  </View>

                  <View style={styles.usageMetricBox}>
                    <Text style={styles.usageMetricVal}>
                      {sessionUsageSummary.totalTokens.toLocaleString(LOCALE_TAGS[locale])}
                    </Text>
                    <Text style={styles.usageMetricSub}>{t('results.tokensLabel')}</Text>
                  </View>

                  <View style={styles.usageMetricBox}>
                    <Text style={styles.usageMetricVal}>
                      {sessionUsageSummary.totalTtsChars.toLocaleString(LOCALE_TAGS[locale])}
                    </Text>
                    <Text style={styles.usageMetricSub}>{t('results.ttsLabel')}</Text>
                  </View>

                  <View style={styles.usageMetricBox}>
                    <Text style={styles.usageMetricVal}>
                      ${sessionUsageSummary.totalCostUsdFormatted}
                    </Text>
                    <Text style={styles.usageMetricSub}>{t('results.costLabel')}</Text>
                  </View>
                </View>

                <View style={styles.usageLedgerEntriesList}>
                  <Text style={styles.usageLedgerEntriesTitle}>
                    {t('results.ledgerTitle', { count: sessionUsageSummary.entriesCount })}
                  </Text>
                  {(resultsData?.usage || []).map((entry: UsageLedgerEntry, idx: number) => (
                    <View key={entry.id || idx} style={styles.ledgerRow}>
                      <View style={styles.ledgerRowLeft}>
                        <Text style={styles.ledgerSourceText}>
                          {entry.source === 'POST_EXAM_RUBRIC_EVAL'
                            ? t('results.ledgerRubric')
                            : t('results.ledgerRealtime')}
                        </Text>
                        <Text style={styles.ledgerModelText}>
                          {entry.llmModel} • In: {entry.llmPromptTokens} • Out:{' '}
                          {entry.llmCompletionTokens}
                        </Text>
                      </View>
                      <Text style={styles.ledgerCostText}>
                        ${parseFloat(String(entry.estimatedCostUsd || 0)).toFixed(4)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </View>

          {/* 7. BOTTOM ACTION BUTTONS */}
          <View style={styles.bottomActionsContainer}>
            <Button
              title={t('results.takeNew')}
              variant="primary"
              size="lg"
              icon="mic"
              fullWidth
              onPress={() => navigation.replace('ExamSetup')}
            />

            <Button
              title={t('results.shareOrSave')}
              variant="outline"
              size="lg"
              icon="share-outline"
              fullWidth
              onPress={handleShareResults}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
};

export default ExamResultsScreen;

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },

  // DUAL TABS SWITCHER (HUMAN_LOCAL)
  dualTabsContainer: {
    marginBottom: space.lg,
    gap: space.sm,
  },
  dualTabsNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dualTabsNoticeText: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  dualTabsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  dualTabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  dualTabButtonActive: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
  },
  dualTabTitle: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  dualTabTitleActive: {
    color: colors.red,
  },

  // SCORECARD HERO CARD
  scorecardHeaderCard: {
    marginBottom: space.xl,
  },
  headerCandidateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  headerCandidateLabel: {
    ...type.overline,
    color: colors.navy,
  },
  levelAssessmentRow: {
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.md,
  },
  assessedLevelBigBadge: {
    flex: 2,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assessedLevelLabel: {
    ...type.overline,
    marginBottom: 4,
  },
  assessedLevelValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  scoreMetricCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreMetricLabel: {
    ...type.overline,
  },
  scoreMetricValue: {
    ...type.display,
    fontSize: 26,
    marginVertical: 2,
  },
  scoreMetricSub: {
    ...type.caption,
    fontSize: 11,
  },

  // PASS / NEEDS WORK BANNER
  passStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  passStatusSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  passStatusNeedsWork: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  passStatusTextContainer: {
    flex: 1,
  },
  passStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  passStatusSubtitle: {
    ...type.caption,
    color: colors.text,
    marginTop: 2,
  },

  // SECTIONS
  sectionContainer: {
    marginBottom: space.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  sectionTitle: {
    ...type.heading,
  },
  sectionSubtitle: {
    ...type.caption,
  },
  sectionExplainer: {
    ...type.caption,
    color: colors.textSecondary,
    marginBottom: space.md,
  },

  // SUMMARY CARD & TOGGLE
  langTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langToggleLabel: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCard: {
    flexDirection: 'row',
  },
  summaryQuoteBar: {
    width: 4,
    backgroundColor: colors.red,
    borderRadius: 2,
    marginRight: space.md,
  },
  summaryText: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },

  // CRITERION CARDS
  criterionCard: {
    marginBottom: space.md,
  },
  criterionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  criterionTitleContainer: {
    flex: 1,
    marginRight: space.sm,
  },
  criterionTitleNo: {
    ...type.bodyStrong,
  },
  criterionTitleEn: {
    ...type.caption,
    marginTop: 1,
  },
  criterionScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.navySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  criterionScoreNumber: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  criterionScoreDenominator: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  criterionProgressSection: {
    marginBottom: space.md,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.navySoft,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  criterionLevelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  criterionLevelPercent: {
    ...type.caption,
    fontSize: 11,
  },
  criterionFeedbackBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
  },
  criterionFeedbackText: {
    ...type.body,
    fontSize: 14,
  },

  // CONCRETE CORRECTIONS
  emptyCorrectionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  emptyCorrectionsText: {
    ...type.body,
    color: colors.success,
    fontWeight: '600',
    flex: 1,
  },
  correctionCard: {
    marginBottom: space.md,
    gap: space.sm,
  },
  correctionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  correctionBoxRed: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  correctionBoxGreen: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  correctionBoxLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  correctionLabelRed: {
    ...type.overline,
    color: colors.danger,
  },
  quoteTextRed: {
    ...type.body,
    color: colors.text,
    fontStyle: 'italic',
  },
  correctionLabelGreen: {
    ...type.overline,
    color: colors.success,
  },
  quoteTextGreen: {
    ...type.bodyStrong,
  },
  ruleExplanationBox: {
    backgroundColor: colors.navySoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  ruleLabel: {
    ...type.overline,
    color: colors.navy,
  },
  ruleText: {
    ...type.body,
    fontSize: 14,
  },

  // ACCORDIONS (TRANSCRIPT & USAGE)
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  accordionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionTitle: {
    ...type.bodyStrong,
  },
  accordionSubtitle: {
    ...type.caption,
    marginTop: 1,
  },
  accordionRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accordionChevron: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '700',
  },
  transcriptListContainer: {
    marginTop: space.sm,
    gap: space.sm,
  },
  emptyTranscriptText: {
    ...type.caption,
    textAlign: 'center',
    paddingVertical: space.md,
  },
  transcriptTurnCard: {
    borderRadius: radius.md,
    padding: space.md,
  },
  turnBubbleExaminer: {
    backgroundColor: colors.navySoft,
  },
  turnBubbleCandidate: {
    backgroundColor: colors.redSoft,
  },
  turnBubblePeer: {
    backgroundColor: colors.surfaceMuted,
  },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  turnTimeText: {
    ...type.caption,
    fontSize: 11,
  },
  turnMessageText: {
    ...type.body,
    color: colors.text,
    fontSize: 14,
  },

  // USAGE LEDGER
  usageDetailsCard: {
    marginTop: space.sm,
  },
  usageMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  usageMetricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
  },
  usageMetricVal: {
    ...type.heading,
  },
  usageMetricSub: {
    ...type.caption,
    fontSize: 11,
    marginTop: 2,
  },
  usageLedgerEntriesList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  usageLedgerEntriesTitle: {
    ...type.overline,
    marginBottom: space.sm,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ledgerRowLeft: {
    flex: 1,
  },
  ledgerSourceText: {
    ...type.caption,
    color: colors.text,
    fontWeight: '600',
  },
  ledgerModelText: {
    ...type.caption,
    fontSize: 11,
  },
  ledgerCostText: {
    ...type.caption,
    color: colors.navy,
    fontWeight: '700',
  },

  // BOTTOM ACTIONS
  bottomActionsContainer: {
    gap: space.md,
    marginTop: space.sm,
  },

  // LOADING & ERROR STATES
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    maxWidth: 520,
    alignSelf: 'center',
  },
  pulseCircleOuter: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.xl,
  },
  pulseCircleInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMainTitle: {
    ...type.heading,
    textAlign: 'center',
    marginBottom: space.md,
  },
  loadingStepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
    marginBottom: space.xl,
  },
  loadingStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  loadingStepText: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },
  loadingProgressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  stepLabel: {
    ...type.caption,
    fontSize: 11,
  },
  stepConnector: {
    width: 32,
    height: 2,
    backgroundColor: colors.borderStrong,
    marginHorizontal: space.sm,
  },
  loadingHelpNote: {
    ...type.caption,
    textAlign: 'center',
  },
  pollErrorBanner: {
    marginTop: space.lg,
    backgroundColor: colors.dangerSoft,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
  },
  pollErrorText: {
    ...type.caption,
    color: colors.danger,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    maxWidth: 480,
    alignSelf: 'center',
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  errorTitle: {
    ...type.title,
    marginBottom: space.xs,
    textAlign: 'center',
  },
  errorMessage: {
    ...type.body,
    textAlign: 'center',
    marginBottom: space.xl,
  },
});
