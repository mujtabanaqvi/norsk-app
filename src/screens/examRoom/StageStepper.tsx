import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import type { ExamStage } from '../../types/exam';
import { colors, radius, space } from '../../theme';

const STAGES = ['DEL_1', 'DEL_2', 'DEL_3'] as const;

/** Del 1 / Del 2 / Del 3 segments. Each label is stacked ("Del 1" over "Monolog") so it fits a third of a phone. */
export const StageStepper: React.FC<{ stage: ExamStage }> = ({ stage }) => {
  const { t } = useLocale();

  return (
    <View style={styles.row}>
      {STAGES.map((s) => {
        const isActive = stage === s;
        const label =
          s === 'DEL_1' ? t('room.pillDel1') : s === 'DEL_2' ? t('room.pillDel2') : t('room.pillDel3');
        const [part, ...rest] = label.split(':');
        const name = rest.join(':').trim();

        return (
          // The flex: 1 lives on this row-child wrapper only, never on a reusable style
          <View key={s} style={styles.cell}>
            <View style={[styles.segment, isActive && styles.segmentActive]}>
              <View style={styles.partRow}>
                {isActive && <View style={styles.dot} />}
                <Text style={[styles.part, isActive && styles.textActive]} numberOfLines={1}>
                  {part}
                </Text>
              </View>
              {name !== '' && (
                <Text style={[styles.name, isActive && styles.textActive]} numberOfLines={1}>
                  {name}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.xs,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  segment: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.navyLight,
  },
  segmentActive: {
    backgroundColor: colors.red,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  part: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.navySoft,
  },
  name: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.navySoft,
    textAlign: 'center',
  },
  textActive: {
    color: colors.white,
  },
});
