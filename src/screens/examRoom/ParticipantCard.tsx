import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Badge, Waveform, type BadgeTone } from '../../components/ui';
import { colors, radius, shadow, space } from '../../theme';

interface ParticipantCardProps {
  avatar: string;
  avatarColor: string;
  name: string;
  role: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  /**
   * `wide`: full-width horizontal card (the examiner across the table).
   * `compact`: stacked card for the side-by-side candidate row.
   */
  size: 'wide' | 'compact';
  /** Red outline: this seat is selected or is the one speaking. */
  highlighted: boolean;
  /** Solid red fill while speaking (examiner only). */
  filled?: boolean;
  /** Animates the waveform. */
  speaking: boolean;
  /** Seat is present but not part of the current exam part. */
  dimmed?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * One seat at the exam table. Deliberately carries no flex props: it sizes to its content,
 * and a parent row decides its width. A shared `flex: 1` here is what collapsed the examiner
 * card on Android, where Yoga uses `flex` for the height basis in a column.
 */
export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  avatar,
  avatarColor,
  name,
  role,
  badgeLabel,
  badgeTone,
  size,
  highlighted,
  filled = false,
  speaking,
  dimmed = false,
  onPress,
  disabled,
}) => {
  const onRed = highlighted && filled;
  const wide = size === 'wide';

  const identity = (
    <View style={styles.identity}>
      <View style={[styles.avatar, { backgroundColor: onRed ? colors.redPressed : avatarColor }]}>
        <Text style={styles.avatarText} numberOfLines={1}>
          {avatar}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.name, onRed && styles.nameOnRed]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.role, onRed && styles.roleOnRed]} numberOfLines={1}>
          {role}
        </Text>
      </View>
    </View>
  );

  const status = (
    <View style={wide ? styles.statusWide : styles.statusCompact}>
      <Badge label={badgeLabel} tone={badgeTone} />
      <Waveform
        active={speaking}
        color={onRed ? colors.white : highlighted ? colors.red : colors.borderStrong}
        accentColor={onRed ? colors.white : highlighted ? colors.red : colors.borderStrong}
        height={18}
        barWidth={3}
      />
    </View>
  );

  const cardStyle = [
    styles.card,
    wide ? styles.cardWide : styles.cardCompact,
    wide && styles.accentLeft,
    highlighted && styles.highlighted,
    onRed && styles.filled,
    dimmed && styles.dimmed,
  ];

  const body = wide ? (
    <>
      <View style={styles.wideIdentity}>{identity}</View>
      {status}
    </>
  ) : (
    <>
      {identity}
      {status}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: highlighted, disabled }}
        accessibilityLabel={name}
        style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  cardWide: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  cardCompact: {
    minHeight: 92,
    justifyContent: 'space-between',
    gap: space.sm,
  },
  accentLeft: {
    borderColor: colors.navy,
    borderLeftWidth: 4,
  },
  highlighted: {
    borderColor: colors.red,
    borderWidth: 1.5,
  },
  filled: {
    backgroundColor: colors.red,
    borderLeftWidth: 4,
    ...shadow.raised,
  },
  dimmed: {
    opacity: 0.55,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  // Row child of the wide card: takes the space left of the status block
  wideIdentity: {
    flex: 1,
    minWidth: 0,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  // Row child of `identity`: lets long names truncate instead of pushing the avatar
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.text,
  },
  nameOnRed: {
    color: colors.white,
  },
  role: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: colors.textMuted,
  },
  roleOnRed: {
    color: colors.redSoft,
  },
  statusWide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
});
