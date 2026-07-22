import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { FontFamily, Glow, Spacing } from '../constants/theme';

const P = Glow.palette;

const MILESTONES = [
  { day: 1,  label: 'today' },
  { day: 7,  label: 'first receipt' },
  { day: 14, label: 'unlock' },
  { day: 21, label: 'mature' },
];

const MAX_DAY = MILESTONES[MILESTONES.length - 1].day;

export const PatternProgressBar: React.FC = () => {
  const dailyRecords = useStore((s) => s.dailyRecords);
  const dataDays = dailyRecords.length;
  const clamped = Math.min(dataDays, MAX_DAY);
  const progress = clamped / MAX_DAY;

  // Hide after day 21 — no longer useful as a primer
  if (dataDays >= MAX_DAY) return null;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        {MILESTONES.map((m) => {
          const x = (m.day / MAX_DAY) * 100;
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
      <Text style={styles.footer}>
        {dataDays >= 14
          ? 'Real patterns unlocked · keep scanning'
          : `Day ${dataDays} of 14. Real patterns unlock soon`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingHorizontal: 2,
    gap: 8,
  },
  track: {
    height: 3,
    backgroundColor: P.glow,
    borderRadius: 2,
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: P.accent,
    borderRadius: 2,
  },
  milestone: {
    position: 'absolute',
    top: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: P.surface,
    borderWidth: 1.5,
    borderColor: P.glow,
    transform: [{ translateX: -4.5 }],
  },
  milestoneReached: {
    borderColor: P.accent,
    backgroundColor: P.accent,
  },
  footer: {
    color: P.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.2,
    paddingTop: 2,
  },
});
