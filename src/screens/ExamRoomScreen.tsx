import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Animated,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useExamTurns } from '../hooks/useExamTurns';
import type {
  RootStackParamList,
  ExamStage,
} from '../types/exam';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'ExamRoom'>;

/**
 * Animated Audio Waveform Bars Component
 * Renders pulsing bars that indicate live microphone/speech activity
 */
const AudioWaveIndicator: React.FC<{
  isSpeaking: boolean;
  color?: string;
  size?: 'small' | 'normal';
}> = ({ isSpeaking, color = '#38BDF8', size = 'normal' }) => {
  const anim1 = useRef(new Animated.Value(0.3)).current;
  const anim2 = useRef(new Animated.Value(0.6)).current;
  const anim3 = useRef(new Animated.Value(0.4)).current;
  const anim4 = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;

    if (isSpeaking) {
      loop = Animated.loop(
        Animated.stagger(120, [
          Animated.sequence([
            Animated.timing(anim1, { toValue: 1.0, duration: 250, useNativeDriver: false }),
            Animated.timing(anim1, { toValue: 0.2, duration: 250, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(anim2, { toValue: 1.0, duration: 220, useNativeDriver: false }),
            Animated.timing(anim2, { toValue: 0.3, duration: 220, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(anim3, { toValue: 1.0, duration: 280, useNativeDriver: false }),
            Animated.timing(anim3, { toValue: 0.2, duration: 280, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(anim4, { toValue: 1.0, duration: 240, useNativeDriver: false }),
            Animated.timing(anim4, { toValue: 0.3, duration: 240, useNativeDriver: false }),
          ]),
        ])
      );
      loop.start();
    } else {
      anim1.setValue(0.2);
      anim2.setValue(0.2);
      anim3.setValue(0.2);
      anim4.setValue(0.2);
    }

    return () => {
      if (loop) loop.stop();
    };
  }, [isSpeaking, anim1, anim2, anim3, anim4]);

  const barHeight = size === 'small' ? 16 : 24;
  const barWidth = size === 'small' ? 3 : 4;

  return (
    <View style={styles.waveContainer}>
      {[anim1, anim2, anim3, anim4].map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.waveBar,
            {
              width: barWidth,
              backgroundColor: isSpeaking ? color : '#475569',
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, barHeight],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

export const ExamRoomScreen: React.FC<Props> = ({ route, navigation }) => {
  const {
    sessionId,
    level,
    coCandidateMode,
    topicTitle,
    monologuePromptNo,
    discussionPromptNo,
    initialReplies,
    initialTranscript,
  } = route.params;

  const hasNavigatedRef = useRef<boolean>(false);

  const handleNavigateToResults = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigation.replace('ExamResults', { sessionId });
  }, [navigation, sessionId]);

  const {
    phase,
    stage,
    activeAiSpeaker,
    currentReplyText,
    transcripts,
    candidateSpeaker,
    setCandidateSpeaker,
    recordingDurationMs,
    errorMessage,
    hintMessage,
    startRecording,
    stopRecordingAndSubmit,
    skipCurrentSpeech,
    endHumanDiscussion,
    endExamEarly,
    dismissError,
  } = useExamTurns({
    sessionId,
    coCandidateMode,
    initialReplies: initialReplies || [],
    initialTranscript: initialTranscript || [],
    onExamComplete: handleNavigateToResults,
  });

  // Exam elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);
  const transcriptScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll transcript when new turns arrive
  useEffect(() => {
    if (isDrawerExpanded) {
      setTimeout(() => {
        transcriptScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [transcripts.length, isDrawerExpanded]);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

  const formattedRecordingTime = useMemo(() => {
    const totalSec = Math.floor(recordingDurationMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [recordingDurationMs]);

  const handleConfirmEndExam = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(
        'Er du sikker på at du vil avslutte prøven? Sensoren vil umiddelbart generere din HK-dir vurdering.'
      );
      if (ok) {
        endExamEarly();
      }
      return;
    }

    Alert.alert(
      'Avslutt prøve',
      'Er du sikker på at du vil avslutte prøven? Sensoren vil umiddelbart generere din HK-dir vurdering.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Avslutt og få vurdering',
          style: 'destructive',
          onPress: () => {
            endExamEarly();
          },
        },
      ]
    );
  };

  const toggleDrawer = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDrawerExpanded(!isDrawerExpanded);
  };

  const isExaminerSpeaking = phase === 'speaking' && activeAiSpeaker === 'examiner';
  const isAiCoCandidateSpeaking = phase === 'speaking' && activeAiSpeaker === 'co_candidate';
  const isLocalSpeaking = phase === 'recording';

  const statusBadgeLabel =
    phase === 'recording'
      ? 'OPPTAK'
      : phase === 'thinking'
        ? 'TENKER'
        : phase === 'speaking'
          ? 'SENSOR TALER'
          : 'KLAR';

  const currentTaskDescription =
    stage === 'DEL_1'
      ? monologuePromptNo || 'Presenter dine tanker om temaet i en kort monolog.'
      : stage === 'DEL_2'
        ? discussionPromptNo || 'Diskuter temaet med samtalepartneren din.'
        : 'Svar på oppfølgingsspørsmålene fra sensoren.';

  return (
    <SafeAreaView style={styles.roomSafeArea}>
      <StatusBar barStyle="light-content" />

      {/* Top App Bar & Stage Indicator */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.liveIndicator}>
            <View
              style={[
                styles.liveDot,
                phase === 'recording'
                  ? styles.liveDotRecording
                  : phase === 'thinking'
                    ? styles.liveDotThinking
                    : styles.liveDotConnected,
              ]}
            />
            <Text style={styles.liveText}>{statusBadgeLabel}</Text>
          </View>
          <Text style={styles.timerText}>{formattedTimer}</Text>
        </View>

        <View style={styles.topBarCenter}>
          <Text style={styles.examTitleText} numberOfLines={1}>
            {topicTitle}
          </Text>
        </View>

        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{level}</Text>
        </View>
      </View>

      {/* Phase Segmented Pills */}
      <View style={styles.phaseContainer}>
        {(['DEL_1', 'DEL_2', 'DEL_3'] as ExamStage[]).map((pillStage) => {
          const isActive = stage === pillStage;
          const label =
            pillStage === 'DEL_1'
              ? 'Del 1: Monolog'
              : pillStage === 'DEL_2'
                ? 'Del 2: Samtale'
                : 'Del 3: Oppfølging';
          return (
            <View
              key={pillStage}
              style={[styles.phasePill, isActive && styles.phasePillActive]}
            >
              <Text
                style={[styles.phasePillText, isActive && styles.phasePillTextActive]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Task / Active Speech Card */}
        <View style={styles.promptBannerCard}>
          <Text style={styles.promptBannerLabel}>
            {phase === 'speaking'
              ? activeAiSpeaker === 'co_candidate'
                ? 'AI Medkandidat sier:'
                : 'Sensor sier:'
              : `Oppgave (${stage === 'DEL_1' ? 'Del 1' : stage === 'DEL_2' ? 'Del 2' : 'Del 3'}):`}
          </Text>
          <Text style={styles.promptBannerText}>
            {phase === 'speaking' && currentReplyText
              ? currentReplyText
              : currentTaskDescription}
          </Text>
        </View>

        {/* Participant Card 1: Sensor (AI Examiner) */}
        <View
          style={[
            styles.participantCard,
            isExaminerSpeaking && styles.participantCardActive,
          ]}
        >
          <View style={styles.participantHeader}>
            <View style={styles.participantAvatarExaminer}>
              <Text style={styles.avatarLetter}>S</Text>
            </View>
            <View style={styles.participantMeta}>
              <Text style={styles.participantName}>Sensor (AI Sensor)</Text>
              <Text style={styles.participantRole}>Offisiell eksaminator (HK-dir)</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isExaminerSpeaking ? styles.statusBadgeSpeaking : styles.statusBadgeIdle,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isExaminerSpeaking && styles.statusBadgeTextSpeaking,
                ]}
              >
                {isExaminerSpeaking ? 'Taler nå' : 'Lytter'}
              </Text>
            </View>
          </View>

          <View style={styles.participantWaveRow}>
            <AudioWaveIndicator isSpeaking={isExaminerSpeaking} color="#38BDF8" />
          </View>
        </View>

        {/* Participant Card 2: Co-Candidate or Candidate Card */}
        {coCandidateMode === 'AI_PEER' ? (
          <View
            style={[
              styles.participantCard,
              isAiCoCandidateSpeaking && styles.participantCardActiveCo,
              isLocalSpeaking && styles.participantCardActiveLocal,
            ]}
          >
            <View style={styles.participantHeader}>
              <View style={styles.participantAvatarPeer}>
                <Text style={styles.avatarLetter}>M</Text>
              </View>
              <View style={styles.participantMeta}>
                <Text style={styles.participantName}>
                  {stage === 'DEL_2' ? 'AI Medkandidat & Deg' : 'Kandidat (Deg)'}
                </Text>
                <Text style={styles.participantRole}>
                  {stage === 'DEL_2'
                    ? `Samtalepartner på nivå ${level}`
                    : `Målnivå ${level}`}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  isAiCoCandidateSpeaking
                    ? styles.statusBadgeSpeakingCo
                    : isLocalSpeaking
                      ? styles.statusBadgeSpeakingLocal
                      : styles.statusBadgeIdle,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    (isAiCoCandidateSpeaking || isLocalSpeaking) &&
                      styles.statusBadgeTextSpeaking,
                  ]}
                >
                  {isAiCoCandidateSpeaking
                    ? 'Medkandidat taler'
                    : isLocalSpeaking
                      ? 'Du snakker nå'
                      : 'Klar'}
                </Text>
              </View>
            </View>

            <View style={styles.participantWaveRow}>
              <AudioWaveIndicator
                isSpeaking={isAiCoCandidateSpeaking || isLocalSpeaking}
                color={isAiCoCandidateSpeaking ? '#A855F7' : '#10B981'}
              />
            </View>
          </View>
        ) : (
          /* HUMAN_LOCAL Card: Two Humans Sharing Microphone */
          <View
            style={[
              styles.participantCard,
              isLocalSpeaking && styles.participantCardActiveLocal,
            ]}
          >
            <View style={styles.participantHeader}>
              <View style={styles.participantAvatarLocal}>
                <Text style={styles.avatarLetter}>2x</Text>
              </View>
              <View style={styles.participantMeta}>
                <Text style={styles.participantName}>
                  Kandidat 1 & Kandidat 2 (Delt mikrofon)
                </Text>
                <Text style={styles.participantRole}>
                  Aktiv taler:{' '}
                  {candidateSpeaker === 'CANDIDATE_2' ? 'Kandidat 2' : 'Kandidat 1'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  isLocalSpeaking ? styles.statusBadgeSpeakingLocal : styles.statusBadgeIdle,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isLocalSpeaking && styles.statusBadgeTextSpeakingLocal,
                  ]}
                >
                  {isLocalSpeaking ? 'Mikrofon aktiv' : 'Klar'}
                </Text>
              </View>
            </View>

            {/* Candidate 1 / Candidate 2 Selector for HUMAN_LOCAL */}
            <View style={styles.speakerSelectorRow}>
              {(['CANDIDATE_1', 'CANDIDATE_2'] as const).map((cand) => {
                const selected = candidateSpeaker === cand;
                return (
                  <TouchableOpacity
                    key={cand}
                    style={[
                      styles.speakerSelectButton,
                      selected && styles.speakerSelectButtonActive,
                    ]}
                    onPress={() => setCandidateSpeaker(cand)}
                    disabled={phase === 'recording' || phase === 'thinking'}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.speakerSelectButtonText,
                        selected && styles.speakerSelectButtonTextActive,
                      ]}
                    >
                      {cand === 'CANDIDATE_1' ? '👤 Kandidat 1' : '👤 Kandidat 2'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.participantWaveRow}>
              <AudioWaveIndicator isSpeaking={isLocalSpeaking} color="#10B981" />
            </View>
          </View>
        )}

        {/* Hint / Retry Notification */}
        {hintMessage && (
          <View style={styles.hintBanner}>
            <Text style={styles.hintBannerText}>{hintMessage}</Text>
          </View>
        )}

        {/* Error Banner with Retry */}
        {phase === 'error' && errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>Tilkoblings- eller opptaksfeil</Text>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.errorRetryButton}
              onPress={dismissError}
              activeOpacity={0.8}
            >
              <Text style={styles.errorRetryButtonText}>Prøv på nytt</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Turn-Based Microphone Action Card */}
        <View style={styles.micControlCard}>
          {phase === 'speaking' && (
            <View style={styles.micStateBox}>
              <Text style={styles.micStatusTitle}>
                {activeAiSpeaker === 'co_candidate'
                  ? '🔊 AI Medkandidat snakker...'
                  : '🔊 Sensor snakker...'}
              </Text>
              <Text style={styles.micStatusSubtext}>
                Lytt til oppgaven. Det blir din tur straks talen er ferdig.
              </Text>
              <TouchableOpacity
                style={styles.skipSpeechButton}
                onPress={skipCurrentSpeech}
                activeOpacity={0.8}
              >
                <Text style={styles.skipSpeechButtonText}>
                  Hopp over tale — Svar nå →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'listening' && (
            <View style={styles.micStateBox}>
              <Text style={styles.micStatusTitle}>Din tur til å snakke</Text>
              <Text style={styles.micStatusSubtext}>
                Trykk på knappen under for å starte opptaket. Opptaket stopper automatisk ved pause, eller når du trykker «Ferdig».
              </Text>
              <TouchableOpacity
                style={styles.recordStartButton}
                onPress={startRecording}
                activeOpacity={0.85}
              >
                <Text style={styles.recordStartButtonText}>
                  🎙️ Trykk for å snakke
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'recording' && (
            <View style={styles.micStateBox}>
              <Text style={styles.micStatusTitleRecording}>
                🔴 Opptak pågår ({formattedRecordingTime})
              </Text>
              <Text style={styles.micStatusSubtext}>
                Snakk tydelig på norsk. Trykk «Ferdig å snakke» når du har svart.
              </Text>
              <TouchableOpacity
                style={styles.recordStopButton}
                onPress={stopRecordingAndSubmit}
                activeOpacity={0.85}
              >
                <Text style={styles.recordStopButtonText}>
                  ⏹ Ferdig å snakke — Send svar
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'thinking' && (
            <View style={styles.micStateBox}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={[styles.micStatusTitle, { marginTop: 10 }]}>
                Behandler svaret ditt...
              </Text>
              <Text style={styles.micStatusSubtext}>
                Transkriberer norsk tale og genererer neste respons
              </Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.micStateBox}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={[styles.micStatusTitle, { marginTop: 8 }]}>
                Prøven er fullført! Henter vurdering...
              </Text>
            </View>
          )}
        </View>

        {/* Local Duo Mode (HUMAN_LOCAL) Moderator Controls during Del 2 */}
        {coCandidateMode === 'HUMAN_LOCAL' && stage === 'DEL_2' && (
          <View style={styles.moderatorBox}>
            <View style={styles.moderatorIconRow}>
              <Text style={styles.moderatorIcon}>👥</Text>
              <Text style={styles.moderatorTitle}>Del 2: Samtale mellom Kandidat 1 og 2</Text>
            </View>

            <Text style={styles.moderatorDescription}>
              Ta opp flere replikker mellom Kandidat 1 og Kandidat 2. Sensoren lytter passivt uten å avbryte. Når dere er ferdige med diskusjonen, trykk på knappen under for å gå til Del 3.
            </Text>

            <TouchableOpacity
              style={[
                styles.endDiscussionButton,
                phase === 'thinking' && styles.endDiscussionButtonDisabled,
              ]}
              onPress={endHumanDiscussion}
              disabled={phase === 'thinking'}
              activeOpacity={0.8}
            >
              <Text style={styles.endDiscussionButtonText}>
                Fullfør diskusjon — Gå til Del 3 (Oppfølgingsspørsmål)
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Live Transcript Drawer */}
      <View
        style={[
          styles.transcriptDrawer,
          isDrawerExpanded && styles.transcriptDrawerExpanded,
        ]}
      >
        <TouchableOpacity
          style={styles.transcriptDrawerHandle}
          onPress={toggleDrawer}
          activeOpacity={0.7}
        >
          <View style={styles.drawerHandleBar} />
          <View style={styles.transcriptHeaderRow}>
            <Text style={styles.transcriptHeaderTitle}>
              Transkripsjon ({transcripts.length})
            </Text>
            <Text style={styles.drawerExpandHint}>
              {isDrawerExpanded ? 'Skjul ▾' : 'Vis transkripsjon ▴'}
            </Text>
          </View>
        </TouchableOpacity>

        {isDrawerExpanded && (
          <ScrollView
            ref={transcriptScrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {transcripts.length === 0 ? (
              <Text style={styles.emptyTranscriptText}>
                Transkripsjon vises her etter hvert som deltakerne snakker...
              </Text>
            ) : (
              transcripts.map((turn, index) => {
                const isExaminer = turn.role === 'EXAMINER';
                const isPeer = turn.role === 'AI_COCANDIDATE';
                const isCandidate2 = turn.role === 'CANDIDATE_2';

                return (
                  <View key={turn.id || index} style={styles.turnCard}>
                    <View style={styles.turnHeader}>
                      <View
                        style={[
                          styles.turnRoleBadge,
                          isExaminer && styles.turnRoleExaminer,
                          isPeer && styles.turnRolePeer,
                          isCandidate2 && styles.turnRoleCand2,
                        ]}
                      >
                        <Text style={styles.turnRoleBadgeText}>
                          {isExaminer
                            ? 'Sensor'
                            : isPeer
                              ? 'AI Medkandidat'
                              : isCandidate2
                                ? 'Kandidat 2'
                                : 'Kandidat 1'}
                        </Text>
                      </View>
                      <Text style={styles.turnTimestamp}>
                        {new Date(turn.timestamp).toLocaleTimeString([], {
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={styles.turnText}>{turn.text}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      {/* Bottom Action Footer */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.endExamButton}
          onPress={handleConfirmEndExam}
          activeOpacity={0.8}
        >
          <Text style={styles.endExamButtonText}>
            Avslutt prøve og få vurdering
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  roomSafeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  liveDotConnected: {
    backgroundColor: '#10B981',
  },
  liveDotRecording: {
    backgroundColor: '#EF4444',
  },
  liveDotThinking: {
    backgroundColor: '#F59E0B',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    fontVariant: ['tabular-nums'],
  },
  topBarCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  examTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E2E8F0',
    textAlign: 'center',
  },
  levelBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  phaseContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    gap: 8,
  },
  phasePill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  phasePillActive: {
    backgroundColor: '#38BDF8',
  },
  phasePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  phasePillTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    padding: 16,
    gap: 14,
  },
  promptBannerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#38BDF8',
  },
  promptBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  promptBannerText: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
  },
  participantCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
  },
  participantCardActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  participantCardActiveCo: {
    borderColor: '#A855F7',
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  participantCardActiveLocal: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantAvatarExaminer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0369A1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarPeer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7E22CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarLocal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  participantMeta: {
    flex: 1,
    marginLeft: 12,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  participantRole: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeIdle: {
    backgroundColor: '#334155',
  },
  statusBadgeSpeaking: {
    backgroundColor: '#0284C7',
  },
  statusBadgeSpeakingCo: {
    backgroundColor: '#9333EA',
  },
  statusBadgeSpeakingLocal: {
    backgroundColor: '#059669',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  statusBadgeTextSpeaking: {
    color: '#FFFFFF',
  },
  statusBadgeTextSpeakingLocal: {
    color: '#FFFFFF',
  },
  speakerSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  speakerSelectButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: '#0F172A',
    alignItems: 'center',
  },
  speakerSelectButtonActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  speakerSelectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  speakerSelectButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  participantWaveRow: {
    marginTop: 12,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
  },
  waveBar: {
    borderRadius: 2,
  },
  hintBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  hintBannerText: {
    color: '#FDE68A',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  errorBannerTitle: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBannerText: {
    color: '#FECACA',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorRetryButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorRetryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  micControlCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#334155',
    alignItems: 'center',
  },
  micStateBox: {
    width: '100%',
    alignItems: 'center',
  },
  micStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  micStatusTitleRecording: {
    fontSize: 16,
    fontWeight: '800',
    color: '#34D399',
    textAlign: 'center',
  },
  micStatusSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
  },
  recordStartButton: {
    width: '100%',
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordStartButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  recordStopButton: {
    width: '100%',
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordStopButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  skipSpeechButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: '#0F172A',
  },
  skipSpeechButtonText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  moderatorBox: {
    backgroundColor: '#1E1B4B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#6366F1',
  },
  moderatorIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  moderatorIcon: {
    fontSize: 18,
  },
  moderatorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E0E7FF',
  },
  moderatorDescription: {
    fontSize: 13,
    color: '#C7D2FE',
    lineHeight: 19,
    marginBottom: 14,
  },
  endDiscussionButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endDiscussionButtonDisabled: {
    backgroundColor: '#3730A3',
  },
  endDiscussionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  transcriptDrawer: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: 180,
  },
  transcriptDrawerExpanded: {
    maxHeight: 320,
  },
  transcriptDrawerHandle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  drawerHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginBottom: 8,
  },
  transcriptHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transcriptHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  drawerExpandHint: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  emptyTranscriptText: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  turnCard: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  turnRoleBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  turnRoleExaminer: {
    backgroundColor: '#0284C7',
  },
  turnRolePeer: {
    backgroundColor: '#9333EA',
  },
  turnRoleCand2: {
    backgroundColor: '#D97706',
  },
  turnRoleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  turnTimestamp: {
    fontSize: 10,
    color: '#64748B',
  },
  turnText: {
    fontSize: 13,
    color: '#F1F5F9',
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  endExamButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endExamButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
