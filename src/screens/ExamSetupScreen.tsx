import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamTopic,
  GetTopicsResponse,
  StartExamRequest,
  StartExamResponse,
  RootStackParamList,
} from '../types/exam';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamSetup'>;

// Fallback host if env is not injected in React Native bundler
const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.REACT_NATIVE_API_URL ||
  DEFAULT_API_BASE_URL;

// Minimum audio quota required by backend (180 seconds / 3 minutes)
const MIN_REQUIRED_QUOTA_SECONDS = 180;

export const ExamSetupScreen: React.FC<Props> = ({ navigation }) => {
  const [targetLevel, setTargetLevel] = useState<CefrLevel>('B1');
  const [practiceMode, setPracticeMode] = useState<CoCandidateMode>('AI_PEER');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [topics, setTopics] = useState<ExamTopic[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
      // Backend supports ?userId= fallback or test candidate ID
      const testUserId = 'candidate_mobile_user';
      const endpoint = `${API_BASE_URL}/api/exam/topics?userId=${encodeURIComponent(testUserId)}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-user-id': testUserId,
        },
      });

      if (!response.ok) {
        throw new Error(`Kunne ikke hente eksamensevner (${response.status})`);
      }

      const data: GetTopicsResponse = await response.json();
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

  // Auto-select first matching topic if current selected topic does not match level
  useEffect(() => {
    if (filteredTopics.length > 0) {
      const existsInFiltered = filteredTopics.some((t) => t.id === selectedTopicId);
      if (!existsInFiltered) {
        setSelectedTopicId(filteredTopics[0].id);
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
    if (!selectedTopicId) {
      Alert.alert('Velg tema', 'Vennligst velg et eksamenstema før du starter prøven.');
      return;
    }

    if (hasInsufficientQuota) {
      Alert.alert(
        'Utilstrekkelig taletid',
        `Du har kun ${formattedQuota} igjen. Minimum ${MIN_REQUIRED_QUOTA_SECONDS / 60} minutter kreves for å starte en muntlig prøve.`
      );
      return;
    }

    const selectedTopic = topics.find((t) => t.id === selectedTopicId);
    if (!selectedTopic) return;

    setIsStarting(true);
    try {
      const payload: StartExamRequest = {
        userId: 'candidate_mobile_user',
        topicId: selectedTopic.id,
        level: targetLevel,
        coCandidateMode: practiceMode,
      };

      const response = await fetch(`${API_BASE_URL}/api/exam/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': payload.userId || 'candidate_mobile_user',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.error || `Feil ved oppstart av rom (${response.status})`
        );
      }

      const result: StartExamResponse = await response.json();

      // Navigate to the LiveKit Active Exam Room Screen
      navigation.navigate('ExamRoom', {
        sessionId: result.sessionId,
        roomName: result.roomName,
        token: result.token,
        livekitUrl: result.livekitUrl,
        level: targetLevel,
        coCandidateMode: practiceMode,
        topicTitle: selectedTopic.titleNo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Oppstart av muntlig prøve mislyktes';
      Alert.alert('Kunne ikke starte prøven', message);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Norskprøven Muntlig</Text>
          <Text style={styles.headerSubtitle}>Offisiell HK-dir eksamenssimulator</Text>
        </View>

        {/* Quota Badge */}
        <View
          style={[
            styles.quotaBadge,
            hasInsufficientQuota && styles.quotaBadgeInsufficient,
          ]}
        >
          <Text style={styles.quotaBadgeLabel}>Talekvote:</Text>
          <Text
            style={[
              styles.quotaBadgeValue,
              hasInsufficientQuota && styles.quotaBadgeValueInsufficient,
            ]}
          >
            {formattedQuota}
          </Text>
        </View>
      </View>

      {/* Insufficient Quota Warning Banner */}
      {hasInsufficientQuota && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            ⚠️ Lav talekvote. Du trenger minst {MIN_REQUIRED_QUOTA_SECONDS / 60} minutter for å gjennomføre en full prøve.
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Henter tilgjengelige temaer og talekvote...</Text>
        </View>
      ) : fetchError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Tilkoblingsfeil</Text>
          <Text style={styles.errorMessage}>{fetchError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadExamCatalog(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Prøv på nytt</Text>
          </TouchableOpacity>
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
              tintColor="#38BDF8"
              colors={['#38BDF8']}
            />
          }
        >
          {/* Section 1: Target Level Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Velg målnivå (CEFR)</Text>
            <View style={styles.levelSelectorRow}>
              {(['B1', 'B2'] as CefrLevel[]).map((level) => {
                const isSelected = targetLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.levelOption,
                      isSelected && styles.levelOptionSelected,
                    ]}
                    onPress={() => setTargetLevel(level)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.levelOptionTitle,
                        isSelected && styles.levelOptionTitleSelected,
                      ]}
                    >
                      Nivå {level}
                    </Text>
                    <Text
                      style={[
                        styles.levelOptionSubtitle,
                        isSelected && styles.levelOptionSubtitleSelected,
                      ]}
                    >
                      {level === 'B1'
                        ? 'Selvstendig bruker (Middels)'
                        : 'Flytende & Nyansert (Høyere)'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section 2: Practice Mode Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Velg øvingsmodus</Text>

            {/* AI_PEER Card */}
            <TouchableOpacity
              style={[
                styles.modeCard,
                practiceMode === 'AI_PEER' && styles.modeCardSelected,
              ]}
              onPress={() => setPracticeMode('AI_PEER')}
              activeOpacity={0.8}
            >
              <View style={styles.modeCardHeader}>
                <View style={styles.modeRadioOuter}>
                  {practiceMode === 'AI_PEER' && <View style={styles.modeRadioInner} />}
                </View>
                <View style={styles.modeTitleContainer}>
                  <Text style={styles.modeCardTitle}>
                    Øv alene (AI Sensor + AI Medkandidat)
                  </Text>
                  <Text style={styles.modeCardTag}>Anbefalt for egentrening</Text>
                </View>
              </View>
              <Text style={styles.modeCardDescription}>
                AI spiller både den autoriserte sensoren og en vennlig medkandidat i samtaledelen. Full samtalesimulering direkte på telefonen.
              </Text>
            </TouchableOpacity>

            {/* HUMAN_LOCAL Card */}
            <TouchableOpacity
              style={[
                styles.modeCard,
                practiceMode === 'HUMAN_LOCAL' && styles.modeCardSelected,
              ]}
              onPress={() => setPracticeMode('HUMAN_LOCAL')}
              activeOpacity={0.8}
            >
              <View style={styles.modeCardHeader}>
                <View style={styles.modeRadioOuter}>
                  {practiceMode === 'HUMAN_LOCAL' && <View style={styles.modeRadioInner} />}
                </View>
                <View style={styles.modeTitleContainer}>
                  <Text style={styles.modeCardTitle}>
                    Øv med en venn ved siden av deg (Delt mikrofon)
                  </Text>
                  <Text style={styles.modeCardTagDuo}>Delt mikrofon (2 personer)</Text>
                </View>
              </View>
              <Text style={styles.modeCardDescription}>
                AI-sensor leder prøven mens to kandidater sitter fysisk sammen og deler telefonens mikrofon. Sensoren lytter passivt under Del 2 (Samtaleoppgave).
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section 3: Topic Selection */}
          <View style={styles.section}>
            <View style={styles.topicSectionHeader}>
              <Text style={styles.sectionTitle}>3. Velg eksamenstema</Text>
              <Text style={styles.topicCounter}>
                {filteredTopics.length} temaer for {targetLevel}
              </Text>
            </View>

            {filteredTopics.length === 0 ? (
              <View style={styles.emptyTopicsBox}>
                <Text style={styles.emptyTopicsText}>
                  Ingen temaer funnet for nivå {targetLevel}.
                </Text>
              </View>
            ) : (
              filteredTopics.map((topic) => {
                const isSelected = selectedTopicId === topic.id;
                return (
                  <TouchableOpacity
                    key={topic.id}
                    style={[
                      styles.topicCard,
                      isSelected && styles.topicCardSelected,
                    ]}
                    onPress={() => setSelectedTopicId(topic.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.topicCardTop}>
                      <View style={styles.topicLevelBadge}>
                        <Text style={styles.topicLevelBadgeText}>{topic.level}</Text>
                      </View>
                      <Text style={styles.topicCardTitle}>{topic.titleNo}</Text>
                    </View>

                    <Text
                      style={styles.topicCardPreview}
                      numberOfLines={3}
                      ellipsizeMode="tail"
                    >
                      {topic.monologuePromptNo || topic.discussionPromptNo}
                    </Text>

                    {isSelected && (
                      <View style={styles.selectedCheckRow}>
                        <Text style={styles.selectedCheckText}>✓ Valgt tema</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Footer Start Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startButton,
            (isStarting || !selectedTopicId || hasInsufficientQuota) &&
              styles.startButtonDisabled,
          ]}
          onPress={handleStartExam}
          disabled={isStarting || !selectedTopicId || hasInsufficientQuota}
          activeOpacity={0.8}
        >
          {isStarting ? (
            <View style={styles.startingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.startButtonText}>Forbereder eksamensrom...</Text>
            </View>
          ) : (
            <Text style={styles.startButtonText}>Start muntlig prøve</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate 900
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  quotaBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'flex-end',
  },
  quotaBadgeInsufficient: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  quotaBadgeLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  quotaBadgeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    marginTop: 1,
  },
  quotaBadgeValueInsufficient: {
    color: '#EF4444',
  },
  warningBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  warningBannerText: {
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 12,
  },
  levelSelectorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  levelOption: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
  },
  levelOptionSelected: {
    borderColor: '#38BDF8',
    backgroundColor: '#0C4A6E',
  },
  levelOptionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 4,
  },
  levelOptionTitleSelected: {
    color: '#FFFFFF',
  },
  levelOptionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  levelOptionSubtitleSelected: {
    color: '#BAE6FD',
  },
  modeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
    marginBottom: 12,
  },
  modeCardSelected: {
    borderColor: '#38BDF8',
    backgroundColor: '#172554',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modeRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 10,
  },
  modeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38BDF8',
  },
  modeTitleContainer: {
    flex: 1,
  },
  modeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    lineHeight: 20,
  },
  modeCardTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#38BDF8',
    marginTop: 2,
  },
  modeCardTagDuo: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A855F7',
    marginTop: 2,
  },
  modeCardDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    paddingLeft: 30,
  },
  topicSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topicCounter: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyTopicsBox: {
    padding: 24,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTopicsText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  topicCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
    marginBottom: 12,
  },
  topicCardSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  topicCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topicLevelBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
    marginRight: 8,
  },
  topicLevelBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },
  topicCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  topicCardPreview: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
  },
  selectedCheckRow: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedCheckText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  startButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0,
  },
  startingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  retryButtonText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
});
