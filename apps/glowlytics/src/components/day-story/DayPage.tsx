/**
 * DayPage — full-bleed vertical "story" for a single calendar day.
 *
 * Vertically scrollable. Width is locked to the device viewport so the
 * parent DayPager can horizontal-snap one page at a time.
 *
 * Composition (top → bottom):
 *   1. Date pill + streak chip + share affordance
 *   2. Hero score (massive number, delta chip, italic verdict, note)
 *   3. Take-today's-check-in CTA (only on `isToday`)
 *   4. Inline facet pill row (Hydrated / Calm / Even / Firm)
 *   5. FacialStructure card
 *   6. Pattern of the day ("What we noticed")
 *   7. Ritual mini preview
 *   8. 14-day arc sparkline
 *   9. Share this day CTA
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { GlowIcon, GlowSpark, type GlowIconName } from '../glow/GlowIcons';
import { SectionHead, BreathingGlow } from '../glow/GlowPrimitives';
import { FontFamily, Glow } from '../../constants/theme';
import { GLOW_FACETS, FACET_SIGNAL_ROUTE, type GlowFacetKey } from '../../constants/facets';
import { useStore } from '../../store/useStore';
import { FacialStructure } from './FacialStructure';
import { facetsForDay, headlineForDay, moodAdjective, type DayEntry } from './dayModel';
import { buildRitualSteps, ritualSectionForHour, ritualStepDone } from '../../services/ritual';

const P = Glow.palette;
const FACET_ICON = Object.fromEntries(
  GLOW_FACETS.map((f) => [f.key, f.icon]),
) as Record<GlowFacetKey, GlowIconName>;

export interface DayPageProps {
  day: DayEntry;
  /** Index in the timeline — used for stagger animation seed. */
  index: number;
  width: number;
  arcSeries: number[];
  onScan?: () => void;
  onOpenRitual?: () => void;
  onShare?: (day: DayEntry, template?: string) => void;
}

export function DayPage({ day, index: _index, width, arcSeries, onScan, onOpenRitual, onShare }: DayPageProps) {
  const modelOutputs = useStore((s) => s.modelOutputs);
  const patterns = useStore((s) => s.patterns);
  const ritualCompletions = useStore((s) => s.ritualCompletions);
  const toggleRitualStep = useStore((s) => s.toggleRitualStep);
  const products = useStore((s) => s.products);
  const getStreak = useStore((s) => s.getStreak);

  const streak = getStreak();
  const facets = useMemo(() => facetsForDay(day, modelOutputs), [day, modelOutputs]);
  const headline = useMemo(() => headlineForDay(day), [day]);
  const adj = useMemo(() => moodAdjective(day.score), [day.score]);
  const [minuteTick, setMinuteTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => clearInterval(interval);
  }, []);


  // Pick a pattern to feature on this day; cycle through patterns so each
  // page has a distinct insight. Day 0 of the window pairs with pattern 0,
  // and so on — gives reviewers a stable mental map.
  const pattern = patterns && patterns.length > 0
    ? patterns[Math.abs(day.d) % patterns.length]
    : null;

  // Ritual mini — real steps from the shared builder for this page's date.
  // Today is filtered to the current time-of-day section (morning before 17:00,
  // evening after) plus all-day habits; past days show the full ritual for that
  // date and are read-only historical evidence.
  const recordedRitualStepIds = useMemo(
    () => Object.keys(ritualCompletions[day.date] ?? {}),
    [ritualCompletions, day.date],
  );
  const allRitualSteps = useMemo(
    () => buildRitualSteps(products, day.date, recordedRitualStepIds),
    [products, day.date, recordedRitualStepIds],
  );
  const currentRitualSection = useMemo(() => ritualSectionForHour(new Date().getHours()), [minuteTick]);
  const ritualSteps = day.isToday
    ? allRitualSteps.filter(
        (s) => s.section === currentRitualSection || s.section === 'allday',
      )
    : allRitualSteps;
  const ritualDone = ritualSteps.filter(
    (s) => ritualStepDone(ritualCompletions, s.id, day.date),
  ).length;
  const ritualPct = ritualSteps.length === 0 ? 0 : (ritualDone / ritualSteps.length) * 100;

  return (
    <ScrollView
      style={[styles.page, { width }]}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Per-page breathing halo */}
      <View style={styles.haloAnchor} pointerEvents="none">
        <BreathingGlow color={P.accent + '30'} size={320} />
      </View>

      {/* Date pill + share + streak */}
      <View style={styles.dateRow}>
        <View>
          <Text style={styles.eyebrow}>
            {(day.isToday ? 'Today' : day.weekday).toUpperCase()}
          </Text>
          <Text style={styles.dateLabel}>{day.m} {day.d}</Text>
        </View>
        <View style={styles.dateRowActions}>
          {onShare && (
            <TouchableOpacity
              onPress={() => onShare(day)}
              accessibilityRole="button"
              accessibilityLabel="Share this day"
              style={styles.iconBtn}
            >
              <GlowIcon name="share" size={16} color={P.ink} stroke={1.7} />
            </TouchableOpacity>
          )}
          {streak > 0 && (
            <View style={styles.streakChip}>
              <GlowIcon name="flame" size={14} color={P.accent2} stroke={1.7} />
              <Text style={styles.streakNum}>{streak}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Hero score */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>GLOW SCORE</Text>
        <Text style={styles.heroNum}>{day.score ?? '—'}</Text>
        {day.delta != null && day.delta !== 0 && (
          <View
            style={[
              styles.deltaChip,
              {
                backgroundColor: (day.delta > 0 ? P.accent : P.muted) + '20',
              },
            ]}
          >
            <Text style={[styles.deltaText, { color: day.delta > 0 ? P.accent : P.muted }]}>
              {day.delta > 0 ? '↑ +' : '↓ '}{Math.abs(day.delta)} vs. last scan
            </Text>
          </View>
        )}
        {day.score != null && (
          <Text style={styles.heroVerdict}>
            You look <Text style={styles.heroEm}>{adj}</Text>.
          </Text>
        )}
        <Text style={styles.heroNote}>
          {day.hasScan ? day.note : headline}
        </Text>
      </View>

      {/* Take today's check-in — Today only */}
      {day.isToday && onScan && (
        <View style={styles.ctaWrap}>
          <TouchableOpacity onPress={onScan} accessibilityRole="button" style={styles.ctaPrimary}>
            <GlowIcon name="camera" size={16} color={P.surface} stroke={1.7} />
            <Text style={styles.ctaPrimaryText}>Take today's check-in</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Facet grid — 4 equal-width tiles for Hydrated · Calm · Even · Firm.
          Previously this was a horizontally-scrollable pill row with auto-sized
          widths driven by the label + value content; the four signals are
          peers and visually deserve equal real estate. Stack each tile
          vertically (icon → label → score) so the narrow column reads cleanly
          without the horizontal cramping the old pill layout caused. */}
      <View style={styles.facetGrid}>
        {GLOW_FACETS.map((f) => {
          const val = facets[f.key];
          return (
            <TouchableOpacity
              key={f.key}
              style={styles.facetTile}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={`${f.label} ${val ?? 'no reading'} — details`}
              onPress={() => router.push(`/signal/${FACET_SIGNAL_ROUTE[f.key]}`)}
            >
              <GlowIcon name={FACET_ICON[f.key]} size={18} color={P.accent} stroke={1.7} />
              <Text style={styles.facetLabel} numberOfLines={1}>{f.label}</Text>
              <Text style={styles.facetValue}>{val == null ? '—' : val}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Facial structure */}
      <FacialStructure onShare={onShare ? () => onShare(day, 'structure') : undefined} />

      {/* Pattern card */}
      {pattern && (
        <View style={styles.section}>
          <SectionHead title="What we noticed" hint={pattern.confidence ?? 'pattern'} ink={P.ink} muted={P.muted} />
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.patternCard}
            accessibilityRole="button"
            accessibilityLabel={`See evidence for ${pattern.insightText}`}
            onPress={() =>
              router.push({
                pathname: '/pattern/[id]',
                params: { id: pattern.id },
              })
            }
          >
            <Text style={styles.patternTag}>
              {(pattern.driverLabel || pattern.driver || 'pattern').toUpperCase()} · {(pattern.signal || 'signal').toUpperCase()}
            </Text>
            <Text style={styles.patternTitle}>{pattern.insightText}</Text>
            <Text style={styles.patternBody} numberOfLines={3}>{pattern.detailText}</Text>
            <View style={styles.patternMore}>
              <Text style={styles.patternMoreText}>See the evidence</Text>
              <GlowIcon name="arrow" size={12} color={P.accent} stroke={1.8} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Ritual mini */}
      <View style={styles.section}>
        <SectionHead
          title={day.isToday ? "Today's ritual" : "That day's ritual"}
          hint={`${ritualDone}/${ritualSteps.length}`}
          ink={P.ink}
          muted={P.muted}
        />
        <View style={styles.ritualCard}>
          <View style={styles.ritualBar}>
            <View style={[styles.ritualBarFill, { width: `${ritualPct}%` }]} />
          </View>
          {ritualSteps.length === 0 ? (
            <View>
              <Text style={styles.ritualEmpty}>Build your shelf</Text>
              <Text style={styles.ritualEmptySub}>Add products and they show up here.</Text>
            </View>
          ) : (
            ritualSteps.map((step, i) => {
              const done = ritualStepDone(ritualCompletions, step.id, day.date);
              return (
                <TouchableOpacity
                  key={step.id}
                  style={[styles.ritualRow, i < ritualSteps.length - 1 && styles.ritualRowBorder]}
                  activeOpacity={day.isToday ? 0.85 : 1}
                  disabled={!day.isToday}
                  onPress={day.isToday ? () => toggleRitualStep(step.id, day.date) : undefined}
                  accessibilityRole={day.isToday ? 'button' : undefined}
                  accessibilityState={{ checked: done, disabled: !day.isToday }}
                  accessibilityLabel={`${done ? 'Completed' : day.isToday ? 'Mark done' : 'Not completed'}: ${step.title}, ${step.time}`}
                >
                  <View style={[styles.ritualDot, done ? styles.ritualDotDone : styles.ritualDotPending]}>
                    {done && <GlowIcon name="check" size={12} color={P.surface} stroke={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ritualTitle, done && styles.ritualTitleDone]} numberOfLines={1}>{step.title}</Text>
                    <Text style={styles.ritualTime}>{step.time}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          {/* Full-ritual link lives outside the empty/non-empty branch so the
              empty "Build your shelf" state stays navigable too. */}
          {onOpenRitual && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onOpenRitual}
              accessibilityRole="button"
              accessibilityLabel="Open full ritual"
              style={styles.ritualOpen}
            >
              <Text style={styles.ritualOpenText}>Open full ritual</Text>
              <GlowIcon name="arrow" size={12} color={P.accent} stroke={1.8} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 14-day arc */}
      {arcSeries.length > 1 && (
        <View style={styles.section}>
          <SectionHead title="The arc" hint={`${arcSeries.length} days`} ink={P.ink} muted={P.muted} />
          <View style={styles.arcCard}>
            <GlowSpark data={arcSeries} color={P.accent} width={296} height={64} />
            <View style={styles.arcLabels}>
              <Text style={styles.arcLabel}>start</Text>
              <Text style={styles.arcLabel}>today</Text>
            </View>
          </View>
        </View>
      )}

      {/* Bottom spacer — reserves the same vertical room the retired
          "Share this day" CTA used to occupy, so the rhythm between the arc
          sparkline and the camera FAB stays the same. Share is still
          reachable from the iconBtn in the date row at the top of the page. */}
      <View style={styles.shareSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingBottom: 140 },
  haloAnchor: { position: 'absolute', top: 40, alignSelf: 'center' },
  dateRow: {
    paddingHorizontal: 24,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRowActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  eyebrow: { fontSize: 11, color: P.muted, letterSpacing: 1.2, fontFamily: FontFamily.sansMedium },
  dateLabel: { fontFamily: FontFamily.sansBold, fontSize: 16, color: P.ink, marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakChip: {
    height: 38,
    paddingHorizontal: 12,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakNum: { fontFamily: FontFamily.sansBold, fontSize: 13, color: P.ink },
  hero: { paddingTop: 40, paddingHorizontal: 24, alignItems: 'center' },
  heroEyebrow: { fontSize: 11, color: P.muted, letterSpacing: 1.6, fontFamily: FontFamily.sansMedium },
  heroNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 124,
    lineHeight: 120,
    color: P.ink,
    marginTop: 8,
    letterSpacing: -2,
  },
  deltaChip: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deltaText: { fontSize: 12, fontFamily: FontFamily.sansBold },
  heroVerdict: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 22,
    color: P.ink,
    marginTop: 22,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 28,
  },
  heroEm: { fontStyle: 'italic', color: P.accent, fontFamily: FontFamily.sansBold },
  heroNote: {
    fontSize: 13,
    color: P.muted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  ctaWrap: { paddingHorizontal: 24, paddingTop: 28 },
  ctaPrimary: {
    paddingVertical: 15,
    backgroundColor: P.ink,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: P.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  ctaPrimaryText: { fontFamily: FontFamily.sansBold, fontSize: 15, color: P.surface },
  // 4-column equal-width grid for Hydrated · Calm · Even · Firm. Each tile
  // gets `flex: 1` so the row always splits the available width into four
  // identical columns regardless of label/value content. Padding-horizontal
  // matches the rest of the page chrome (24px) and the 8px gap between tiles
  // sits inside the page's spacing scale.
  facetGrid: {
    paddingTop: 28,
    paddingHorizontal: 24,
    flexDirection: 'row',
    gap: 8,
  },
  facetTile: {
    flex: 1,
    minWidth: 0, // prevents content (e.g. wide labels) from pushing the tile
    backgroundColor: P.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: P.glow,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  facetLabel: {
    fontSize: 11,
    color: P.muted,
    fontFamily: FontFamily.sansMedium,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  facetValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: 20,
    color: P.ink,
    lineHeight: 22,
    textAlign: 'center',
  },
  section: { paddingTop: 24, paddingHorizontal: 24 },
  patternCard: {
    marginTop: 12,
    backgroundColor: P.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: P.glow,
  },
  patternTag: { fontSize: 11, color: P.accent, letterSpacing: 1, fontFamily: FontFamily.sansBold },
  patternTitle: { fontFamily: FontFamily.sansBold, fontSize: 22, color: P.ink, marginTop: 8, lineHeight: 27 },
  patternBody: { fontSize: 13, color: P.muted, marginTop: 8, lineHeight: 19 },
  patternMore: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  patternMoreText: { fontSize: 11, color: P.accent, fontFamily: FontFamily.sansBold },
  ritualCard: {
    marginTop: 12,
    backgroundColor: P.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: P.glow,
  },
  ritualBar: { height: 6, backgroundColor: P.bg, borderRadius: 999, overflow: 'hidden', marginBottom: 14 },
  ritualBarFill: { height: '100%', backgroundColor: P.accent, borderRadius: 999 },
  ritualEmpty: { fontFamily: FontFamily.sansBold, fontSize: 14, color: P.ink },
  ritualEmptySub: { fontSize: 12, color: P.muted, marginTop: 4 },
  ritualRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  ritualRowBorder: { borderBottomWidth: 1, borderBottomColor: P.bg },
  ritualDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ritualDotDone: { backgroundColor: P.accent },
  ritualDotPending: { borderWidth: 1.5, borderColor: P.muted },
  ritualTitle: { fontSize: 13, color: P.ink, fontFamily: FontFamily.sansMedium },
  ritualTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  ritualTime: { fontSize: 11, color: P.muted, marginTop: 2 },
  ritualOpen: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  ritualOpenText: { fontSize: 11, color: P.accent, fontFamily: FontFamily.sansBold },
  arcCard: { marginTop: 12, backgroundColor: P.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: P.glow },
  arcLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  arcLabel: { fontSize: 11, color: P.muted },
  // Vertical room that the removed "Share this day" pill used to take:
  // section paddingTop (24) + button height (~50). Keeps the FAB-clearance
  // rhythm intact without re-introducing the redundant CTA.
  shareSpacer: { height: 74 },
});
