import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import type { ProductEntry } from '../types';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  scoreColor,
} from '../constants/theme';

interface Props {
  product: ProductEntry;
  score?: number;
  topContributor?: string;
  timingLabel?: string;
  onPress: () => void;
}

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score }: { score: number }) {
  const safe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const progress = safe / 100;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const color = scoreColor(safe);

  return (
    <View style={styles.ringContainer}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color + '20'}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={[styles.ringText, { color }]}>{safe}</Text>
    </View>
  );
}

function AccentBar({ score }: { score: number }) {
  return (
    <View style={[styles.accentBar, { backgroundColor: scoreColor(score) }]} />
  );
}

function cardBg(score?: number): string {
  if (score === undefined || !Number.isFinite(score)) return Colors.glass;
  if (score < 35) return 'rgba(209, 67, 67, 0.05)';
  if (score >= 75) return 'rgba(52, 167, 123, 0.04)';
  return Colors.glass;
}

export const ProductCard: React.FC<Props> = ({ product, score, topContributor, timingLabel, onPress }) => {
  const safe = score !== undefined && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : undefined;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg(safe) }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {safe !== undefined && <AccentBar score={safe} />}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.nameCol}>
            <Text style={styles.productName} numberOfLines={1}>{product.product_name}</Text>
            {timingLabel ? (
              <Text style={styles.timingLabel} numberOfLines={1}>{timingLabel}</Text>
            ) : product.brand ? (
              <Text style={styles.brand} numberOfLines={1}>{product.brand}</Text>
            ) : null}
          </View>
          {safe !== undefined && <ScoreRing score={safe} />}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {product.ingredients_list.length} ingredient{product.ingredients_list.length !== 1 ? 's' : ''}
          </Text>
          {topContributor && (
            <>
              <Text style={styles.dot}>{'\u00B7'}</Text>
              <Text style={styles.contributorText} numberOfLines={1}>{topContributor}</Text>
            </>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={Colors.textDim} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    paddingLeft: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
    marginRight: Spacing.sm,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  productName: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  brand: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  timingLabel: {
    color: Colors.primary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  dot: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
  metaText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  contributorText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    position: 'absolute',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
});
