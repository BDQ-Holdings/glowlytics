import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View, ViewToken, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Pattern } from '../types';
import { PatternCard } from './PatternCard';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { exportAndSharePattern } from '../services/patternExport';
import { trackEvent } from '../services/analytics';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };
const CardSeparator = () => <View style={{ width: Spacing.sm }} />;

interface Props {
  patterns: Pattern[];
  onShare?: (pattern: Pattern) => void;
}

export const PatternCarousel: React.FC<Props> = ({ patterns, onShare }) => {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const cardWidth = screenW - Spacing.lg * 2;
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

  const handleShare = useCallback(async (pattern: Pattern) => {
    if (onShare) {
      onShare(pattern);
    } else {
      await exportAndSharePattern(pattern);
    }
  }, [onShare]);

  if (patterns.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Patterns we've found</Text>
        <Feather name="chevron-right" size={16} color={Colors.textMuted} />
      </View>
      <FlatList
        data={patterns}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + Spacing.sm}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={CardSeparator}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={({ item }) => (
          <PatternCard
            pattern={item}
            widthHint={cardWidth}
            onPressDetail={() => handleDetail(item)}
            onPressShare={() => handleShare(item)}
          />
        )}
        keyExtractor={(p) => p.id}
      />
      {patterns.length > 1 && (
        <View style={styles.dots}>
          {patterns.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    // Break out of AtmosphereScreen's paddingHorizontal so the carousel
    // goes edge-to-edge, same pattern as the signal rings section.
    marginHorizontal: -Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 16,
  },
});
