import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

const MILESTONES = [
  { day: 1, label: 'today' },
  { day: 7, label: 'first receipt' },
  { day: 14, label: 'unlock' },
  { day: 21, label: 'mature' },
];

export const PatternProgressBar: React.FC = () => {
  const dailyRecords = useStore((s) => s.dailyRecords);
  const dataDays = dailyRecords.length;
  const maxDay = MILESTONES[MILESTONES.length - 1].day;
  const clamped = Math.min(dataDays, maxDay);
  const progress = clamped / maxDay;

  // Hide after day 21 — no longer useful
  if (dataDays >= maxDay) return null;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        {MILESTONES.map((m) => {
          const x = (m.day / maxDay) * 100;
          const reached = dataDays >= m.day;
          return (
            <View
              key={m.day}
              style={[
                styles.milestone,
                { left: `${x}%` },
                reached && styles.milestoneReached,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {MILESTONES.map((m) => (
          <Text
            key={m.day}
            style={[
              styles.label,
              dataDays >= m.day && styles.labelReached,
            ]}
          >
            {m.label}
          </Text>
        ))}
      </View>
      <Text style={styles.footer}>
        {dataDays >= 14
          ? 'Real patterns unlocked · keep scanning'
          : `Day ${dataDays} of 14 — real patterns unlock soon`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  track: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  milestone: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    transform: [{ translateX: -5 }],
  },
  milestoneReached: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
  },
  labelReached: {
    color: Colors.primary,
  },
  footer: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
