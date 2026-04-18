import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  total: number;
  current: number;
}

export const ProgressDots: React.FC<Props> = ({ total, current }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        const isComplete = i < current;

        if (isActive) {
          return (
            <View key={i} style={styles.dotActiveOuter}>
              <LinearGradient
                colors={['#3A9E8F', '#2B8C7E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.dotActiveGradient}
              />
            </View>
          );
        }

        return (
          <View
            key={i}
            style={[
              styles.dot,
              isComplete && styles.dotComplete,
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceHighlight,
  },
  dotComplete: {
    backgroundColor: 'rgba(58, 158, 143, 0.45)',
  },
  dotActiveOuter: {
    width: 32,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  dotActiveGradient: {
    flex: 1,
    borderRadius: 4,
  },
});
