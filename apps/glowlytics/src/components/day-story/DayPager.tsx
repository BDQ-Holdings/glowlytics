/**
 * DayPager — full-bleed horizontal pager over the 14-day timeline.
 *
 * Built on `FlatList` with `pagingEnabled` so each page snaps to a single
 * viewport width. The user can either swipe horizontally between days OR
 * tap a tile in the `CalendarStrip` (which calls `scrollToIndex`).
 *
 * On mount + on day-window change we land on today (the last index).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Glow } from '../../constants/theme';
import { useStore } from '../../store/useStore';
import { buildDayTimeline, TODAY_INDEX, type DayEntry } from './dayModel';
import { CalendarStrip } from './CalendarStrip';
import { DayPage } from './DayPage';

const P = Glow.palette;

// How far the seam scrim bleeds past the strip's bottom edge into the body, so
// the fade covers the actual strip→body boundary instead of ending mid-strip.
const SEAM_OVERLAP = 48;


export interface DayPagerProps {
  onScan?: () => void;
  onOpenRitual?: () => void;
  onShare?: (day: DayEntry, template?: string) => void;
}

export function DayPager({ onScan, onOpenRitual, onShare }: DayPagerProps) {
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const { width: screenWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<DayEntry> | null>(null);

  const days = useMemo(
    () => buildDayTimeline(dailyRecords, modelOutputs, 14),
    [dailyRecords, modelOutputs],
  );
  const todayIdx = TODAY_INDEX(days);
  const [activeIdx, setActiveIdx] = useState(todayIdx);
  const [stripHeight, setStripHeight] = useState(0);

  // Arc sparkline — only days with a score, oldest → newest.
  const arcSeries = useMemo(
    () => days.filter((d) => d.score != null).map((d) => d.score as number),
    [days],
  );

  // Scroll to today on first paint + whenever the window rebuilds.
  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: todayIdx, animated: false });
    });
  }, [todayIdx]);

  const onViewableItemsChanged = useRef<(info: { viewableItems: ViewToken[] }) => void>(({ viewableItems }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActiveIdx(first.index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handlePick = useCallback((i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setActiveIdx(i);
  }, []);

  // Item layout — every page is the screen width; constant-time scrollToIndex.
  const getItemLayout = useCallback(
    (_data: ArrayLike<DayEntry> | null | undefined, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth],
  );

  const scrollX = useSharedValue(0);

  const renderItem = useCallback(
    ({ item, index }: { item: DayEntry; index: number }) => (
      <FadePage scrollX={scrollX} index={index} width={screenWidth}>
        <DayPage
          day={item}
          index={index}
          width={screenWidth}
          arcSeries={arcSeries}
          onScan={onScan}
          onOpenRitual={onOpenRitual}
          onShare={onShare}
        />
      </FadePage>
    ),
    [screenWidth, arcSeries, onScan, onOpenRitual, onShare, scrollX],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.value = e.nativeEvent.contentOffset.x;
    },
    [scrollX],
  );

  const handleLayout = (_e: LayoutChangeEvent) => {
    // Re-anchor on first measure (handles rotation / reflow).
    listRef.current?.scrollToOffset({ offset: screenWidth * activeIdx, animated: false });
  };

  const handleStripLayout = useCallback((e: LayoutChangeEvent) => {
    setStripHeight(e.nativeEvent.layout.height);
  }, []);

  return (
    <View style={styles.host}>
      {/* Seam scrim — fades the app background down across the strip→body
          boundary. Rendered BEFORE the strip (and the FlatList body, whose top
          is transparent) so it layers BEHIND the CalendarStrip circles, leaving
          their opacity untouched; pointerEvents none so it never intercepts a
          tap or swipe. Height = measured strip height + SEAM_OVERLAP so its
          lower edge bleeds into the top of the body and actually covers the
          seam rather than fading out mid-strip. */}
      <LinearGradient
        testID="strip-gradient"
        pointerEvents="none"
        colors={[P.bg + '4D', P.bg + '00']}
        locations={[0, 1]}
        style={[styles.seam, { height: stripHeight + SEAM_OVERLAP }]}
      />
      <View style={styles.strip} onLayout={handleStripLayout}>
        <CalendarStrip days={days} activeIndex={activeIdx} onPick={handlePick} />
      </View>
      <FlatList
        ref={listRef}
        data={days}
        keyExtractor={(d) => d.date}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={todayIdx}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onLayout={handleLayout}
        decelerationRate="fast"
        snapToInterval={screenWidth}
        snapToAlignment="start"
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  strip: { paddingTop: 12, paddingBottom: 6 },
  seam: { position: 'absolute', top: 0, left: 0, right: 0 },
});

interface FadePageProps {
  scrollX: ReturnType<typeof useSharedValue<number>>;
  index: number;
  width: number;
  children: React.ReactNode;
}

// Top-level so React reconciles each instance as the same component rather
// than treating the closure as a fresh definition every parent render.
function FadePage({ scrollX, index, width, children }: FadePageProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * width);
    const opacity = interpolate(
      distance,
      [0, width * 0.5, width],
      [1, 0.35, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });
  return <Animated.View style={[{ width }, animatedStyle]}>{children}</Animated.View>;
}