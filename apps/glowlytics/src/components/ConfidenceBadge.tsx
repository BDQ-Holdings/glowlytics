import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import type { Confidence } from '../types';

interface Props {
  level: Confidence;
}

const config = {
  low: { color: Colors.warning, label: 'Low confidence', dots: 1 },
  med: { color: Colors.info, label: 'Medium confidence', dots: 2 },
  high: { color: Colors.success, label: 'High confidence', dots: 3 },
};

export const ConfidenceBadge: React.FC<Props> = ({ level }) => {
  const c = config[level];
  return (
    <View style={[styles.container, { borderColor: c.color + '30' }]}>
      <View style={styles.dots}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i <= c.dots ? c.color : Colors.surfaceHighlight,
                opacity: i <= c.dots ? 1 : 0.8,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: c.color }]}>{c.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: BorderRadius.full,
  },
  label: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansSemiBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
