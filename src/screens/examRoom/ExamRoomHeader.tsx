import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import type { TurnPhase } from '../../hooks/useExamTurns';
import type { ExamStage } from '../../types/exam';
import { Icon } from '../../components/ui';
import { colors, radius, space } from '../../theme';
import { StageStepper } from './StageStepper';

interface ExamRoomHeaderProps {
  phase: TurnPhase;
  stage: ExamStage;
  timer: string;
  level: string;
  topicTitle: string;
  canCancel: boolean;
  isCancelling: boolean;
  onCancel: () => void;
  onEnd: () => void;
}

/** Navy header: live status, timer, level, Cancel / End, topic and the stage stepper. */
export const ExamRoomHeader: React.FC<ExamRoomHeaderProps> = ({
  phase,
  stage,
  timer,
  level,
  topicTitle,
  canCancel,
  isCancelling,
  onCancel,
  onEnd,
}) => {
  const { t } = useLocale();

  const statusLabel =
    phase === 'recording'
      ? t('room.statusRecording')
      : phase === 'thinking'
        ? t('room.statusThinking')
        : phase === 'speaking'
          ? t('room.statusSpeaking')
          : t('room.statusReady');
  const dotColor =
    phase === 'recording' ? colors.red : phase === 'thinking' ? colors.gold : colors.success;

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={styles.statusText} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        <Text style={styles.timer}>{timer}</Text>

        <View style={styles.spacer} />

        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>{level}</Text>
        </View>

        <Pressable
          onPress={onCancel}
          disabled={!canCancel}
          style={({ pressed }) => [
            styles.headerButton,
            styles.cancelButton,
            pressed && styles.cancelPressed,
            !canCancel && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('room.cancelExam')}
          accessibilityState={{ disabled: !canCancel }}
          hitSlop={6}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Icon name="close" size={16} color={colors.white} />
          )}
          <Text style={styles.headerButtonText}>{t('room.cancelShort')}</Text>
        </Pressable>

        <Pressable
          onPress={onEnd}
          style={({ pressed }) => [styles.headerButton, styles.endButton, pressed && styles.endPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('room.endExam')}
          hitSlop={6}
        >
          <Icon name="flag-outline" size={16} color={colors.white} />
          <Text style={styles.headerButtonText}>{t('room.endShort')}</Text>
        </Pressable>
      </View>

      <Text style={styles.topic} numberOfLines={1}>
        {topicTitle}
      </Text>

      <StageStepper stage={stage} />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.navyLight,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timer: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  spacer: {
    flex: 1,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  levelText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.navyLight,
  },
  cancelButton: {
    borderColor: colors.navySoft,
  },
  cancelPressed: {
    backgroundColor: colors.navy,
  },
  endButton: {
    borderColor: colors.red,
  },
  endPressed: {
    backgroundColor: colors.redPressed,
  },
  disabled: {
    opacity: 0.4,
  },
  headerButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  topic: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
