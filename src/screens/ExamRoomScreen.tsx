import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  StatusBar,
  Animated,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import {
  LiveKitRoom,
  AudioSession,
  registerGlobals,
  useRoomContext,
  useRemoteParticipants,
} from '@livekit/react-native';
import { RoomEvent, ConnectionState } from 'livekit-client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  CefrLevel,
  CoCandidateMode,
  TranscriptTurn,
  SpeakerRole,
  ExamStage,
} from '../types/exam';

// Ensure WebRTC globals are registered for React Native
registerGlobals();

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

/**
 * Inner Active Exam Room Content
 * Operates inside the LiveKitRoom provider with direct access to room context and hooks
 */
interface ActiveExamContentProps {
  sessionId: string;
  roomName: string;
  level: CefrLevel;
  coCandidateMode: CoCandidateMode;
  topicTitle: string;
  onEndExam: () => void;
}

const ActiveExamContent: React.FC<ActiveExamContentProps> = ({
  sessionId,
  level,
  coCandidateMode,
  topicTitle,
  onEndExam,
}) => {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();

  // Exam phase tracking
  const [currentStage, setCurrentStage] = useState<ExamStage>('DEL_1');
  const [isEndingDiscussion, setIsEndingDiscussion] = useState<boolean>(false);
  const [discussionEndedToast, setDiscussionEndedToast] = useState<boolean>(false);

  // Participant speaking states
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState<boolean>(false);
  const [activeAiSpeaker, setActiveAiSpeaker] = useState<'examiner' | 'co_candidate'>('examiner');

  // Exam elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Live transcript drawer
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);
  const transcriptScrollRef = useRef<any>(null);

  // Timer interval
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isConnected) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isConnected]);

  // Format MM:SS timer
  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // Set up LiveKit room event listeners
  useEffect(() => {
    if (!room) return;

    const handleConnected = () => {
      setIsConnected(true);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
    };

    const handleActiveSpeakersChanged = () => {
      // Check local participant speaking state
      const localSpeaking = room.localParticipant?.isSpeaking ?? false;
      setIsLocalSpeaking(localSpeaking);

      // Check remote participants speaking state
      const anyRemoteSpeaking = remoteParticipants.some((p) => p.isSpeaking);
      setIsRemoteSpeaking(anyRemoteSpeaking);
    };

    // Receive data messages (e.g. transcript turns, stage updates, speaker transitions)
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
        const text = textDecoder
          ? textDecoder.decode(payload)
          : String.fromCharCode.apply(null, Array.from(payload));

        const data = JSON.parse(text);

        // Stage transitions emitted from worker
        if (data.stage && ['DEL_1', 'DEL_2', 'DEL_3'].includes(data.stage)) {
          setCurrentStage(data.stage as ExamStage);
        }

        // Active speaker persona changes (Examiner vs CoCandidate)
        if (data.activeSpeaker === 'examiner' || data.activeSpeaker === 'co_candidate') {
          setActiveAiSpeaker(data.activeSpeaker);
        }

        // Realtime transcript turn delivered over DataChannel
        if (data.type === 'TRANSCRIPT_TURN' && data.text) {
          const newTurn: TranscriptTurn = {
            id: data.id || `${Date.now()}_${Math.random()}`,
            speaker: data.speaker || 'participant',
            role: (data.role as SpeakerRole) || 'EXAMINER',
            text: data.text,
            timestamp: data.timestamp || Date.now(),
            isFinal: true,
          };

          setTranscripts((prev) => [...prev, newTurn]);

          // Auto-scroll transcript drawer to bottom
          setTimeout(() => {
            transcriptScrollRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      } catch {
        // Ignore binary or malformed data packets
      }
    };

    // STT Transcription Received Event from LiveKit
    const handleTranscriptionReceived = (transcriptions: any[]) => {
      if (!Array.isArray(transcriptions) || transcriptions.length === 0) return;

      for (const t of transcriptions) {
        if (!t.text) continue;
        const role: SpeakerRole = t.participantIdentity?.includes('agent')
          ? activeAiSpeaker === 'co_candidate'
            ? 'AI_COCANDIDATE'
            : 'EXAMINER'
          : 'CANDIDATE_1';

        const newTurn: TranscriptTurn = {
          id: t.id || `${Date.now()}_${Math.random()}`,
          speaker: t.participantIdentity || 'participant',
          role,
          text: t.text,
          timestamp: Date.now(),
          isFinal: t.isFinal ?? true,
        };

        setTranscripts((prev) => [...prev, newTurn]);
      }

      setTimeout(() => {
        transcriptScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    };

    if (room.state === ConnectionState.Connected) {
      setIsConnected(true);
    }

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      room.off(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);
    };
  }, [room, remoteParticipants, activeAiSpeaker]);

  /**
   * Local Duo Mode (HUMAN_LOCAL):
   * Sends LiveKit DataChannel message "END_DISCUSSION" to exit Passive Moderator Mode.
   */
  const handleEndDiscussion = async () => {
    if (!room || !room.localParticipant) return;

    setIsEndingDiscussion(true);
    try {
      const message = JSON.stringify({ action: 'END_DISCUSSION' });
      const encodedData = new TextEncoder().encode(message);

      await room.localParticipant.publishData(encodedData, { reliable: true });

      setDiscussionEndedToast(true);
      setCurrentStage('DEL_3');
      setActiveAiSpeaker('examiner');

      setTimeout(() => {
        setDiscussionEndedToast(false);
      }, 4000);
    } catch (err) {
      Alert.alert(
        'Feil ved overgang',
        'Kunne ikke sende signal til sensor. Vennligst prøv igjen.'
      );
    } finally {
      setIsEndingDiscussion(false);
    }
  };

  /**
   * Prompt confirmation before exiting exam and requesting evaluation
   */
  const handleConfirmEndExam = () => {
    Alert.alert(
      'Avslutt prøve',
      'Er du sikker på at du vil avslutte prøven? Sensoren vil umiddelbart generere din HK-dir vurdering.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Avslutt og få vurdering',
          style: 'destructive',
          onPress: onEndExam,
        },
      ]
    );
  };

  const toggleDrawer = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDrawerExpanded(!isDrawerExpanded);
  };

  // Determine speaker states for Examiner vs AI Medkandidat
  const isExaminerSpeaking =
    isRemoteSpeaking && activeAiSpeaker === 'examiner';
  const isAiCoCandidateSpeaking =
    isRemoteSpeaking && activeAiSpeaker === 'co_candidate';

  return (
    <SafeAreaView style={styles.roomSafeArea}>
      <StatusBar barStyle="light-content" />

      {/* Top App Bar & Stage Indicator */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, isConnected && styles.liveDotConnected]} />
            <Text style={styles.liveText}>{isConnected ? 'LIVE' : 'KOBLER TIL'}</Text>
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
        {(['DEL_1', 'DEL_2', 'DEL_3'] as ExamStage[]).map((stage) => {
          const isActive = currentStage === stage;
          const label =
            stage === 'DEL_1'
              ? 'Del 1: Monolog'
              : stage === 'DEL_2'
              ? 'Del 2: Samtale'
              : 'Del 3: Oppfølging';
          return (
            <TouchableOpacity
              key={stage}
              style={[styles.phasePill, isActive && styles.phasePillActive]}
              onPress={() => setCurrentStage(stage)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.phasePillText, isActive && styles.phasePillTextActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
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
              <Text style={styles.participantRole}>Offisiell eksaminator</Text>
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
                {isExaminerSpeaking ? 'Taler nå' : 'Lytter aktivt'}
              </Text>
            </View>
          </View>

          <View style={styles.participantWaveRow}>
            <AudioWaveIndicator isSpeaking={isExaminerSpeaking} color="#38BDF8" />
          </View>
        </View>

        {/* Participant Card 2: Co-Candidate Slot */}
        {coCandidateMode === 'AI_PEER' ? (
          /* AI_PEER Card */
          <View
            style={[
              styles.participantCard,
              isAiCoCandidateSpeaking && styles.participantCardActiveCo,
            ]}
          >
            <View style={styles.participantHeader}>
              <View style={styles.participantAvatarPeer}>
                <Text style={styles.avatarLetter}>M</Text>
              </View>
              <View style={styles.participantMeta}>
                <Text style={styles.participantName}>AI Medkandidat</Text>
                <Text style={styles.participantRole}>Samtalepartner (Nivå {level})</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  isAiCoCandidateSpeaking
                    ? styles.statusBadgeSpeakingCo
                    : styles.statusBadgeIdle,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isAiCoCandidateSpeaking && styles.statusBadgeTextSpeakingCo,
                  ]}
                >
                  {isAiCoCandidateSpeaking ? 'Taler nå' : 'Venter på tur'}
                </Text>
              </View>
            </View>

            <View style={styles.participantWaveRow}>
              <AudioWaveIndicator isSpeaking={isAiCoCandidateSpeaking} color="#A855F7" />
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
                <Text style={styles.participantRole}>Fysisk til stede i rommet</Text>
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
                  {isLocalSpeaking ? 'Mikrofon aktiv' : 'Lytter'}
                </Text>
              </View>
            </View>

            <View style={styles.participantWaveRow}>
              <AudioWaveIndicator isSpeaking={isLocalSpeaking} color="#10B981" />
            </View>
          </View>
        )}

        {/* Local Duo Mode (HUMAN_LOCAL) Moderator Controls during Del 2 */}
        {coCandidateMode === 'HUMAN_LOCAL' && currentStage === 'DEL_2' && (
          <View style={styles.moderatorBox}>
            <View style={styles.moderatorIconRow}>
              <Text style={styles.moderatorIcon}>👥</Text>
              <Text style={styles.moderatorTitle}>Passiv Sensormodus Aktiv</Text>
            </View>

            <Text style={styles.moderatorDescription}>
              Del 2: Diskuter oppgaven med personen ved siden av deg. Sensoren lytter uten å avbryte.
            </Text>

            {discussionEndedToast && (
              <View style={styles.toastBox}>
                <Text style={styles.toastText}>
                  ✓ Diskusjon fullført. Sensor gjenopptar ordet for Del 3!
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.endDiscussionButton,
                isEndingDiscussion && styles.endDiscussionButtonDisabled,
              ]}
              onPress={handleEndDiscussion}
              disabled={isEndingDiscussion}
              activeOpacity={0.8}
            >
              {isEndingDiscussion ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.endDiscussionButtonText}>
                  Fullfør diskusjon — Gå til Del 3 (Oppfølgingsspørsmål)
                </Text>
              )}
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
              Transkripsjon i sanntid ({transcripts.length})
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
                Transkripsjon starter automatisk når deltakerne snakker...
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

/**
 * Main Active Exam Room Screen Component
 * Manages AudioSession lifecycle and wraps view in LiveKitRoom
 */
export const ExamRoomScreen: React.FC<Props> = ({ route, navigation }) => {
  const {
    sessionId,
    roomName,
    token,
    livekitUrl,
    level,
    coCandidateMode,
    topicTitle,
  } = route.params;

  const [isAudioSessionReady, setIsAudioSessionReady] = useState<boolean>(false);

  // Initialize and tear down LiveKit AudioSession
  useEffect(() => {
    let isMounted = true;

    const initAudio = async () => {
      try {
        await AudioSession.startAudioSession();
        if (isMounted) {
          setIsAudioSessionReady(true);
        }
      } catch (err) {
        console.warn('AudioSession.startAudioSession error:', err);
        if (isMounted) {
          setIsAudioSessionReady(true); // Allow room to mount even if hardware audio throws
        }
      }
    };

    initAudio();

    return () => {
      isMounted = false;
      AudioSession.stopAudioSession().catch((err) => {
        console.warn('AudioSession.stopAudioSession error:', err);
      });
    };
  }, []);

  /**
   * Disconnect from room and navigate to results screen
   */
  const handleEndExam = useCallback(() => {
    // Navigating to ExamResults automatically unmounts LiveKitRoom, disconnecting from server
    // and triggering Agent Worker's shutdown Neon transaction.
    navigation.replace('ExamResults', { sessionId });
  }, [navigation, sessionId]);

  if (!isAudioSessionReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingScreenText}>Klargjør lydsystem og mikrofon...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleEndExam}
    >
      <ActiveExamContent
        sessionId={sessionId}
        roomName={roomName}
        level={level}
        coCandidateMode={coCandidateMode}
        topicTitle={topicTitle}
        onEndExam={handleEndExam}
      />
    </LiveKitRoom>
  );
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingScreenText: {
    marginTop: 16,
    color: '#94A3B8',
    fontSize: 14,
  },
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
    gap: 16,
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
  statusBadgeTextSpeakingCo: {
    color: '#FFFFFF',
  },
  statusBadgeTextSpeakingLocal: {
    color: '#FFFFFF',
  },
  participantWaveRow: {
    marginTop: 16,
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
  moderatorBox: {
    backgroundColor: '#1E1B4B', // Indigo 950
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    marginTop: 8,
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
    marginBottom: 16,
  },
  toastBox: {
    backgroundColor: '#065F46',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  toastText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '600',
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
