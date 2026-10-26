import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale } from '../../hooks/useLocale';
import type { TurnPhase } from '../../hooks/useExamTurns';
import type { CoCandidateMode, ExamStage } from '../../types/exam';
import { Button, Icon, Waveform } from '../../components/ui';
import { colors, radius, shadow, space, type } from '../../theme';

interface MicDockProps {
  phase: TurnPhase;
  stage: ExamStage;
  coCandidateMode: CoCandidateMode;
  activeAiSpeaker: 'examiner' | 'co_candidate';
  recordingDurationMs: number;
  transcriptCount: number;
  isTranscriptOpen: boolean;
  onToggleTranscript: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSkipSpeech: () => void;
  onEndHumanDiscussion: () => void;
}

/** Docked bottom panel: transcript toggle plus the mic control for the current phase. Always on screen. */
export const MicDock: React.FC<MicDockProps> = ({
  phase,
  stage,
  coCandidateMode,
  activeAiSpeaker,
  recordingDurationMs,
  transcriptCount,
  isTranscriptOpen,
  onToggleTranscript,
  onStartRecording,
  onStopRecording,
  onSkipSpeech,
  onEndHumanDiscussion,
}) => {
  const { t } = useLocale();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation while recording
  useEffect(() => {
    if (phase !== 'recording') {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.16, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

  const recordingTime = useMemo(() => {
    const totalSec = Math.floor(recordingDurationMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [recordingDurationMs]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.dock}>
      <View style={styles.inner}>
        <Pressable style={styles.toggle} onPress={onToggleTranscript} accessibilityRole="button">
          <View style={styles.toggleGroup}>
            <Icon name="chatbubbles-outline" size={17} color={colors.navy} />
            <Text style={styles.toggleTitle}>{t('room.transcriptCount', { count: transcriptCount })}</Text>
          </View>
          <View style={styles.toggleGroup}>
            <Text style={styles.toggleHint}>
              {isTranscriptOpen ? t('common.hide') : t('room.showTranscript')}
            </Text>
            <Icon name={isTranscriptOpen ? 'chevron-down' : 'chevron-up'} size={17} color={colors.red} />
          </View>
        </Pressable>

        {phase === 'speaking' && (
          <View style={styles.speakingRow}>
            <View style={styles.speakingIdentity}>
              <View style={styles.speakingDot}>
                <Waveform active={true} color={colors.white} accentColor={colors.white} height={16} barWidth={3} />
              </View>
              <View style={styles.speakingText}>
                <Text style={styles.speakingTitle} numberOfLines={1}>
                  {activeAiSpeaker === 'co_candidate' ? t('room.peerTalking') : t('room.examinerTalking')}
                </Text>
                <Text style={styles.speakingHint} numberOfLines={2}>
                  {t('room.listenHint')}
                </Text>
              </View>
            </View>
            <Button
              title={t('room.skipSpeech')}
              variant="outline"
              size="sm"
              iconRight="arrow-forward"
              fullWidth
              onPress={onSkipSpeech}
            />
          </View>
        )}

        {phase === 'listening' && (
          <View style={styles.centerBox}>
            <Pressable
              onPress={onStartRecording}
              accessibilityRole="button"
              accessibilityLabel={t('room.tapToSpeak')}
              style={({ pressed }) => [styles.micButton, pressed && styles.micButtonPressed]}
            >
              <Icon name="mic" size={36} color={colors.white} />
            </Pressable>
            <Text style={styles.title}>{t('room.yourTurn')}</Text>
            <Text style={styles.subtext} numberOfLines={2}>
              {t('room.tapHint')}
            </Text>
          </View>
        )}

        {phase === 'recording' && (
          <View style={styles.centerBox}>
            <View style={styles.orbWrapper}>
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
              <Pressable
                onPress={onStopRecording}
                accessibilityRole="button"
                accessibilityLabel={t('room.doneSpeaking')}
                style={styles.micButtonRecording}
              >
                <Waveform active={true} color={colors.white} accentColor={colors.white} height={24} barWidth={4} />
              </Pressable>
            </View>
            <Text style={[styles.title, styles.titleRecording]}>
              {t('room.recordingTime', { time: recordingTime })}
            </Text>
            <Button
              title={t('room.doneSpeaking')}
              variant="secondary"
              size="md"
              icon="stop"
              fullWidth
              onPress={onStopRecording}
            />
          </View>
        )}

        {phase === 'thinking' && (
          <View style={[styles.centerBox, styles.staticBox]}>
            <ActivityIndicator size="large" color={colors.red} />
            <Text style={styles.title}>{t('room.processing')}</Text>
            <Text style={styles.subtext} numberOfLines={2}>
              {t('room.processingHint')}
            </Text>
          </View>
        )}

        {phase === 'done' && (
          <View style={[styles.centerBox, styles.staticBox]}>
            <ActivityIndicator size="small" color={colors.success} />
            <Text style={styles.title}>{t('room.doneFetching')}</Text>
          </View>
        )}

        {/* Local Duo Mode (HUMAN_LOCAL) Moderator Controls during Del 2 */}
        {coCandidateMode === 'HUMAN_LOCAL' && stage === 'DEL_2' && (
          <View style={styles.moderator}>
            <View style={styles.moderatorTitleRow}>
              <Icon name="people" size={18} color={colors.navy} />
              <Text style={styles.moderatorTitle} numberOfLines={1}>
                {t('room.moderatorTitle')}
              </Text>
            </View>
            <Text style={styles.moderatorDesc} numberOfLines={2}>
              {t('room.moderatorDesc')}
            </Text>
            <Button
              title={t('room.finishDiscussion')}
              variant="secondary"
              size="sm"
              iconRight="arrow-forward"
              fullWidth
              disabled={phase === 'thinking'}
              onPress={onEndHumanDiscussion}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  inner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    marginBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleTitle: {
    ...type.caption,
    color: colors.text,
    fontWeight: '700',
  },
  toggleHint: {
    fontSize: 12,
    color: colors.red,
    fontWeight: '700',
  },
  speakingRow: {
    gap: space.sm,
    paddingBottom: space.xs,
  },
  speakingIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  speakingDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Row child: takes the width left of the dot so long hints wrap
  speakingText: {
    flex: 1,
    minWidth: 0,
  },
  speakingTitle: {
    ...type.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  speakingHint: {
    ...type.caption,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  centerBox: {
    alignItems: 'center',
    gap: space.xs,
  },
  staticBox: {
    paddingVertical: space.md,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
    ...shadow.raised,
  },
  micButtonPressed: {
    backgroundColor: colors.redPressed,
  },
  orbWrapper: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.redSoft,
    borderWidth: 2,
    borderColor: colors.red,
  },
  micButtonRecording: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  title: {
    ...type.heading,
    textAlign: 'center',
  },
  titleRecording: {
    color: colors.red,
    marginBottom: space.xs,
  },
  subtext: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  moderator: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.navySoft,
    gap: space.xs,
  },
  moderatorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  moderatorTitle: {
    ...type.bodyStrong,
    fontSize: 14,
    flexShrink: 1,
  },
  moderatorDesc: {
    ...type.caption,
    color: colors.textSecondary,
  },
});
