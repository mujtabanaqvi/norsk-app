import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import { Icon } from '../../components/ui';
import { colors, radius, space, type } from '../../theme';

interface SpeechCardProps {
  /** Someone (examiner or AI co-candidate) is speaking right now. */
  isSpeaking: boolean;
  speaker: 'examiner' | 'co_candidate';
  stageNumber: number;
  text: string;
}

/** The current task, or what the examiner / co-candidate is saying. Grows with its text; the page scrolls. */
export const SpeechCard: React.FC<SpeechCardProps> = ({ isSpeaking, speaker, stageNumber, text }) => {
  const { t } = useLocale();

  const label = isSpeaking
    ? speaker === 'co_candidate'
      ? t('room.coCandidateSays')
      : t('room.examinerSays')
    : t('room.task', { part: t('room.part', { n: stageNumber }) });

  return (
    <View style={[styles.card, isSpeaking && styles.cardSpeaking]}>
      <View style={styles.header}>
        <Icon
          name={isSpeaking ? 'volume-high-outline' : 'document-text-outline'}
          size={18}
          color={colors.red}
        />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.red,
    padding: space.md,
    gap: space.xs,
  },
  cardSpeaking: {
    backgroundColor: colors.redSoft,
    borderColor: colors.redSoft,
    borderLeftColor: colors.red,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    ...type.overline,
    color: colors.red,
  },
  text: {
    ...type.bodyStrong,
    fontSize: 15,
    lineHeight: 22,
  },
});
