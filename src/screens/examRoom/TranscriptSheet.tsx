import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import type { TranscriptTurn } from '../../types/exam';
import { Badge } from '../../components/ui';
import { colors, radius, shadow, space, type } from '../../theme';

/** Live transcript overlay. Sits above the mic dock and never pushes it off screen. */
export const TranscriptSheet = forwardRef<ScrollView, { transcripts: TranscriptTurn[] }>(
  ({ transcripts }, ref) => {
    const { t } = useLocale();

    return (
      <View style={styles.sheet}>
        <ScrollView
          ref={ref}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
        >
          {transcripts.length === 0 ? (
            <Text style={styles.empty}>{t('room.transcriptEmpty')}</Text>
          ) : (
            transcripts.map((turn, index) => {
              const isExaminer = turn.role === 'EXAMINER';
              const isPeer = turn.role === 'AI_COCANDIDATE';
              const isCandidate2 = turn.role === 'CANDIDATE_2';

              return (
                <View
                  key={turn.id || index}
                  style={[
                    styles.turn,
                    isExaminer ? styles.turnExaminer : isPeer ? styles.turnPeer : styles.turnCandidate,
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
                    <Text style={styles.timestamp}>
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
    );
  }
);
TranscriptSheet.displayName = 'TranscriptSheet';

const styles = StyleSheet.create({
  sheet: {
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
  scroll: {
    paddingHorizontal: space.lg,
  },
  content: {
    paddingVertical: space.md,
    gap: space.sm,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  empty: {
    ...type.caption,
    textAlign: 'center',
    paddingVertical: space.lg,
  },
  turn: {
    borderRadius: radius.md,
    padding: space.md,
  },
  turnExaminer: {
    backgroundColor: colors.navySoft,
  },
  turnCandidate: {
    backgroundColor: colors.redSoft,
  },
  turnPeer: {
    backgroundColor: colors.surfaceMuted,
  },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
  },
  turnText: {
    ...type.body,
    color: colors.text,
    fontSize: 14,
  },
});
