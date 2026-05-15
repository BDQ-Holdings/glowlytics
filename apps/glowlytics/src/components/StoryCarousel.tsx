/**
 * StoryCarousel — shared story-page primitives.
 *
 * Two small components used by the scan and bone-structure result screens
 * to render full-viewport "story" pages with a vertical paging FlatList
 * and a progress indicator. Extracted from `app/scan/results.tsx` so the
 * bone-results carousel matches the same pacing and visual language.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Glow, Spacing } from '../constants/theme';

interface StoryPageProps {
  children: React.ReactNode;
  screenH: number;
  insets: { top: number; bottom: number };
  /** Override the default gradient background — e.g. for an empty state. */
  gradient?: readonly [string, string, ...string[]];
}

export const StoryPage: React.FC<StoryPageProps> = ({ children, screenH, insets, gradient }) => {
  const colors = gradient ?? [Glow.palette.bg, Glow.palette.surface, Glow.palette.glow] as const;
  return (
    <View style={[styles.page, { height: screenH }]}>
      <LinearGradient
        colors={colors as readonly [string, string, ...string[]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.pageContent,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xxl },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

interface ProgressDotsProps {
  count: number;
  active: number;
}

export const ProgressDots: React.FC<ProgressDotsProps> = ({ count, active }) => {
  return (
    <View style={dotStyles.container} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            i === active && dotStyles.dotActive,
            i < active && dotStyles.dotDone,
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  page: { width: '100%' },
  pageContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
});

const dotStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: Spacing.sm,
    top: '42%',
    gap: Spacing.sm,
    zIndex: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.textDim,
  },
  dotActive: {
    backgroundColor: Glow.palette.accent,
    width: 5,
    height: 16,
    borderRadius: 3,
  },
  dotDone: {
    backgroundColor: Glow.palette.accent2,
  },
});
