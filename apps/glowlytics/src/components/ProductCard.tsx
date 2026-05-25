import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ProductEntry } from '../types';
import {
  FontFamily,
  FontSize,
  Glow,
  scoreColor,
} from '../constants/theme';
import { GlowIcon } from './glow/GlowIcons';

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

export const ProductCard: React.FC<Props> = ({ product, score, topContributor, timingLabel, onPress }) => {
  const P = Glow.palette;
  const safe = score !== undefined && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : undefined;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: P.surface, borderColor: P.glow }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {safe !== undefined && <AccentBar score={safe} />}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.nameCol}>
            <Text style={[styles.productName, { color: P.ink }]} numberOfLines={1}>
              {product.product_name}
            </Text>
            {timingLabel ? (
              <Text style={[styles.timingLabel, { color: P.accent }]} numberOfLines={1}>
                {timingLabel}
              </Text>
            ) : product.brand ? (
              <Text style={[styles.brand, { color: P.muted }]} numberOfLines={1}>
                {product.brand}
              </Text>
            ) : null}
          </View>
          {safe !== undefined && <ScoreRing score={safe} />}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: P.muted }]}>
            {product.ingredients_list.length} ingredient{product.ingredients_list.length !== 1 ? 's' : ''}
          </Text>
          {topContributor && (
            <>
              <Text style={[styles.dot, { color: P.muted }]}>{'\u00B7'}</Text>
              <Text style={[styles.contributorText, { color: P.ink }]} numberOfLines={1}>
                {topContributor}
              </Text>
            </>
          )}
        </View>
      </View>
      <GlowIcon name="arrow" size={14} color={P.muted} stroke={1.7} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    marginRight: 12,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  productName: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  brand: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  timingLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dot: {
    fontSize: FontSize.xs,
  },
  metaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  contributorText: {
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
