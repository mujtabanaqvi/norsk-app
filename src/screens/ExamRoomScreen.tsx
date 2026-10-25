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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useExamTurns } from '../hooks/useExamTurns';
import { useLocale } from '../hooks/useLocale';
import type {
  RootStackParamList,
  ExamStage,
} from '../types/exam';
import { Card, Badge, Button, Icon, Waveform, type BadgeTone } from '../components/ui';
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

  const { t } = useLocale();
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
      const ok = window.confirm(t('room.endConfirmBody'));
      if (ok) {
        endExamEarly();
      }
      return;
    }

    Alert.alert(
      t('room.endConfirmTitle'),
      t('room.endConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('room.endConfirmAction'),
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
      ? t('room.statusRecording')
      : phase === 'thinking'
        ? t('room.statusThinking')
        : phase === 'speaking'
          ? t('room.statusSpeaking')
          : t('room.statusReady');

  const currentTaskDescription =
    stage === 'DEL_1'
      ? monologuePromptNo || t('room.defaultTaskDel1')
      : stage === 'DEL_2'
        ? discussionPromptNo || t('room.defaultTaskDel2')
        : t('room.defaultTaskDel3');

  const stageNumber = stage === 'DEL_1' ? 1 : stage === 'DEL_2' ? 2 : 3;

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

          <View style={styles.topBarSpacer} />

          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{level}</Text>
          </View>

          <Pressable
            onPress={handleConfirmEndExam}
            style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('room.endExam')}
            hitSlop={6}
          >
            <Icon name="flag-outline" size={16} color={colors.white} />
            <Text style={styles.endButtonText}>{t('room.endShort')}</Text>
          </Pressable>
        </View>

        <Text style={styles.examTitleText} numberOfLines={1}>
          {topicTitle}
        </Text>

        {/* Phase Segmented Pills */}
        <View style={styles.phaseContainer}>
          {(['DEL_1', 'DEL_2', 'DEL_3'] as ExamStage[]).map((pillStage) => {
            const isActive = stage === pillStage;
            const label =
              pillStage === 'DEL_1'
                ? t('room.pillDel1')
                : pillStage === 'DEL_2'
                  ? t('room.pillDel2')
                  : t('room.pillDel3');
            return (
              <View
                key={pillStage}
                style={[styles.phasePill, isActive && styles.phasePillActive]}
              >
                {isActive && <View style={styles.phaseDot} />}
                <Text
                  style={[styles.phasePillText, isActive && styles.phasePillTextActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Main Light Room Body: fixed layout, the mic dock is always on screen */}
      <View style={styles.roomBody}>
        <View style={styles.mainArea}>
          <View style={styles.contentWrapper}>
            {/* Current Task / Active Speech Card — long prompts scroll inside the card */}
            <Card style={styles.promptBannerCard}>
              <View style={styles.promptBannerHeader}>
                <Icon
                  name={phase === 'speaking' ? 'volume-high-outline' : 'document-text-outline'}
                  size={18}
                  color={colors.red}
                />
                <Text style={styles.promptBannerLabel}>
                  {phase === 'speaking'
                    ? activeAiSpeaker === 'co_candidate'
                      ? t('room.coCandidateSays')
                      : t('room.examinerSays')
                    : t('room.task', { part: t('room.part', { n: stageNumber }) })}
                </Text>
              </View>
              <ScrollView style={styles.promptScroll} showsVerticalScrollIndicator={true}>
                <Text style={styles.promptBannerText}>
                  {phase === 'speaking' && currentReplyText
                    ? currentReplyText
                    : currentTaskDescription}
                </Text>
              </ScrollView>
            </Card>

            {/* Exam table: the examiner sits across from the candidates, who sit side by side */}
            <View style={styles.examTable}>
              <Text style={styles.seatLabel}>{t('room.seatAcross')}</Text>
              <SeatTile
                style={styles.examinerSeat}
                avatar="S"
                avatarColor={colors.navy}
                name={t('room.examinerName')}
                role={t('room.examinerRole')}
                badgeLabel={isExaminerSpeaking ? t('room.speakingNow') : t('room.listening')}
                badgeTone={isExaminerSpeaking ? 'solidNavy' : 'neutral'}
                active={isExaminerSpeaking}
                activeColor={colors.navy}
              />

              <View style={styles.tableEdge}>
                <View style={styles.tableEdgeLine} />
                <Text style={styles.seatLabel}>{t('room.seatYourSide')}</Text>
                <View style={styles.tableEdgeLine} />
              </View>

              <View style={styles.candidatesRow}>
                {coCandidateMode === 'AI_PEER' ? (
                  <>
                    <SeatTile
                      avatar="M"
                      avatarColor={colors.navyLight}
                      name={t('room.coCandidateName')}
                      role={t('room.peerRole', { level })}
                      badgeLabel={
                        isAiCoCandidateSpeaking
                          ? t('room.speakingNow')
                          : stage === 'DEL_2'
                            ? t('room.listening')
                            : t('room.waiting')
                      }
                      badgeTone={isAiCoCandidateSpeaking ? 'solidNavy' : 'neutral'}
                      active={isAiCoCandidateSpeaking}
                      activeColor={colors.navyLight}
                      dimmed={stage !== 'DEL_2'}
                    />
                    <SeatTile
                      avatar={t('room.you')}
                      avatarColor={colors.red}
                      name={t('room.candidateYou')}
                      role={t('room.targetLevel', { level })}
                      badgeLabel={isLocalSpeaking ? t('room.youSpeaking') : t('room.ready')}
                      badgeTone={isLocalSpeaking ? 'solidRed' : 'neutral'}
                      active={isLocalSpeaking}
                      activeColor={colors.red}
                    />
                  </>
                ) : (
                  (['CANDIDATE_1', 'CANDIDATE_2'] as const).map((cand, index) => {
                    const selected = candidateSpeaker === cand;
                    const speaking = selected && isLocalSpeaking;
                    return (
                      <SeatTile
                        key={cand}
                        avatar={String(index + 1)}
                        avatarColor={selected ? colors.red : colors.textMuted}
                        name={cand === 'CANDIDATE_1' ? t('common.candidate1') : t('common.candidate2')}
                        role={t('room.tapToSwitch')}
                        badgeLabel={speaking ? t('room.micActive') : selected ? t('room.ready') : t('room.waiting')}
                        badgeTone={speaking ? 'solidRed' : selected ? 'red' : 'neutral'}
                        active={selected}
                        speaking={speaking}
                        activeColor={colors.red}
                        onPress={() => setCandidateSpeaker(cand)}
                        disabled={phase === 'recording' || phase === 'thinking'}
                      />
                    );
                  })
                )}
              </View>
            </View>

            {/* Hint / Retry Notification */}
            {hintMessage && (
              <View style={styles.hintBanner}>
                <Icon name="information-circle" size={20} color={colors.navy} />
                <Text style={styles.hintBannerText}>{hintMessage}</Text>
              </View>
            )}

            {/* Error Banner with Retry */}
            {phase === 'error' && errorMessage && (
              <View style={styles.errorBanner}>
                <View style={styles.errorHeaderRow}>
                  <Icon name="alert-circle" size={20} color={colors.danger} />
                  <Text style={styles.errorBannerTitle}>{t('room.errorTitle')}</Text>
                </View>
                <Text style={styles.errorBannerText} numberOfLines={3}>
                  {errorMessage}
                </Text>
                <Button
                  title={t('common.retry')}
                  variant="primary"
                  size="sm"
                  icon="refresh"
                  onPress={dismissError}
                />
              </View>
            )}
          </View>

          {/* Live Transcript overlay (sits above the mic dock, never pushes it off screen) */}
          {isDrawerExpanded && (
            <View style={styles.transcriptOverlay}>
              <ScrollView
                ref={transcriptScrollRef}
                style={styles.transcriptScroll}
                contentContainerStyle={styles.transcriptScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {transcripts.length === 0 ? (
                  <Text style={styles.emptyTranscriptText}>
                    {t('room.transcriptEmpty')}
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
                                ? t('common.examiner')
                                : isPeer
                                  ? t('common.aiCoCandidate')
                                  : isCandidate2
                                    ? t('common.candidate2')
                                    : t('common.candidate1')
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
            </View>
          )}
        </View>

        {/* Docked Microphone Panel */}
        <SafeAreaView edges={['bottom']} style={styles.dock}>
          <View style={styles.dockInner}>
            <Pressable
              style={styles.transcriptToggle}
              onPress={toggleDrawer}
              accessibilityRole="button"
            >
              <View style={styles.transcriptTitleGroup}>
                <Icon name="chatbubbles-outline" size={17} color={colors.navy} />
                <Text style={styles.transcriptHeaderTitle}>
                  {t('room.transcriptCount', { count: transcripts.length })}
                </Text>
              </View>
              <View style={styles.transcriptHintGroup}>
                <Text style={styles.drawerExpandHint}>
                  {isDrawerExpanded ? t('common.hide') : t('room.showTranscript')}
                </Text>
                <Icon
                  name={isDrawerExpanded ? 'chevron-down' : 'chevron-up'}
                  size={17}
                  color={colors.red}
                />
              </View>
            </Pressable>

            {phase === 'speaking' && (
              <View style={styles.micStateBox}>
                <View style={styles.speakingBadgeCircle}>
                  <Waveform
                    active={true}
                    color={colors.white}
                    accentColor={colors.navy}
                    height={22}
                    barWidth={4}
                  />
                </View>
                <Text style={styles.micStatusTitle}>
                  {activeAiSpeaker === 'co_candidate'
                    ? t('room.peerTalking')
                    : t('room.examinerTalking')}
                </Text>
                <Text style={styles.micStatusSubtext} numberOfLines={2}>
                  {t('room.listenHint')}
                </Text>
                <Button
                  title={t('room.skipSpeech')}
                  variant="outline"
                  size="sm"
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
                  accessibilityLabel={t('room.tapToSpeak')}
                  style={({ pressed }) => [
                    styles.heroMicButton,
                    pressed && styles.heroMicButtonPressed,
                  ]}
                >
                  <Icon name="mic" size={38} color={colors.white} />
                </Pressable>
                <Text style={styles.micStatusTitle}>{t('room.yourTurn')}</Text>
                <Text style={styles.micStatusSubtext} numberOfLines={2}>
                  {t('room.tapHint')}
                </Text>
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
                    accessibilityLabel={t('room.doneSpeaking')}
                    style={styles.heroMicButtonRecording}
                  >
                    <Waveform
                      active={true}
                      color={colors.white}
                      accentColor={colors.navy}
                      height={26}
                      barWidth={4}
                    />
                  </Pressable>
                </View>
                <Text style={styles.micStatusTitleRecording}>
                  {t('room.recordingTime', { time: formattedRecordingTime })}
                </Text>
                <Button
                  title={t('room.doneSpeaking')}
                  variant="secondary"
                  size="md"
                  icon="stop"
                  fullWidth
                  onPress={stopRecordingAndSubmit}
                />
              </View>
            )}

            {phase === 'thinking' && (
              <View style={[styles.micStateBox, styles.micStateBoxStatic]}>
                <ActivityIndicator size="large" color={colors.red} />
                <Text style={styles.micStatusTitle}>{t('room.processing')}</Text>
                <Text style={styles.micStatusSubtext} numberOfLines={2}>
                  {t('room.processingHint')}
                </Text>
              </View>
            )}

            {phase === 'done' && (
              <View style={[styles.micStateBox, styles.micStateBoxStatic]}>
                <ActivityIndicator size="small" color={colors.success} />
                <Text style={styles.micStatusTitle}>{t('room.doneFetching')}</Text>
              </View>
            )}

            {/* Local Duo Mode (HUMAN_LOCAL) Moderator Controls during Del 2 */}
            {coCandidateMode === 'HUMAN_LOCAL' && stage === 'DEL_2' && (
              <View style={styles.moderatorBox}>
                <View style={styles.moderatorIconRow}>
                  <Icon name="people" size={18} color={colors.navy} />
                  <Text style={styles.moderatorTitle} numberOfLines={1}>
                    {t('room.moderatorTitle')}
                  </Text>
                </View>
                <Text style={styles.moderatorDescription} numberOfLines={2}>
                  {t('room.moderatorDesc')}
                </Text>
                <Button
                  title={t('room.finishDiscussion')}
                  variant="secondary"
                  size="sm"
                  iconRight="arrow-forward"
                  fullWidth
                  disabled={phase === 'thinking'}
                  onPress={endHumanDiscussion}
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
};

interface SeatTileProps {
  avatar: string;
  avatarColor: string;
  name: string;
  role: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  /** Highlighted seat (outlined in `activeColor`). */
  active: boolean;
  /** Animates the waveform; defaults to `active`. */
  speaking?: boolean;
  activeColor: string;
  /** Seat is present but not part of the current exam part. */
  dimmed?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One participant at the exam table: avatar, name, status badge and a live waveform. */
const SeatTile: React.FC<SeatTileProps> = ({
  avatar,
  avatarColor,
  name,
  role,
  badgeLabel,
  badgeTone,
  active,
  speaking = active,
  activeColor,
  dimmed = false,
  onPress,
  disabled,
  style,
}) => {
  const body = (
    <>
      <View style={styles.participantHeader}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarLetter} numberOfLines={1}>
            {avatar}
          </Text>
        </View>
        <View style={styles.participantMeta}>
          <Text style={styles.participantName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.participantRole} numberOfLines={1}>
            {role}
          </Text>
        </View>
      </View>
      <View style={styles.participantFooter}>
        <Badge label={badgeLabel} tone={badgeTone} />
        <Waveform
          active={speaking}
          color={active ? activeColor : colors.borderStrong}
          accentColor={active ? colors.red : colors.borderStrong}
          height={18}
          barWidth={3}
        />
      </View>
    </>
  );
  const tileStyle = [
    styles.participantTile,
    active && { borderColor: activeColor, borderWidth: 1.5 },
    dimmed && styles.participantDimmed,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
        accessibilityLabel={name}
        style={({ pressed }) => [styles.participantTileBase, tileStyle, pressed && styles.participantPressed]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.participantTileBase, tileStyle]}>{body}</View>;
};

const styles = StyleSheet.create({
  topSafeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  navyHeader: {
    backgroundColor: colors.navy,
    paddingBottom: space.sm,
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
  topBarSpacer: {
    flex: 1,
  },
  examTitleText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
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
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.navyLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.red,
  },
  endButtonPressed: {
    backgroundColor: colors.redPressed,
  },
  endButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
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
    paddingVertical: 5,
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
  mainArea: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: space.sm,
  },
  promptBannerCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.red,
    padding: space.md,
    // Shrinks first when space is tight; text scrolls inside instead of the page.
    flexShrink: 1,
    minHeight: 72,
  },
  promptScroll: {
    flexGrow: 0,
  },
  promptBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
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
  examTable: {
    gap: 6,
  },
  seatLabel: {
    ...type.overline,
    fontSize: 10,
    textAlign: 'center',
  },
  examinerSeat: {
    alignSelf: 'center',
    width: '78%',
    backgroundColor: colors.navySoft,
    borderColor: colors.navySoft,
  },
  tableEdge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: 2,
  },
  tableEdgeLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.borderStrong,
  },
  candidatesRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  participantTileBase: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantTile: {
    flex: 1,
    padding: space.sm,
    gap: 6,
  },
  participantDimmed: {
    opacity: 0.55,
  },
  participantPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  participantMeta: {
    flex: 1,
    minWidth: 0,
  },
  participantName: {
    ...type.bodyStrong,
    fontSize: 13,
    lineHeight: 18,
  },
  participantRole: {
    ...type.caption,
    fontSize: 11,
    lineHeight: 15,
  },
  participantFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.navySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
    padding: space.md,
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
  dock: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  dockInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  transcriptToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    marginBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  micStateBox: {
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.xs,
  },
  micStateBoxStatic: {
    paddingVertical: space.md,
  },
  speakingBadgeCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMicButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
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
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPulseRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.redSoft,
    borderWidth: 2,
    borderColor: colors.red,
  },
  heroMicButtonRecording: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    marginBottom: space.xs,
  },
  micStatusSubtext: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  moderatorBox: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.navySoft,
    gap: space.xs,
  },
  moderatorIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  moderatorTitle: {
    ...type.bodyStrong,
    fontSize: 14,
    flex: 1,
  },
  moderatorDescription: {
    ...type.caption,
    color: colors.textSecondary,
  },
  transcriptOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: space.md,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    ...shadow.raised,
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
    paddingVertical: space.md,
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
});
