import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Pattern } from '../types';
import { PatternCard } from './PatternCard';
import { FontFamily, Glow, Spacing } from '../constants/theme';
import { SectionHead } from './glow/GlowPrimitives';
import { exportAndSharePattern } from '../services/patternExport';
import { trackEvent } from '../services/analytics';

const P = Glow.palette;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };
const CardSeparator = () => <View style={{ width: 10 }} />;

interface Props {
  patterns: Pattern[];
  onShare?: (pattern: Pattern) => void;
  /** Optional override — when omitted falls back to "Other patterns" so it
   *  reads correctly when the featured pattern is shown separately. */
  title?: string;
  hint?: string;
}

export const PatternCarousel: React.FC<Props> = ({
  patterns,
  onShare,
  title = 'Other patterns',
  hint,
}) => {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  // Show ~92% of the screen so the next card peeks — invites the swipe gesture.
  const cardWidth = Math.min(screenW - Spacing.lg * 2 - 32, 320);
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef((info: { viewableItems: ViewToken[] }) => {
    if (info.viewableItems[0]?.index != null) {
      setActiveIndex(info.viewableItems[0].index);
    }
  }).current;

  const handleDetail = useCallback(
    (pattern: Pattern) => {
      trackEvent('pattern_viewed', {
        pattern_id: pattern.id,
        pattern_type: pattern.type,
        confidence: pattern.confidence,
        is_predicted: pattern.isPredicted,
      });
      router.push({ pathname: '/pattern/[id]', params: { id: pattern.id } });
    },
    [router],
  );

  const handleShare = useCallback(
    async (pattern: Pattern) => {
      if (onShare) onShare(pattern);
      else await exportAndSharePattern(pattern);
    },
    [onShare],
  );

  const renderItem: ListRenderItem<Pattern> = useCallback(
    ({ item }) => (
      <PatternCard
        pattern={item}
        widthHint={cardWidth}
        onPressDetail={() => handleDetail(item)}
        onPressShare={() => handleShare(item)}
      />
    ),
    [cardWidth, handleDetail, handleShare],
  );

  if (patterns.length === 0) return null;

  const effectiveHint = hint ?? `${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SectionHead title={title} hint={effectiveHint} ink={P.ink} muted={P.muted} />
      </View>
      <FlatList
        data={patterns}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 10}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={CardSeparator}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={renderItem}
        keyExtractor={(p) => p.id}
      />
      {patterns.length > 1 && (
        <View style={styles.dots}>
          {patterns.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Edge-to-edge — outer wrapper bleeds out of the home padding so the
    // last card can peek off-screen. List itself adds horizontal padding.
    marginHorizontal: -Spacing.lg,
    marginTop: Spacing.sm,
    gap: 12,
  },
  header: {
    paddingHorizontal: Spacing.lg,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: 4,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 6,
    marginTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: P.glow,
  },
  dotActive: {
    backgroundColor: P.accent,
    width: 18,
    borderRadius: 3,
  },
});
