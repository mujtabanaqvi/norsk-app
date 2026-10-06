import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
  UIManager,
  Share,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  ExamResultsResponse,
  CandidateEvaluation,
  ExamEvaluation,
  CriterionScore,
  ConcreteCorrection,
  TranscriptTurn,
  UsageLedgerEntry,
  AssessedLevel,
  CefrLevel,
} from '../types/exam';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'ExamResults'>;

// API Base URL fallback
const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.REACT_NATIVE_API_URL ||
  DEFAULT_API_BASE_URL;

// Polling interval in milliseconds
const POLLING_INTERVAL_MS = 3000;

// Engaging messages cycled during HK-dir gpt-4o evaluation
const EVALUATION_LOADING_STEPS = [
  'Sensoren vurderer prestasjonen din etter HK-dir sine kriterier for B1/B2...',
  'Analyserer flyt, responstid og turtaking i samtalen...',
  'Vurderer uttale, intonasjon og setningsmelodi...',
  'Sjekker ordforrådets bredde, idiomer og presisjon...',
  'Gransker V2-regelen, leddsetninger og substantivkjønn...',
  'Beregner helhetlig HK-dir måloppnåelse og poengsum...',
];

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
  let barColor = '#EF4444'; // Red (1 - 3)
  if (clampedScore >= 7) {
    barColor = '#10B981'; // Green (7 - 10) -> Solid B2
  } else if (clampedScore >= 5) {
    barColor = '#38BDF8'; // Sky Blue (5 - 6) -> Solid B1
  } else if (clampedScore >= 4) {
    barColor = '#F59E0B'; // Amber (4) -> Under B1 borderline
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
  const score = criterion.score || 1;
  const feedbackText = showEnglish
    ? criterion.feedbackEn || criterion.feedbackNo
    : criterion.feedbackNo;

  const getScoreBadgeText = (val: number) => {
    if (val >= 8) return 'Sterk B2';
    if (val >= 6) return 'B2-nivå';
    if (val >= 5) return 'B1-nivå';
    if (val >= 4) return 'Nærmer seg B1';
    return 'Under B1';
  };

  return (
    <View style={styles.criterionCard}>
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
          <Text style={styles.criterionLevelTag}>{getScoreBadgeText(score)}</Text>
          <Text style={styles.criterionLevelPercent}>HK-dir standard</Text>
        </View>
      </View>

      <View style={styles.criterionFeedbackBox}>
        <Text style={styles.criterionFeedbackText}>{feedbackText}</Text>
      </View>
    </View>
  );
};

export const ExamResultsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { sessionId } = route.params;

  // Polling & Data State
  const [resultsData, setResultsData] = useState<ExamResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Active Candidate Index (0 = CANDIDATE_1, 1 = CANDIDATE_2)
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);

  // Bilingual Feedback Toggle (false = Norwegian, true = English)
  const [showEnglishFeedback, setShowEnglishFeedback] = useState<boolean>(false);

  // Accordion Expand/Collapse States
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState<boolean>(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState<boolean>(false);

  // Loading Animation Values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [loadingStepIndex, setLoadingStepIndex] = useState<number>(0);

  // Polling ref to safely clear timer across unmounts
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingStepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Start engaging loading pulse/rotation
   */
  useEffect(() => {
    if (!isLoading) return;

    // Pulsing circle
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // Subtle spinner rotation
    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2500,
        useNativeDriver: true,
      })
    );
    rotateLoop.start();

    // Cycle through Norwegian HK-dir evaluation messages
    loadingStepTimerRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % EVALUATION_LOADING_STEPS.length);
    }, 3200);

    return () => {
      pulseLoop.stop();
      rotateLoop.stop();
      if (loadingStepTimerRef.current) {
        clearInterval(loadingStepTimerRef.current);
        loadingStepTimerRef.current = null;
      }
    };
  }, [isLoading, pulseAnim, rotateAnim]);

  /**
   * Poll results from backend API
   */
  const fetchResults = useCallback(async (isManualRefresh = false) => {
    if (!sessionId) {
      setPollError('Ugyldig sesjons-ID');
      setIsLoading(false);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    }

    try {
      const endpoint = `${API_BASE_URL}/api/exam/${sessionId}/results`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Eksamensesjonen ble ikke funnet.');
        }
        throw new Error(`Kunne ikke hente resultat (${response.status})`);
      }

      const data: ExamResultsResponse = await response.json();
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
      const message = err instanceof Error ? err.message : 'Feil ved henting av vurdering';
      // If we haven't loaded anything yet, surface error
      if (!resultsData) {
        setPollError(message);
      }
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      }
    }
  }, [sessionId, resultsData]);

  /**
   * Setup polling every 3 seconds while active or evaluation is null
   */
  useEffect(() => {
    // Initial fetch immediately
    fetchResults();

    // Start 3s interval timer
    pollTimerRef.current = setInterval(() => {
      fetchResults();
    }, POLLING_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (loadingStepTimerRef.current) {
        clearInterval(loadingStepTimerRef.current);
        loadingStepTimerRef.current = null;
      }
    };
  }, [fetchResults]);

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
      const summary = `Norskprøven Muntlig Resultat (${currentCandidate.targetLevel})\n` +
        `Kandidat: ${currentCandidate.speakerRole === 'CANDIDATE_1' ? 'Kandidat 1' : 'Kandidat 2'}\n` +
        `Vurdert nivå: ${currentCandidate.assessedLevel}\n` +
        `Målnivå: ${currentCandidate.passedTargetLevel ? 'BESTÅTT' : 'IKKE BESTÅTT'}\n` +
        `Snittscore: ${averageScore}/10\n\n` +
        `Oppsummering: ${currentCandidate.overallSummaryNo}`;

      await Share.share({
        message: summary,
        title: 'Norskprøven Resultat',
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
        return { bg: '#581C87', text: '#E9D5FF', border: '#9333EA' };
      case 'B2':
        return { bg: '#064E3B', text: '#A7F3D0', border: '#10B981' };
      case 'B1':
        return { bg: '#0C4A6E', text: '#BAE6FD', border: '#0284C7' };
      case 'Under B1':
      default:
        return { bg: '#7F1D1D', text: '#FECACA', border: '#EF4444' };
    }
  };

  // Base transcript timestamp for offset calculation
  const baseTimestamp = useMemo(() => {
    const list = resultsData?.transcriptJson || [];
    return list.length > 0 ? list[0].timestamp : 0;
  }, [resultsData]);

  // Spin interpolation
  const spinInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ==========================================
  // RENDER: Loading / Sensor Evaluating State
  // ==========================================
  if (isLoading || (!evaluation && resultsData?.status === 'ACTIVE')) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <View style={styles.sensorBadgeHeader}>
            <Text style={styles.sensorBadgeHeaderText}>HK-DIR SENSOR VURDERING</Text>
          </View>

          {/* Animated Sensor Radar Pulse */}
          <Animated.View
            style={[
              styles.pulseCircleOuter,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.pulseCircleInner,
                {
                  transform: [{ rotate: spinInterpolation }],
                },
              ]}
            >
              <ActivityIndicator size="large" color="#38BDF8" />
            </Animated.View>
          </Animated.View>

          <Text style={styles.loadingMainTitle}>
            Sensoren vurderer prestasjonen din etter HK-dir sine kriterier for B1/B2...
          </Text>

          <View style={styles.loadingStepCard}>
            <View style={styles.loadingStepDot} />
            <Text style={styles.loadingStepText}>
              {EVALUATION_LOADING_STEPS[loadingStepIndex]}
            </Text>
          </View>

          <View style={styles.loadingProgressSteps}>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepLabel}>Transkripsjon</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepLabel}>HK-dir Rubrikk</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepLabel}>Rettelser</Text>
            </View>
          </View>

          <Text style={styles.loadingHelpNote}>
            Dette tar vanligvis 10–25 sekunder mens GPT-4o analyserer grammatikk, uttale og flyt i samtalen.
          </Text>

          {pollError && (
            <View style={styles.pollErrorBanner}>
              <Text style={styles.pollErrorText}>{pollError}</Text>
              <TouchableOpacity
                style={styles.pollRetryButton}
                onPress={() => fetchResults(true)}
              >
                <Text style={styles.pollRetryButtonText}>Prøv igjen</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Error / Missing Evaluation State
  // ==========================================
  if (pollError && !resultsData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Kunne ikke laste resultater</Text>
          <Text style={styles.errorMessage}>{pollError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setIsLoading(true);
              fetchResults(true);
            }}
          >
            <Text style={styles.retryButtonText}>Prøv på nytt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.replace('ExamSetup')}
          >
            <Text style={styles.backButtonText}>Tilbake til start</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Safety fallback if evaluation object is null
  if (!currentCandidate) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>📋</Text>
          <Text style={styles.errorTitle}>Ingen vurdering tilgjengelig</Text>
          <Text style={styles.errorMessage}>
            Det ble ikke funnet noen godkjente ytringer eller evaluering for denne prøven.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigation.replace('ExamSetup')}
          >
            <Text style={styles.retryButtonText}>Start ny prøve</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const badgeColors = getLevelBadgeColors(currentCandidate.assessedLevel);
  const isPassed = currentCandidate.passedTargetLevel;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* TOP APP BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarBackButton}
          onPress={() => navigation.replace('ExamSetup')}
          activeOpacity={0.7}
        >
          <Text style={styles.topBarBackArrow}>←</Text>
          <Text style={styles.topBarBackText}>Ny prøve</Text>
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {resultsData?.topic?.titleNo || 'Eksamensresultat'}
          </Text>
          <Text style={styles.topBarSubtitle}>HK-dir B1/B2 Vurdering</Text>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareResults}
          activeOpacity={0.7}
        >
          <Text style={styles.shareButtonText}>Del</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchResults(true)}
            tintColor="#38BDF8"
            colors={['#38BDF8']}
          />
        }
      >
        {/* SEGMENTED TAB SWITCHER: DUAL CANDIDATE MODE (HUMAN_LOCAL) */}
        {hasDualCandidates && (
          <View style={styles.dualTabsContainer}>
            <View style={styles.dualTabsNotice}>
              <Text style={styles.dualTabsNoticeText}>
                👥 Lokal to-kandidaters prøve – Velg kandidat for å se individuell vurdering:
              </Text>
            </View>
            <View style={styles.dualTabsRow}>
              <TouchableOpacity
                style={[
                  styles.dualTabButton,
                  activeCandidateIndex === 0 && styles.dualTabButtonActive,
                ]}
                onPress={() => setActiveCandidateIndex(0)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dualTabTitle,
                    activeCandidateIndex === 0 && styles.dualTabTitleActive,
                  ]}
                >
                  Kandidat 1 (Speaker 0)
                </Text>
                <View
                  style={[
                    styles.dualTabLevelTag,
                    {
                      backgroundColor:
                        candidates[0]?.passedTargetLevel ? '#064E3B' : '#7F1D1D',
                    },
                  ]}
                >
                  <Text style={styles.dualTabLevelTagText}>
                    {candidates[0]?.assessedLevel}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dualTabButton,
                  activeCandidateIndex === 1 && styles.dualTabButtonActive,
                ]}
                onPress={() => setActiveCandidateIndex(1)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dualTabTitle,
                    activeCandidateIndex === 1 && styles.dualTabTitleActive,
                  ]}
                >
                  Kandidat 2 (Speaker 1)
                </Text>
                <View
                  style={[
                    styles.dualTabLevelTag,
                    {
                      backgroundColor:
                        candidates[1]?.passedTargetLevel ? '#064E3B' : '#7F1D1D',
                    },
                  ]}
                >
                  <Text style={styles.dualTabLevelTagText}>
                    {candidates[1]?.assessedLevel}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 1. SCORECARD HEADER BADGE */}
        <View style={styles.scorecardHeaderCard}>
          <View style={styles.headerCandidateRow}>
            <Text style={styles.headerCandidateLabel}>
              {currentCandidate.speakerRole === 'CANDIDATE_1'
                ? 'Kandidat 1'
                : 'Kandidat 2'}
              {hasDualCandidates ? '' : ' (Deg)'}
            </Text>
            <View style={styles.targetLevelBadge}>
              <Text style={styles.targetLevelBadgeText}>
                Målnivå: {currentCandidate.targetLevel}
              </Text>
            </View>
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
              <Text style={styles.assessedLevelLabel}>Vurdert nivå</Text>
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
              <Text style={styles.scoreMetricLabel}>HK-dir Snitt</Text>
              <Text style={styles.scoreMetricValue}>{averageScore}</Text>
              <Text style={styles.scoreMetricSub}>av 10 poeng</Text>
            </View>
          </View>

          {/* Pass / Needs Work Banner */}
          <View
            style={[
              styles.passStatusBanner,
              isPassed ? styles.passStatusSuccess : styles.passStatusNeedsWork,
            ]}
          >
            <Text style={styles.passStatusIcon}>{isPassed ? '✓' : '!'}</Text>
            <View style={styles.passStatusTextContainer}>
              <Text
                style={[
                  styles.passStatusTitle,
                  { color: isPassed ? '#10B981' : '#F59E0B' },
                ]}
              >
                {isPassed ? 'BESTÅTT MÅLNIVÅ' : 'TRENGER MER ØVING'}
              </Text>
              <Text style={styles.passStatusSubtitle}>
                {isPassed
                  ? `Gratulerer! Du oppfyller HK-dir sine kompetansemål for nivå ${currentCandidate.targetLevel}.`
                  : `Du er vurdert til ${currentCandidate.assessedLevel}. Øv mer for å nå målnivå ${currentCandidate.targetLevel}.`}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. OVERALL SUMMARY SECTION WITH BILINGUAL TOGGLE */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Sensorens helhetsvurdering</Text>
            <TouchableOpacity
              style={styles.langTogglePill}
              onPress={() => setShowEnglishFeedback(!showEnglishFeedback)}
              activeOpacity={0.7}
            >
              <Text style={styles.langToggleLabel}>
                {showEnglishFeedback ? '🇳🇴 Vis på norsk' : '🇬🇧 Show English'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryQuoteBar} />
            <Text style={styles.summaryText}>
              {showEnglishFeedback
                ? currentCandidate.overallSummaryEn || currentCandidate.overallSummaryNo
                : currentCandidate.overallSummaryNo}
            </Text>
          </View>
        </View>

        {/* 3. 4 OFFICIAL HK-DIR CRITERIA CARDS */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>HK-dir Vurderingskriterier</Text>
            <Text style={styles.sectionSubtitle}>Skala 1–10</Text>
          </View>

          {/* 1. Formidling og flyt */}
          <CriterionCard
            titleNo="1. Formidling og flyt"
            titleEn="Fluency, Cohesion & Turn-taking"
            criterion={currentCandidate.criteriaScores.formidlingOgFlyt}
            showEnglish={showEnglishFeedback}
          />

          {/* 2. Uttale og forståelighet */}
          <CriterionCard
            titleNo="2. Uttale og forståelighet"
            titleEn="Pronunciation & Intonation"
            criterion={currentCandidate.criteriaScores.uttaleOgForstaelighet}
            showEnglish={showEnglishFeedback}
          />

          {/* 3. Ordforråd */}
          <CriterionCard
            titleNo="3. Ordforråd"
            titleEn="Vocabulary Breadth & Idiomatic Usage"
            criterion={currentCandidate.criteriaScores.ordforrad}
            showEnglish={showEnglishFeedback}
          />

          {/* 4. Grammatikk og setningsstruktur */}
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
              Konkrete forbedringer fra samtalen
            </Text>
            <View style={styles.correctionCountBadge}>
              <Text style={styles.correctionCountText}>
                {currentCandidate.concreteCorrections.length} eksempler
              </Text>
            </View>
          </View>
          <Text style={styles.sectionExplainer}>
            Sensor har plukket ut konkrete ytringer fra transkripsjonen med forslag til forbedringer:
          </Text>

          {currentCandidate.concreteCorrections.length === 0 ? (
            <View style={styles.emptyCorrectionsCard}>
              <Text style={styles.emptyCorrectionsText}>
                Ingen spesifikke grammatikkfeil registrert i ytringene. God presisjon!
              </Text>
            </View>
          ) : (
            currentCandidate.concreteCorrections.map((item: ConcreteCorrection, idx: number) => (
              <View key={idx} style={styles.correctionCard}>
                <View style={styles.correctionHeaderRow}>
                  <Text style={styles.correctionIndexTag}>Punkt #{idx + 1}</Text>
                </View>

                {/* Red Strikethrough Box: Hva du sa */}
                <View style={styles.correctionBoxRed}>
                  <View style={styles.correctionBoxLabelRow}>
                    <Text style={styles.correctionLabelRed}>✕ HVA DU SA</Text>
                  </View>
                  <Text style={styles.quoteTextRed}>
                    "{item.originalQuote}"
                  </Text>
                </View>

                {/* Green Box: Slik bør det sies */}
                <View style={styles.correctionBoxGreen}>
                  <View style={styles.correctionBoxLabelRow}>
                    <Text style={styles.correctionLabelGreen}>✓ SLIK BØR DET SIES</Text>
                  </View>
                  <Text style={styles.quoteTextGreen}>
                    "{item.correctedNorwegian}"
                  </Text>
                </View>

                {/* Rule Explanation Box */}
                <View style={styles.ruleExplanationBox}>
                  <Text style={styles.ruleLabel}>💡 REGEL & FORKLARING</Text>
                  <Text style={styles.ruleText}>{item.grammarOrVocabRule}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 5. COLLAPSIBLE FULL TRANSCRIPT */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.accordionTitleRow}>
              <Text style={styles.accordionIcon}>💬</Text>
              <View>
                <Text style={styles.accordionTitle}>Full samtalelogg (Transkripsjon)</Text>
                <Text style={styles.accordionSubtitle}>
                  {(resultsData?.transcriptJson || []).length} ytringer registrert under prøven
                </Text>
              </View>
            </View>
            <Text style={styles.accordionChevron}>
              {isTranscriptExpanded ? '▲ Skjul' : '▼ Vis'}
            </Text>
          </TouchableOpacity>

          {isTranscriptExpanded && (
            <View style={styles.transcriptListContainer}>
              {(resultsData?.transcriptJson || []).length === 0 ? (
                <Text style={styles.emptyTranscriptText}>
                  Ingen transkripsjon lagret for denne sesjonen.
                </Text>
              ) : (
                resultsData?.transcriptJson.map((turn: TranscriptTurn, index: number) => {
                  let roleColor = '#38BDF8';
                  let roleName = 'Sensor';
                  let bubbleBg = '#1E293B';

                  if (turn.role === 'AI_COCANDIDATE') {
                    roleColor = '#C084FC';
                    roleName = 'AI-medkandidat';
                    bubbleBg = '#1E1B4B';
                  } else if (turn.role === 'CANDIDATE_1') {
                    roleColor = '#34D399';
                    roleName = 'Kandidat 1';
                    bubbleBg = '#064E3B44';
                  } else if (turn.role === 'CANDIDATE_2') {
                    roleColor = '#FBBF24';
                    roleName = 'Kandidat 2';
                    bubbleBg = '#78350F44';
                  }

                  const timeStr = formatTimestamp(turn.timestamp, baseTimestamp);

                  return (
                    <View
                      key={turn.id || index}
                      style={[styles.transcriptTurnCard, { backgroundColor: bubbleBg }]}
                    >
                      <View style={styles.turnHeader}>
                        <View style={styles.turnRoleTag}>
                          <View
                            style={[
                              styles.turnRoleDot,
                              { backgroundColor: roleColor },
                            ]}
                          />
                          <Text
                            style={[styles.turnRoleText, { color: roleColor }]}
                          >
                            {roleName}
                          </Text>
                        </View>
                        <Text style={styles.turnTimeText}>{timeStr}</Text>
                      </View>
                      <Text style={styles.turnMessageText}>{turn.text}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* 6. COLLAPSIBLE SESSION USAGE & COST FOOTER */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => setIsUsageExpanded(!isUsageExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.accordionTitleRow}>
              <Text style={styles.accordionIcon}>⚡</Text>
              <View>
                <Text style={styles.accordionTitle}>Sesjonsforbruk & Token Ledger</Text>
                <Text style={styles.accordionSubtitle}>
                  Audio, GPT-4o & ElevenLabs ressursbruk
                </Text>
              </View>
            </View>
            <Text style={styles.accordionChevron}>
              {isUsageExpanded ? '▲ Skjul' : '▼ Vis'}
            </Text>
          </TouchableOpacity>

          {isUsageExpanded && (
            <View style={styles.usageDetailsCard}>
              <View style={styles.usageMetricGrid}>
                <View style={styles.usageMetricBox}>
                  <Text style={styles.usageMetricVal}>
                    {sessionUsageSummary.totalSttSeconds} sek
                  </Text>
                  <Text style={styles.usageMetricSub}>Talt lydtid (STT)</Text>
                </View>

                <View style={styles.usageMetricBox}>
                  <Text style={styles.usageMetricVal}>
                    {sessionUsageSummary.totalTokens.toLocaleString('no-NO')}
                  </Text>
                  <Text style={styles.usageMetricSub}>Totale LLM Tokens</Text>
                </View>

                <View style={styles.usageMetricBox}>
                  <Text style={styles.usageMetricVal}>
                    {sessionUsageSummary.totalTtsChars.toLocaleString('no-NO')}
                  </Text>
                  <Text style={styles.usageMetricSub}>TTS Tegn</Text>
                </View>

                <View style={styles.usageMetricBox}>
                  <Text style={styles.usageMetricVal}>
                    ${sessionUsageSummary.totalCostUsdFormatted}
                  </Text>
                  <Text style={styles.usageMetricSub}>Estimert sesjonskost</Text>
                </View>
              </View>

              <View style={styles.usageLedgerEntriesList}>
                <Text style={styles.usageLedgerEntriesTitle}>
                  Ledger transaksjoner ({sessionUsageSummary.entriesCount}):
                </Text>
                {(resultsData?.usage || []).map((entry: UsageLedgerEntry, idx: number) => (
                  <View key={entry.id || idx} style={styles.ledgerRow}>
                    <View style={styles.ledgerRowLeft}>
                      <Text style={styles.ledgerSourceText}>
                        {entry.source === 'POST_EXAM_RUBRIC_EVAL'
                          ? 'Rubrikkvurdering (gpt-4o)'
                          : 'Sanntidssamtale (Voice Agent)'}
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
            </View>
          )}
        </View>

        {/* 7. BOTTOM ACTION BUTTONS */}
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => navigation.replace('ExamSetup')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionButtonText}>
              Ta en ny prøve
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={handleShareResults}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryActionButtonText}>
              Del eller lagre resultat
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ExamResultsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // TOP APP BAR
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0B0F19',
  },
  topBarBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  topBarBackArrow: {
    color: '#38BDF8',
    fontSize: 18,
    marginRight: 4,
    fontWeight: '700',
  },
  topBarBackText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  topBarTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  topBarSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  shareButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  shareButtonText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },

  // DUAL TABS SWITCHER (HUMAN_LOCAL)
  dualTabsContainer: {
    marginBottom: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dualTabsNotice: {
    marginBottom: 8,
  },
  dualTabsNoticeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  dualTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dualTabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  dualTabButtonActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  dualTabTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  dualTabTitleActive: {
    color: '#FFFFFF',
  },
  dualTabLevelTag: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dualTabLevelTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // SCORECARD HEADER CARD
  scorecardHeaderCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  headerCandidateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerCandidateLabel: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  targetLevelBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  targetLevelBadgeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  levelAssessmentRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  assessedLevelBigBadge: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assessedLevelLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    fontWeight: '600',
  },
  assessedLevelValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scoreMetricCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreMetricLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  scoreMetricValue: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 2,
  },
  scoreMetricSub: {
    color: '#64748B',
    fontSize: 10,
  },

  // PASS / NEEDS WORK BANNER
  passStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  passStatusSuccess: {
    backgroundColor: '#064E3B33',
    borderColor: '#059669',
  },
  passStatusNeedsWork: {
    backgroundColor: '#78350F33',
    borderColor: '#D97706',
  },
  passStatusIcon: {
    fontSize: 20,
    fontWeight: '900',
    marginRight: 10,
    color: '#F8FAFC',
  },
  passStatusTextContainer: {
    flex: 1,
  },
  passStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  passStatusSubtitle: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  // SECTIONS
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  sectionExplainer: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },

  // SUMMARY CARD & TOGGLE
  langTogglePill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  langToggleLabel: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
  },
  summaryQuoteBar: {
    width: 4,
    backgroundColor: '#38BDF8',
    borderRadius: 2,
    marginRight: 12,
  },
  summaryText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 22,
  },

  // CRITERION CARD
  criterionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  criterionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  criterionTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  criterionTitleNo: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  criterionTitleEn: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  criterionScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  criterionScoreNumber: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: '800',
  },
  criterionScoreDenominator: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 2,
    fontWeight: '600',
  },
  criterionProgressSection: {
    marginVertical: 6,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  criterionLevelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  criterionLevelTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  criterionLevelPercent: {
    color: '#64748B',
    fontSize: 11,
  },
  criterionFeedbackBox: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3748',
    marginTop: 4,
  },
  criterionFeedbackText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
  },

  // CONCRETE CORRECTIONS
  correctionCountBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  correctionCountText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCorrectionsCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  emptyCorrectionsText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  correctionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  correctionHeaderRow: {
    marginBottom: 8,
  },
  correctionIndexTag: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  correctionBoxRed: {
    backgroundColor: '#450A0A33',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    marginBottom: 8,
  },
  correctionBoxLabelRow: {
    marginBottom: 4,
  },
  correctionLabelRed: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  quoteTextRed: {
    color: '#FCA5A5',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
    textDecorationLine: 'line-through',
  },
  correctionBoxGreen: {
    backgroundColor: '#064E3B33',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#065F46',
    marginBottom: 8,
  },
  correctionLabelGreen: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  quoteTextGreen: {
    color: '#A7F3D0',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  ruleExplanationBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  ruleLabel: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  ruleText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
  },

  // ACCORDIONS (TRANSCRIPT & USAGE)
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accordionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  accordionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  accordionSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  accordionChevron: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },

  // TRANSCRIPT LIST
  transcriptListContainer: {
    marginTop: 8,
    paddingTop: 4,
  },
  emptyTranscriptText: {
    color: '#94A3B8',
    fontSize: 13,
    padding: 12,
    textAlign: 'center',
  },
  transcriptTurnCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  turnRoleTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  turnRoleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  turnRoleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  turnTimeText: {
    color: '#64748B',
    fontSize: 11,
  },
  turnMessageText: {
    color: '#F1F5F9',
    fontSize: 13,
    lineHeight: 19,
  },

  // USAGE DETAILS
  usageDetailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 8,
  },
  usageMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  usageMetricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  usageMetricVal: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '800',
  },
  usageMetricSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  usageLedgerEntriesList: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
  },
  usageLedgerEntriesTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748',
  },
  ledgerRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  ledgerSourceText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  ledgerModelText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  ledgerCostText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },

  // BOTTOM ACTION BUTTONS
  bottomActionsContainer: {
    marginTop: 12,
    gap: 10,
  },
  primaryActionButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionButton: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryActionButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },

  // LOADING STATE STYLES
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sensorBadgeHeader: {
    backgroundColor: '#0C4A6E',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0284C7',
    marginBottom: 28,
  },
  sensorBadgeHeaderText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pulseCircleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0369A122',
    borderWidth: 2,
    borderColor: '#38BDF866',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  pulseCircleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingMainTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  loadingStepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
    width: '100%',
  },
  loadingStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38BDF8',
    marginRight: 12,
  },
  loadingStepText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  loadingProgressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '80%',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  stepLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#334155',
    marginHorizontal: 8,
    marginBottom: 14,
  },
  loadingHelpNote: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  pollErrorBanner: {
    marginTop: 20,
    backgroundColor: '#7F1D1D33',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '100%',
  },
  pollErrorText: {
    color: '#FECACA',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  pollRetryButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pollRetryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ERROR STATE STYLES
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
});
