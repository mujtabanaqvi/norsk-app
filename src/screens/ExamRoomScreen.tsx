import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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
import { Card, Badge, Button, Icon, Waveform } from '../components/ui';
import { colors, radius, shadow, space, type } from '../theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'ExamRoom'>;

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
  const transcriptScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pulse animation while recording
  useEffect(() => {
    if (phase !== 'recording') {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.16,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

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
    <SafeAreaView edges={['top']} style={styles.topSafeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      {/* Solid Navy Top Bar & Stage Stepper */}
      <View style={styles.navyHeader}>
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
                {isActive && <View style={styles.phaseDot} />}
                <Text
                  style={[styles.phasePillText, isActive && styles.phasePillTextActive]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Main Light Room Body */}
      <View style={styles.roomBody}>
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentWrapper}>
            {/* Current Task / Active Speech Card */}
            <Card style={styles.promptBannerCard}>
              <View style={styles.promptBannerHeader}>
                <Icon
                  name={phase === 'speaking' ? 'volume-high-outline' : 'document-text-outline'}
                  size={16}
                  color={colors.red}
                />
                <Text style={styles.promptBannerLabel}>
                  {phase === 'speaking'
                    ? activeAiSpeaker === 'co_candidate'
                      ? 'AI Medkandidat sier:'
                      : 'Sensor sier:'
                    : `Oppgave (${stage === 'DEL_1' ? 'Del 1' : stage === 'DEL_2' ? 'Del 2' : 'Del 3'}):`}
                </Text>
              </View>
              <Text style={styles.promptBannerText}>
                {phase === 'speaking' && currentReplyText
                  ? currentReplyText
                  : currentTaskDescription}
              </Text>
            </Card>

            {/* Participant Card 1: Sensor (AI Examiner) */}
            <Card
              style={[
                styles.participantCard,
                isExaminerSpeaking && styles.participantCardActiveNavy,
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
                <Badge
                  label={isExaminerSpeaking ? 'Taler nå' : 'Lytter'}
                  tone={isExaminerSpeaking ? 'solidNavy' : 'neutral'}
                />
              </View>

              <View style={styles.participantWaveRow}>
                <Waveform
                  active={isExaminerSpeaking}
                  color={isExaminerSpeaking ? colors.navy : colors.borderStrong}
                  accentColor={isExaminerSpeaking ? colors.red : colors.borderStrong}
                  height={24}
                  barWidth={4}
                />
              </View>
            </Card>

            {/* Participant Card 2: Co-Candidate or Candidate Card */}
            {coCandidateMode === 'AI_PEER' ? (
              <Card
                style={[
                  styles.participantCard,
                  (isAiCoCandidateSpeaking || isLocalSpeaking) &&
                    styles.participantCardActiveRed,
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
                  <Badge
                    label={
                      isAiCoCandidateSpeaking
                        ? 'Medkandidat taler'
                        : isLocalSpeaking
                          ? 'Du snakker nå'
                          : 'Klar'
                    }
                    tone={
                      isAiCoCandidateSpeaking
                        ? 'navy'
                        : isLocalSpeaking
                          ? 'solidRed'
                          : 'neutral'
                    }
                  />
                </View>

                <View style={styles.participantWaveRow}>
                  <Waveform
                    active={isAiCoCandidateSpeaking || isLocalSpeaking}
                    color={
                      isAiCoCandidateSpeaking || isLocalSpeaking
                        ? colors.red
                        : colors.borderStrong
                    }
                    accentColor={
                      isAiCoCandidateSpeaking || isLocalSpeaking
                        ? colors.navy
                        : colors.borderStrong
                    }
                    height={24}
                    barWidth={4}
                  />
                </View>
              </Card>
            ) : (
              /* HUMAN_LOCAL Card: Two Humans Sharing Microphone */
              <Card
                style={[
                  styles.participantCard,
                  isLocalSpeaking && styles.participantCardActiveRed,
                ]}
              >
                <View style={styles.participantHeader}>
                  <View style={styles.participantAvatarLocal}>
                    <Text style={styles.avatarLetterLocal}>2x</Text>
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
                  <Badge
                    label={isLocalSpeaking ? 'Mikrofon aktiv' : 'Klar'}
                    tone={isLocalSpeaking ? 'solidRed' : 'neutral'}
                  />
                </View>

                {/* Candidate 1 / Candidate 2 Selector for HUMAN_LOCAL */}
                <View style={styles.speakerSelectorRow}>
                  {(['CANDIDATE_1', 'CANDIDATE_2'] as const).map((cand) => {
                    const selected = candidateSpeaker === cand;
                    return (
                      <Pressable
                        key={cand}
                        style={[
                          styles.speakerSelectButton,
                          selected && styles.speakerSelectButtonActive,
                        ]}
                        onPress={() => setCandidateSpeaker(cand)}
                        disabled={phase === 'recording' || phase === 'thinking'}
                      >
                        <Icon
                          name="person-outline"
                          size={15}
                          color={selected ? colors.white : colors.navy}
                        />
                        <Text
                          style={[
                            styles.speakerSelectButtonText,
                            selected && styles.speakerSelectButtonTextActive,
                          ]}
                        >
                          {cand === 'CANDIDATE_1' ? 'Kandidat 1' : 'Kandidat 2'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.participantWaveRow}>
                  <Waveform
                    active={isLocalSpeaking}
                    color={isLocalSpeaking ? colors.red : colors.borderStrong}
                    accentColor={isLocalSpeaking ? colors.navy : colors.borderStrong}
                    height={24}
                    barWidth={4}
                  />
                </View>
              </Card>
            )}

            {/* Hint / Retry Notification */}
            {hintMessage && (
              <View style={styles.hintBanner}>
                <Icon name="information-circle" size={18} color={colors.navy} />
                <Text style={styles.hintBannerText}>{hintMessage}</Text>
              </View>
            )}

            {/* Error Banner with Retry */}
            {phase === 'error' && errorMessage && (
              <View style={styles.errorBanner}>
                <View style={styles.errorHeaderRow}>
                  <Icon name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.errorBannerTitle}>Tilkoblings- eller opptaksfeil</Text>
                </View>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
                <Button
                  title="Prøv på nytt"
                  variant="primary"
                  size="sm"
                  icon="refresh"
                  onPress={dismissError}
                />
              </View>
            )}

            {/* Turn-Based Microphone Action Card (Hero) */}
            <Card style={styles.micControlCard}>
              {phase === 'speaking' && (
                <View style={styles.micStateBox}>
                  <View style={styles.speakingBadgeCircle}>
                    <Waveform
                      active={true}
                      color={colors.white}
                      accentColor={colors.navy}
                      height={26}
                      barWidth={4}
                    />
                  </View>
                  <Text style={styles.micStatusTitle}>
                    {activeAiSpeaker === 'co_candidate'
                      ? 'AI Medkandidat snakker...'
                      : 'Sensor snakker...'}
                  </Text>
                  <Text style={styles.micStatusSubtext}>
                    Lytt til oppgaven. Det blir din tur straks talen er ferdig.
                  </Text>
                  <Button
                    title="Hopp over tale — Svar nå"
                    variant="outline"
                    size="md"
                    iconRight="arrow-forward"
                    onPress={skipCurrentSpeech}
                  />
                </View>
              )}

              {phase === 'listening' && (
                <View style={styles.micStateBox}>
                  <Pressable
                    onPress={startRecording}
                    accessibilityRole="button"
                    accessibilityLabel="Trykk for å snakke"
                    style={({ pressed }) => [
                      styles.heroMicButton,
                      pressed && styles.heroMicButtonPressed,
                    ]}
                  >
                    <Icon name="mic" size={34} color={colors.white} />
                  </Pressable>
                  <Text style={styles.micStatusTitle}>Din tur til å snakke</Text>
                  <Text style={styles.micStatusSubtext}>
                    Trykk på mikrofonen for å starte opptaket. Opptaket stopper automatisk ved pause, eller når du trykker «Ferdig».
                  </Text>
                  <Button
                    title="Trykk for å snakke"
                    variant="primary"
                    size="lg"
                    icon="mic"
                    fullWidth
                    onPress={startRecording}
                  />
                </View>
              )}

              {phase === 'recording' && (
                <View style={styles.micStateBox}>
                  <View style={styles.recordingOrbWrapper}>
                    <Animated.View
                      style={[
                        styles.recordingPulseRing,
                        { transform: [{ scale: pulseAnim }] },
                      ]}
                    />
                    <Pressable
                      onPress={stopRecordingAndSubmit}
                      accessibilityRole="button"
                      accessibilityLabel="Ferdig å snakke — Send svar"
                      style={styles.heroMicButtonRecording}
                    >
                      <Waveform
                        active={true}
                        color={colors.white}
                        accentColor={colors.navy}
                        height={28}
                        barWidth={4}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.micStatusTitleRecording}>
                    Opptak pågår ({formattedRecordingTime})
                  </Text>
                  <Text style={styles.micStatusSubtext}>
                    Snakk tydelig på norsk. Trykk «Ferdig å snakke» når du har svart.
                  </Text>
                  <Button
                    title="Ferdig å snakke — Send svar"
                    variant="secondary"
                    size="lg"
                    icon="stop"
                    fullWidth
                    onPress={stopRecordingAndSubmit}
                  />
                </View>
              )}

              {phase === 'thinking' && (
                <View style={styles.micStateBox}>
                  <ActivityIndicator size="large" color={colors.red} />
                  <Text style={[styles.micStatusTitle, { marginTop: space.sm }]}>
                    Behandler svaret ditt...
                  </Text>
                  <Text style={styles.micStatusSubtext}>
                    Transkriberer norsk tale og genererer neste respons
                  </Text>
                </View>
              )}

              {phase === 'done' && (
                <View style={styles.micStateBox}>
                  <ActivityIndicator size="small" color={colors.success} />
                  <Text style={[styles.micStatusTitle, { marginTop: space.xs }]}>
                    Prøven er fullført! Henter vurdering...
                  </Text>
                </View>
              )}
            </Card>

            {/* Local Duo Mode (HUMAN_LOCAL) Moderator Controls during Del 2 */}
            {coCandidateMode === 'HUMAN_LOCAL' && stage === 'DEL_2' && (
              <Card style={styles.moderatorBox}>
                <View style={styles.moderatorIconRow}>
                  <Icon name="people" size={20} color={colors.navy} />
                  <Text style={styles.moderatorTitle}>
                    Del 2: Samtale mellom Kandidat 1 og 2
                  </Text>
                </View>

                <Text style={styles.moderatorDescription}>
                  Ta opp flere replikker mellom Kandidat 1 og Kandidat 2. Sensoren lytter passivt uten å avbryte. Når dere er ferdige med diskusjonen, trykk på knappen under for å gå til Del 3.
                </Text>

                <Button
                  title="Fullfør diskusjon — Gå til Del 3"
                  variant="secondary"
                  size="md"
                  iconRight="arrow-forward"
                  fullWidth
                  disabled={phase === 'thinking'}
                  onPress={endHumanDiscussion}
                />
              </Card>
            )}
          </View>
        </ScrollView>

        {/* Live Transcript Drawer */}
        <View
          style={[
            styles.transcriptDrawer,
            isDrawerExpanded && styles.transcriptDrawerExpanded,
          ]}
        >
          <Pressable
            style={styles.transcriptDrawerHandle}
            onPress={toggleDrawer}
          >
            <View style={styles.drawerHandleBar} />
            <View style={styles.transcriptHeaderRow}>
              <View style={styles.transcriptTitleGroup}>
                <Icon name="chatbubbles-outline" size={16} color={colors.navy} />
                <Text style={styles.transcriptHeaderTitle}>
                  Transkripsjon ({transcripts.length})
                </Text>
              </View>
              <View style={styles.transcriptHintGroup}>
                <Text style={styles.drawerExpandHint}>
                  {isDrawerExpanded ? 'Skjul' : 'Vis transkripsjon'}
                </Text>
                <Icon
                  name={isDrawerExpanded ? 'chevron-down' : 'chevron-up'}
                  size={16}
                  color={colors.red}
                />
              </View>
            </View>
          </Pressable>

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
                    <View
                      key={turn.id || index}
                      style={[
                        styles.turnCard,
                        isExaminer
                          ? styles.turnBubbleExaminer
                          : isPeer
                            ? styles.turnBubblePeer
                            : styles.turnBubbleCandidate,
                      ]}
                    >
                      <View style={styles.turnHeader}>
                        <Badge
                          label={
                            isExaminer
                              ? 'Sensor'
                              : isPeer
                                ? 'AI Medkandidat'
                                : isCandidate2
                                  ? 'Kandidat 2'
                                  : 'Kandidat 1'
                          }
                          tone={isExaminer ? 'solidNavy' : isPeer ? 'neutral' : 'solidRed'}
                        />
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
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <View style={styles.bottomBarInner}>
            <Button
              title="Avslutt prøve og få vurdering"
              variant="outline"
              size="md"
              icon="flag-outline"
              fullWidth
              onPress={handleConfirmEndExam}
            />
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  topSafeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  navyHeader: {
    backgroundColor: colors.navy,
    paddingBottom: space.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navyLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  liveDotConnected: {
    backgroundColor: colors.success,
  },
  liveDotRecording: {
    backgroundColor: colors.red,
  },
  liveDotThinking: {
    backgroundColor: colors.gold,
  },
  liveText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  topBarCenter: {
    flex: 1,
    marginHorizontal: space.xs,
  },
  examTitleText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  levelBadge: {
    backgroundColor: colors.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  levelBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  phaseContainer: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    gap: space.xs,
  },
  phasePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.navyLight,
  },
  phasePillActive: {
    backgroundColor: colors.red,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  phasePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.navySoft,
  },
  phasePillTextActive: {
    color: colors.white,
    fontWeight: '800',
  },
  roomBody: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    padding: space.lg,
    paddingBottom: space.xl,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: space.md,
  },
  promptBannerCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.red,
  },
  promptBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  promptBannerLabel: {
    ...type.overline,
    color: colors.red,
  },
  promptBannerText: {
    ...type.bodyStrong,
    fontSize: 15,
    lineHeight: 22,
  },
  participantCard: {
    padding: space.lg,
  },
  participantCardActiveNavy: {
    borderColor: colors.navy,
    borderWidth: 1.5,
  },
  participantCardActiveRed: {
    borderColor: colors.red,
    borderWidth: 1.5,
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantAvatarExaminer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  participantAvatarPeer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  participantAvatarLocal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  avatarLetter: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  avatarLetterLocal: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  participantMeta: {
    flex: 1,
    marginRight: space.sm,
  },
  participantName: {
    ...type.bodyStrong,
  },
  participantRole: {
    ...type.caption,
    marginTop: 1,
  },
  participantWaveRow: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  speakerSelectorRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  speakerSelectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakerSelectButtonActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  speakerSelectButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  speakerSelectButtonTextActive: {
    color: colors.white,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.navySoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  hintBannerText: {
    ...type.caption,
    color: colors.navy,
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: space.xs,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  errorBannerTitle: {
    ...type.bodyStrong,
    color: colors.danger,
  },
  errorBannerText: {
    ...type.caption,
    color: colors.text,
    marginBottom: space.xs,
  },
  micControlCard: {
    padding: space.xl,
  },
  micStateBox: {
    alignItems: 'center',
    gap: space.sm,
  },
  speakingBadgeCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  heroMicButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
    ...shadow.raised,
  },
  heroMicButtonPressed: {
    backgroundColor: colors.redPressed,
  },
  recordingOrbWrapper: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  recordingPulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.redSoft,
    borderWidth: 2,
    borderColor: colors.red,
  },
  heroMicButtonRecording: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  micStatusTitle: {
    ...type.heading,
    textAlign: 'center',
  },
  micStatusTitleRecording: {
    ...type.heading,
    color: colors.red,
    textAlign: 'center',
  },
  micStatusSubtext: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  moderatorBox: {
    backgroundColor: colors.navySoft,
    borderColor: colors.navy,
    gap: space.sm,
  },
  moderatorIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  moderatorTitle: {
    ...type.bodyStrong,
    flex: 1,
  },
  moderatorDescription: {
    ...type.caption,
    color: colors.textSecondary,
    marginBottom: space.xs,
  },
  transcriptDrawer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: 56,
  },
  transcriptDrawerExpanded: {
    maxHeight: 280,
  },
  transcriptDrawerHandle: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  drawerHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: space.xs,
  },
  transcriptHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 680,
  },
  transcriptTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transcriptHeaderTitle: {
    ...type.caption,
    color: colors.text,
    fontWeight: '700',
  },
  transcriptHintGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  drawerExpandHint: {
    fontSize: 12,
    color: colors.red,
    fontWeight: '700',
  },
  transcriptScroll: {
    paddingHorizontal: space.lg,
  },
  transcriptScrollContent: {
    paddingBottom: space.md,
    gap: space.sm,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  emptyTranscriptText: {
    ...type.caption,
    textAlign: 'center',
    paddingVertical: space.lg,
  },
  turnCard: {
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
  turnTimestamp: {
    fontSize: 11,
    color: colors.textMuted,
  },
  turnText: {
    ...type.body,
    color: colors.text,
    fontSize: 14,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  bottomBarInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
});
