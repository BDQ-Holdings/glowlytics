import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { FadeUp, GlowRing } from '../../src/components/glow/GlowPrimitives';
import {
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';

interface RitualItem {
  id: string;
  t: string;
  title: string;
  copy: string;
  done: boolean;
}

const DEFAULT_RITUAL: RitualItem[] = [
  { id: 'cleanse',  t: '7:00 AM', title: 'Gentle cleanse',         copy: 'Lukewarm water, no friction',        done: true },
  { id: 'serum',    t: '7:05 AM', title: 'Niacinamide + hydrate',  copy: '2 drops, press into damp skin',       done: true },
  { id: 'spf',      t: '7:10 AM', title: 'SPF 50',                 copy: 'Two finger lengths, neck included',   done: true },
  { id: 'water',    t: 'all day', title: 'Water, 8 glasses',       copy: '5 of 8 — keep going',                 done: false },
  { id: 'evening',  t: '9:30 PM', title: 'Retinoid (pea-sized)',   copy: 'Skip eye area, follow with moisturizer', done: false },
];

export default function RitualScreen() {
  const router = globalRouter;
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();
  const dailyRecords = useStore((s) => s.dailyRecords);

  const [items, setItems] = useState<RitualItem[]>(() => {
    // Only `sunscreen_used` lives on DailyRecord today; other steps stay
    // toggleable in-session until we add per-step tracking to daily check-ins.
    const latest = dailyRecords[dailyRecords.length - 1] as any;
    if (!latest) return DEFAULT_RITUAL;
    return DEFAULT_RITUAL.map((d) =>
      d.id === 'spf' ? { ...d, done: Boolean(latest?.sunscreen_used ?? d.done) } : d,
    );
  });

  const toggle = (id: string) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, done: !r.done } : r)));

  const done = useMemo(() => items.filter((r) => r.done).length, [items]);
  const total = items.length;
  const remaining = total - done;
  const pct = (done / total) * 100;

  const ringSummary =
    remaining === 0
      ? 'Complete.'
      : `${remaining} small thing${remaining > 1 ? 's' : ''} left.`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
          <Text style={[s.title, { color: palette.ink }]}>Today's ritual</Text>
        </View>
      </FadeUp>

      <FadeUp index={1}>
        <View style={s.heroOuter}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <GlowRing
              size={92}
              stroke={6}
              value={pct}
              color={palette.accent}
              track={palette.glow}
            >
              <Text style={[s.ringText, { color: palette.ink }]}>{done}/{total}</Text>
            </GlowRing>
            <View style={{ flex: 1, marginLeft: 18 }}>
              <Text style={[s.ringSummary, { color: palette.ink }]}>{ringSummary}</Text>
              <Text style={[s.ringDetail, { color: palette.muted }]}>
                No rush. The streak waits.
              </Text>
            </View>
          </LinearGradient>
        </View>
      </FadeUp>

      <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, gap: 8 }}>
        {items.map((r, i) => (
          <FadeUp key={r.id} index={Math.min(2 + i, 5)}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => toggle(r.id)}
              style={[
                s.item,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.glow,
                  opacity: r.done ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[
                  s.dot,
                  r.done
                    ? { backgroundColor: palette.accent, borderWidth: 0 }
                    : { borderColor: palette.muted, borderWidth: 1.5 },
                ]}
              >
                {r.done && <GlowIcon name="check" size={16} color={palette.surface} stroke={2} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    s.itemTitle,
                    { color: palette.ink },
                    r.done && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {r.title}
                </Text>
                <Text style={[s.itemCopy, { color: palette.muted }]}>{r.copy}</Text>
              </View>
              <Text style={[s.itemTime, { color: palette.muted }]}>{r.t}</Text>
            </TouchableOpacity>
          </FadeUp>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 24,
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringText: {
    fontFamily: FontFamily.sans,
    fontSize: 24,
  },
  ringSummary: {
    fontFamily: FontFamily.sans,
    fontSize: 22,
    lineHeight: 26,
  },
  ringDetail: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 6,
  },
  item: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
  itemCopy: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 2,
  },
  itemTime: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
