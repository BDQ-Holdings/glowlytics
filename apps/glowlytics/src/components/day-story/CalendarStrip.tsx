/**
 * CalendarStrip — horizontal scrollable day picker for the DayPager.
 *
 * Each day is a small circle: outlined for past days, filled-ink with an
 * accent halo for the active day. Days where the user scanned get a tiny
 * accent dot underneath. Tapping a day fires `onPick(index)` so the
 * containing pager can scroll to that page. The strip auto-scrolls to keep
 * the active day in view when the parent paginates.
 */

import React, { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { FontFamily, Glow } from '../../constants/theme';
import type { DayEntry } from './dayModel';

const P = Glow.palette;
const TILE_WIDTH = 44;
const TILE_GAP = 4;

export interface CalendarStripProps {
  days: DayEntry[];
  activeIndex: number;
  onPick: (index: number) => void;
}

export function CalendarStrip({ days, activeIndex, onPick }: CalendarStripProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const stripWidthRef = useRef<number>(0);
  // Tracks whether we've already performed the initial "snap-to-today" jump.
  // First mount lands on today *without* animation; subsequent activeIndex
  // changes (user swiping or tapping the strip) animate.
  const didInitialSnapRef = useRef(false);

  // Compute the target scroll offset that puts the given tile in the centre
  // of the strip.
  const offsetForIndex = (idx: number, stripWidth: number): number => {
    const tileStep = TILE_WIDTH + TILE_GAP;
    const targetX = idx * tileStep + TILE_WIDTH / 2;
    return Math.max(0, targetX - stripWidth / 2);
  };

  // Keep the active tile centred in the viewport when the index moves.
  // First mount: the strip width hasn't been measured yet so this effect
  // bails out — the `handleLayout` path below picks up the slack.
  useEffect(() => {
    if (!scrollRef.current || stripWidthRef.current === 0) return;
    const offset = offsetForIndex(activeIndex, stripWidthRef.current);
    scrollRef.current.scrollTo({ x: offset, animated: didInitialSnapRef.current });
    didInitialSnapRef.current = true;
  }, [activeIndex]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width === stripWidthRef.current) return;
    stripWidthRef.current = width;
    // First measurement arrives after the useEffect above ran with width=0,
    // so the initial snap-to-today never happened. Do it now so today is
    // in view on the very first paint.
    if (!didInitialSnapRef.current && scrollRef.current) {
      const offset = offsetForIndex(activeIndex, width);
      scrollRef.current.scrollTo({ x: offset, animated: false });
      didInitialSnapRef.current = true;
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={handleLayout}
      contentContainerStyle={styles.content}
      decelerationRate="fast"
    >
      {days.map((d, i) => {
        const active = i === activeIndex;
        return (
          <TouchableOpacity
            key={d.date}
            onPress={() => onPick(i)}
            accessibilityRole="button"
            accessibilityLabel={`${d.weekday} ${d.m} ${d.d}${d.isToday ? ', today' : ''}${active ? ', selected' : ''}`}
            style={[styles.cell, { marginLeft: i === 0 ? 0 : TILE_GAP }]}
          >
            <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
              {d.isToday ? 'Today' : d.day.toUpperCase()}
            </Text>
            <View style={[styles.circle, active ? styles.circleActive : styles.circleInactive]}>
              <Text style={[styles.dateNum, active && styles.dateNumActive]}>{d.d}</Text>
            </View>
            <View
              style={[
                styles.dot,
                {
                  // Show an accent dot under scanned days the user is *not* on,
                  // a muted dot for negative-delta days, and nothing for the
                  // active day (the halo already calls it out).
                  backgroundColor: active
                    ? 'transparent'
                    : d.hasScan
                    ? d.delta != null && d.delta < 0 ? P.muted : P.accent
                    : 'transparent',
                  opacity: active ? 0 : 0.7,
                },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, alignItems: 'center' },
  cell: {
    width: TILE_WIDTH,
    alignItems: 'center',
    paddingTop: 4,
  },
  dayLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    color: P.muted,
    fontFamily: FontFamily.sansMedium,
    opacity: 0.7,
  },
  dayLabelActive: {
    color: P.ink,
    opacity: 1,
    fontFamily: FontFamily.sansBold,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: P.muted + '33',
  },
  circleActive: {
    backgroundColor: P.ink,
    // The "soft glow" effect: layered shadow stack to mimic the prototype's
    // `0 0 0 2px bg, 0 0 0 4px accent, 0 6px 14px accent`.
    shadowColor: P.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 2,
    borderColor: P.accent,
  },
  dateNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 15,
    color: P.ink,
  },
  dateNumActive: { color: P.surface },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
});
