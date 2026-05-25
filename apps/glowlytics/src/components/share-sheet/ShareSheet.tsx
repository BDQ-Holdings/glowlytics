/**
 * ShareSheet — bottom modal that lets the user pick a share-card template,
 * choose an aspect ratio, and hand off to the native share sheet.
 *
 * Templates: Glow · Structure · Streak · Pattern · Arc (5 swipeable cards).
 * Aspects: Story (9:16) · Post (1:1) · X (16:9).
 *
 * The cards are rendered at a fixed base size per aspect, then captured
 * via `react-native-view-shot` and shipped to `expo-sharing` at the
 * authored resolution (1080×1920 / 1080×1080 / 1600×900).
 */

import React, { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type ViewToken,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { GlowIcon } from '../glow/GlowIcons';
import { FontFamily, Glow } from '../../constants/theme';
import { trackEvent } from '../../services/analytics';
import type { DayEntry } from '../day-story/dayModel';
import { GlowCard } from './cards/GlowCard';
import { StructureCard } from './cards/StructureCard';
import { StreakCard } from './cards/StreakCard';
import { PatternCard } from './cards/PatternCard';
import { ArcCard } from './cards/ArcCard';

const P = Glow.palette;

// ---------------------------------------------------------------------------
// Aspect ratios + templates
// ---------------------------------------------------------------------------

type AspectId = 'story' | 'post' | 'tweet';
type TemplateId = 'glow' | 'structure' | 'streak' | 'pattern' | 'arc';

interface AspectSpec {
  id: AspectId;
  label: string;
  ratio: string;
  /** Authored card width — the off-screen render target. */
  baseW: number;
  /** Authored card height. */
  baseH: number;
  /** Output PNG width (for the actual share asset). */
  outW: number;
  /** Output PNG height. */
  outH: number;
}

const ASPECTS: AspectSpec[] = [
  { id: 'story', label: 'Story', ratio: '9 : 16', baseW: 360, baseH: 640, outW: 1080, outH: 1920 },
  { id: 'post',  label: 'Post',  ratio: '1 : 1',  baseW: 360, baseH: 360, outW: 1080, outH: 1080 },
  { id: 'tweet', label: 'X',     ratio: '16 : 9', baseW: 480, baseH: 270, outW: 1600, outH: 900 },
];

const TEMPLATES: Array<{ id: TemplateId; label: string }> = [
  { id: 'glow',      label: 'Glow' },
  { id: 'structure', label: 'Face read' },
  { id: 'streak',    label: 'Streak' },
  { id: 'pattern',   label: 'Pattern' },
  { id: 'arc',       label: '14-day arc' },
];

// ---------------------------------------------------------------------------
// ShareSheet
// ---------------------------------------------------------------------------

export interface ShareSheetProps {
  visible: boolean;
  day: DayEntry | null;
  initialTemplate?: TemplateId;
  arcSeries?: number[];
  patternHeadline?: string;
  patternBody?: string;
  onClose: () => void;
}

export function ShareSheet({
  visible,
  day,
  initialTemplate = 'glow',
  arcSeries = [],
  patternHeadline,
  patternBody,
  onClose,
}: ShareSheetProps) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [aspect, setAspect] = useState<AspectId>('story');
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>(initialTemplate);
  const [exporting, setExporting] = useState(false);
  const listRef = useRef<FlatList<TemplateId> | null>(null);
  const cardRefs = useRef<Record<TemplateId, View | null>>({
    glow: null, structure: null, streak: null, pattern: null, arc: null,
  });

  // Reset on each open so the initial template + default aspect are honoured.
  React.useEffect(() => {
    if (visible) {
      setActiveTemplate(initialTemplate);
      setAspect('story');
      requestAnimationFrame(() => {
        const idx = TEMPLATES.findIndex((t) => t.id === initialTemplate);
        if (idx >= 0) {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        }
      });
    }
  }, [visible, initialTemplate]);

  const spec = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];

  // Carousel slot width — leaves ~16px gutter on either side of the card.
  const slotWidth = screenWidth - 32;
  // Fit the authored card into the slot while preserving aspect.
  const scale = Math.min(slotWidth / spec.baseW, 1);
  const slotHeight = Math.round(spec.baseH * scale) + 24;

  const renderCard: ListRenderItem<TemplateId> = ({ item }) => {
    const card = (
      <View
        ref={(ref) => { cardRefs.current[item] = ref; }}
        collapsable={false}
        style={[styles.cardAuthored, { width: spec.baseW, height: spec.baseH }]}
      >
        {renderTemplate(item, { day, arcSeries, patternHeadline, patternBody })}
      </View>
    );

    return (
      <View style={[styles.cardSlot, { width: slotWidth, height: slotHeight }]}>
        <View style={[styles.cardScale, { transform: [{ scale }] }]}>
          {card}
        </View>
      </View>
    );
  };

  const onViewableItemsChanged = useRef<(info: { viewableItems: ViewToken[] }) => void>(({ viewableItems }) => {
    const first = viewableItems[0];
    if (first?.item != null) setActiveTemplate(first.item as TemplateId);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const exportAndShare = async () => {
    if (!day) return;
    const ref = cardRefs.current[activeTemplate];
    if (!ref) return;

    setExporting(true);
    try {
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1.0,
        width: spec.outW,
        height: spec.outH,
        result: 'tmpfile',
      });
      trackEvent('share_sheet_export', {
        template: activeTemplate,
        aspect,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your glow',
          UTI: 'public.png',
        });
      }
    } catch (err) {
      trackEvent('share_sheet_export_failed', {
        template: activeTemplate,
        aspect,
        error: String((err as Error)?.message ?? err),
      });
    } finally {
      setExporting(false);
    }
  };

  if (!day) return null;

  return (
    <Modal
      visible={visible}
      // Full-screen presentation (not transparent + flex-end) so the sheet
      // owns every pixel — including the area behind the Dynamic Island,
      // which used to clip the title bar. We push the close button down past
      // the top safe-area inset and drop the redundant "Share your glow"
      // header (the action label below makes the intent obvious).
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      transparent={false}
    >
      <View style={[styles.fullSheet, { paddingTop: insets.top + 8 }]}>
        {/* Floating close affordance — sits below the Dynamic Island, no
            covered header text. */}
        <View style={styles.closeRow}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close share sheet"
            hitSlop={12}
            style={styles.closeBtn}
          >
            <GlowIcon name="x" size={20} color={P.ink} stroke={1.9} />
          </TouchableOpacity>
        </View>

        {/* Aspect picker — three pills at the top */}
        <View style={styles.aspectRow}>
          {ASPECTS.map((a) => {
            const active = a.id === aspect;
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => setAspect(a.id)}
                accessibilityRole="button"
                accessibilityLabel={`Aspect ${a.label}, ${a.ratio}`}
                style={[styles.aspectBtn, active && styles.aspectBtnActive]}
              >
                <Text style={[styles.aspectLabel, active && styles.aspectLabelActive]}>{a.label}</Text>
                <Text style={[styles.aspectRatio, active && styles.aspectRatioActive]}>{a.ratio}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Template carousel — swipe between card designs. flex: 1 so it
            takes all the vertical space the full-screen sheet now offers,
            instead of the fixed slot height the old bottom-sheet used. */}
        <View style={[styles.carouselWrap, { flex: 1, justifyContent: 'center' }]}>
          <FlatList
            ref={listRef}
            data={TEMPLATES.map((t) => t.id)}
            keyExtractor={(t) => t}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={renderCard}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            snapToInterval={slotWidth}
            decelerationRate="fast"
          />
        </View>

        <View style={styles.dots}>
          {TEMPLATES.map((t) => (
            <View
              key={t.id}
              style={[styles.dot, activeTemplate === t.id && styles.dotActive]}
            />
          ))}
        </View>

        <Text style={styles.templateLabel}>
          {TEMPLATES.find((t) => t.id === activeTemplate)?.label}
        </Text>

        {/* Share action — single button hands off to the native share sheet,
            which lets the user pick IG / X / Save / Copy / etc. */}
        <TouchableOpacity
          onPress={exportAndShare}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Share or save"
          style={[
            styles.shareBtn,
            { marginBottom: Math.max(insets.bottom, 16) },
            exporting && styles.shareBtnDisabled,
          ]}
        >
          {exporting ? (
            <ActivityIndicator color={P.surface} />
          ) : (
            <>
              <GlowIcon name="share" size={18} color={P.surface} stroke={1.7} />
              <Text style={styles.shareBtnText}>Share or save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Template dispatcher — keeps the ShareSheet itself agnostic about card shape
// ---------------------------------------------------------------------------

function renderTemplate(
  id: TemplateId,
  ctx: { day: DayEntry | null; arcSeries: number[]; patternHeadline?: string; patternBody?: string },
) {
  if (!ctx.day) return null;
  switch (id) {
    case 'glow':      return <GlowCard day={ctx.day} />;
    case 'structure': return <StructureCard day={ctx.day} />;
    case 'streak':    return <StreakCard day={ctx.day} />;
    case 'pattern':
      return (
        <PatternCard
          day={ctx.day}
          headline={ctx.patternHeadline ?? 'Your skin is finding its rhythm.'}
          body={ctx.patternBody ?? 'Three weeks in, evenness is up 11 points. Stay the course.'}
        />
      );
    case 'arc':       return <ArcCard day={ctx.day} arcSeries={ctx.arcSeries} />;
    default:          return null;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  fullSheet: {
    flex: 1,
    backgroundColor: P.bg,
    paddingHorizontal: 16,
  },
  closeRow: {
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aspectRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 16,
  },
  aspectBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: P.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.glow,
    alignItems: 'center',
  },
  aspectBtnActive: { borderColor: P.ink, borderWidth: 1.5 },
  aspectLabel: { fontFamily: FontFamily.sansBold, fontSize: 13, color: P.ink },
  aspectLabelActive: { color: P.ink },
  aspectRatio: { fontSize: 10, color: P.muted, marginTop: 2, fontFamily: FontFamily.sansMedium },
  aspectRatioActive: { color: P.muted },
  carouselWrap: { marginTop: 16 },
  cardSlot: { paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cardScale: { alignSelf: 'center' },
  cardAuthored: { backgroundColor: P.bg, borderRadius: 0, overflow: 'hidden' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: P.muted + '40' },
  dotActive: { backgroundColor: P.ink, width: 18 },
  templateLabel: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    color: P.muted,
    letterSpacing: 0.6,
  },
  shareBtn: {
    marginTop: 20,
    paddingVertical: 16,
    backgroundColor: P.ink,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: { fontFamily: FontFamily.sansBold, fontSize: 15, color: P.surface },
});
