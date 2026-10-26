import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import type { TurnPhase } from '../../hooks/useExamTurns';
import type { CoCandidateMode, ExamStage } from '../../types/exam';
import { colors, space, type } from '../../theme';
import { ParticipantCard } from './ParticipantCard';

type CandidateSlot = 'CANDIDATE_1' | 'CANDIDATE_2';

interface ExamTableProps {
  phase: TurnPhase;
  stage: ExamStage;
  level: string;
  coCandidateMode: CoCandidateMode;
  isExaminerSpeaking: boolean;
  isAiCoCandidateSpeaking: boolean;
  isLocalSpeaking: boolean;
  candidateSpeaker: CandidateSlot;
  onSelectCandidate: (slot: CandidateSlot) => void;
}

/** The examiner sits across the table; the candidates sit side by side. Whoever speaks turns red. */
export const ExamTable: React.FC<ExamTableProps> = ({
  phase,
  stage,
  level,
  coCandidateMode,
  isExaminerSpeaking,
  isAiCoCandidateSpeaking,
  isLocalSpeaking,
  candidateSpeaker,
  onSelectCandidate,
}) => {
  const { t } = useLocale();

  return (
    <View style={styles.table}>
      <Text style={styles.seatLabel}>{t('room.seatAcross')}</Text>
      <ParticipantCard
        size="wide"
        avatar="S"
        avatarColor={colors.navy}
        name={t('room.examinerName')}
        role={t('room.examinerRole')}
        badgeLabel={isExaminerSpeaking ? t('room.speakingNow') : t('room.listening')}
        badgeTone={isExaminerSpeaking ? 'red' : 'neutral'}
        highlighted={isExaminerSpeaking}
        filled
        speaking={isExaminerSpeaking}
      />

      <View style={styles.edge}>
        <View style={styles.edgeLine} />
        <Text style={styles.seatLabel}>{t('room.seatYourSide')}</Text>
        <View style={styles.edgeLine} />
      </View>

      <View style={styles.candidatesRow}>
        {coCandidateMode === 'AI_PEER' ? (
          <>
            <View style={styles.seat}>
              <ParticipantCard
                size="compact"
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
                badgeTone={isAiCoCandidateSpeaking ? 'solidRed' : 'neutral'}
                highlighted={isAiCoCandidateSpeaking}
                speaking={isAiCoCandidateSpeaking}
                dimmed={stage !== 'DEL_2'}
              />
            </View>
            <View style={styles.seat}>
              <ParticipantCard
                size="compact"
                avatar={t('room.you')}
                avatarColor={colors.red}
                name={t('room.candidateYou')}
                role={t('room.targetLevel', { level })}
                badgeLabel={isLocalSpeaking ? t('room.youSpeaking') : t('room.ready')}
                badgeTone={isLocalSpeaking ? 'solidRed' : 'neutral'}
                highlighted={isLocalSpeaking}
                speaking={isLocalSpeaking}
              />
            </View>
          </>
        ) : (
          (['CANDIDATE_1', 'CANDIDATE_2'] as const).map((slot, index) => {
            const selected = candidateSpeaker === slot;
            const speaking = selected && isLocalSpeaking;
            return (
              <View key={slot} style={styles.seat}>
                <ParticipantCard
                  size="compact"
                  avatar={String(index + 1)}
                  avatarColor={selected ? colors.red : colors.textMuted}
                  name={slot === 'CANDIDATE_1' ? t('common.candidate1') : t('common.candidate2')}
                  role={t('room.tapToSwitch')}
                  badgeLabel={
                    speaking ? t('room.micActive') : selected ? t('room.ready') : t('room.waiting')
                  }
                  badgeTone={speaking ? 'solidRed' : selected ? 'red' : 'neutral'}
                  highlighted={selected}
                  speaking={speaking}
                  onPress={() => onSelectCandidate(slot)}
                  disabled={phase === 'recording' || phase === 'thinking'}
                />
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  table: {
    gap: space.sm,
  },
  seatLabel: {
    ...type.overline,
    fontSize: 10,
    textAlign: 'center',
  },
  edge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  edgeLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  candidatesRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  // Row child: splits the width evenly; height comes from the card's content
  seat: {
    flex: 1,
    minWidth: 0,
  },
});
