import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useExamTurns } from '../hooks/useExamTurns';
import { useLocale } from '../hooks/useLocale';
import type { RootStackParamList } from '../types/exam';
import { Button, Icon } from '../components/ui';
import { colors, radius, space, type } from '../theme';
import { ExamRoomHeader } from './examRoom/ExamRoomHeader';
import { ExamTable } from './examRoom/ExamTable';
import { SpeechCard } from './examRoom/SpeechCard';
import { TranscriptSheet } from './examRoom/TranscriptSheet';
import { MicDock } from './examRoom/MicDock';

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
    cancelExam,
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
  const roomScrollRef = useRef<ScrollView | null>(null);

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

  // A new reply starts reading from the top, with the table in view
  useEffect(() => {
    roomScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentReplyText]);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

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

  // Cancelling (no assessment, no daily slot used) is only possible before the Del 2 discussion
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const canCancel = stage === 'DEL_1' && phase !== 'thinking' && phase !== 'done' && !isCancelling;

  const runCancelExam = async () => {
    setIsCancelling(true);
    try {
      await cancelExam();
      hasNavigatedRef.current = true;
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('ExamSetup');
      }
    } catch (err) {
      setIsCancelling(false);
      const message = err instanceof Error ? err.message : t('network.cancelExam', { status: '' });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert(t('room.cancelFailedTitle'), message);
      }
    }
  };

  const handleConfirmCancelExam = () => {
    if (!canCancel) return;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(t('room.cancelConfirmBody'))) {
        runCancelExam();
      }
      return;
    }

    Alert.alert(
      t('room.cancelConfirmTitle'),
      t('room.cancelConfirmBody'),
      [
        { text: t('room.cancelKeepGoing'), style: 'cancel' },
        {
          text: t('room.cancelConfirmAction'),
          style: 'destructive',
          onPress: () => {
            runCancelExam();
          },
        },
      ]
    );
  };

  const toggleDrawer = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDrawerExpanded(!isDrawerExpanded);
  };

  const isSpeaking = phase === 'speaking';
  const isExaminerSpeaking = isSpeaking && activeAiSpeaker === 'examiner';
  const isAiCoCandidateSpeaking = isSpeaking && activeAiSpeaker === 'co_candidate';
  const isLocalSpeaking = phase === 'recording';

  const currentTaskDescription =
    stage === 'DEL_1'
      ? monologuePromptNo || t('room.defaultTaskDel1')
      : stage === 'DEL_2'
        ? discussionPromptNo || t('room.defaultTaskDel2')
        : t('room.defaultTaskDel3');

  const stageNumber = stage === 'DEL_1' ? 1 : stage === 'DEL_2' ? 2 : 3;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <ExamRoomHeader
        phase={phase}
        stage={stage}
        timer={formattedTimer}
        level={level}
        topicTitle={topicTitle}
        canCancel={canCancel}
        isCancelling={isCancelling}
        onCancel={handleConfirmCancelExam}
        onEnd={handleConfirmEndExam}
      />

      <View style={styles.body}>
        {/* Room content scrolls when it doesn't fit, so nothing is ever squashed or overlapped */}
        <View style={styles.middle}>
          <ScrollView
            ref={roomScrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <ExamTable
              phase={phase}
              stage={stage}
              level={level}
              coCandidateMode={coCandidateMode}
              isExaminerSpeaking={isExaminerSpeaking}
              isAiCoCandidateSpeaking={isAiCoCandidateSpeaking}
              isLocalSpeaking={isLocalSpeaking}
              candidateSpeaker={candidateSpeaker}
              onSelectCandidate={setCandidateSpeaker}
            />

            <SpeechCard
              isSpeaking={isSpeaking}
              speaker={activeAiSpeaker}
              stageNumber={stageNumber}
              text={isSpeaking && currentReplyText ? currentReplyText : currentTaskDescription}
            />

            {/* Hint / Retry Notification */}
            {hintMessage && (
              <View style={styles.hintBanner}>
                <Icon name="information-circle" size={20} color={colors.navy} />
                <Text style={styles.hintText}>{hintMessage}</Text>
              </View>
            )}

            {/* Error Banner with Retry */}
            {phase === 'error' && errorMessage && (
              <View style={styles.errorBanner}>
                <View style={styles.errorHeader}>
                  <Icon name="alert-circle" size={20} color={colors.danger} />
                  <Text style={styles.errorTitle}>{t('room.errorTitle')}</Text>
                </View>
                <Text style={styles.errorText} numberOfLines={3}>
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
          </ScrollView>

          {isDrawerExpanded && <TranscriptSheet ref={transcriptScrollRef} transcripts={transcripts} />}
        </View>

        <MicDock
          phase={phase}
          stage={stage}
          coCandidateMode={coCandidateMode}
          activeAiSpeaker={activeAiSpeaker}
          recordingDurationMs={recordingDurationMs}
          transcriptCount={transcripts.length}
          isTranscriptOpen={isDrawerExpanded}
          onToggleTranscript={toggleDrawer}
          onStartRecording={startRecording}
          onStopRecording={stopRecordingAndSubmit}
          onSkipSpeech={skipCurrentSpeech}
          onEndHumanDiscussion={endHumanDiscussion}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  body: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  middle: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.md,
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
  hintText: {
    ...type.caption,
    color: colors.navy,
    fontWeight: '600',
    flexShrink: 1,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: space.xs,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  errorTitle: {
    ...type.bodyStrong,
    color: colors.danger,
  },
  errorText: {
    ...type.caption,
    color: colors.text,
    marginBottom: space.xs,
  },
});
