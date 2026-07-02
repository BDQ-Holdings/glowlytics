/**
 * Today (Home) — the redesign hand-off:
 *
 * Today and Story merge into a single full-bleed swipeable "day" experience.
 * The top calendar strip lets the user jump between the last 14 days; each
 * page is a vertical story (massive score → italic verdict → facets →
 * facial structure → pattern → ritual → arc → share CTA).
 *
 * The mood selector, the separate Story tab, and the dashboard stack of
 * sections from the prior Today have all been retired here — see chat6 in
 * the design hand-off (`glowlytics/chats/chat6.md`).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayPager } from '../src/components/day-story/DayPager';
import { ShareSheet } from '../src/components/share-sheet/ShareSheet';
import { gateWithPaywall } from '../src/services/subscription';
import { Glow } from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { buildDayTimeline, type DayEntry } from '../src/components/day-story/dayModel';
import { resolveScanEntryRoute } from '../src/utils/scanConsentRoute';

const P = Glow.palette;

type ShareState = { day: DayEntry; template?: string } | null;

export default function Home() {
  const router = globalRouter;
  const insets = useSafeAreaInsets();
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const patterns = useStore((s) => s.patterns);
  const aiProcessingConsentGranted = useStore((s) => s.aiProcessingConsentGranted);
  const [share, setShare] = useState<ShareState>(null);

  const handleScan = useCallback(async () => {
    if (!(await gateWithPaywall())) return;
    router.push(resolveScanEntryRoute(aiProcessingConsentGranted) as never);
  }, [aiProcessingConsentGranted, router]);

  const handleOpenRitual = useCallback(() => {
    router.push('/ritual' as never);
  }, [router]);

  const handleShare = useCallback((day: DayEntry, template?: string) => {
    setShare({ day, template });
  }, []);

  const handleCloseShare = useCallback(() => setShare(null), []);

  // Same window the in-feed pager renders; passed to the ShareSheet so its
  // ArcCard reads from real user data rather than a placeholder.
  const arcSeries = useMemo(
    () => buildDayTimeline(dailyRecords, modelOutputs, 14)
      .filter((d) => d.score != null)
      .map((d) => d.score as number),
    [dailyRecords, modelOutputs],
  );

  // Pattern headline + body for the pattern share-card. Use the strongest
  // detected real pattern when available so the share asset is anchored to
  // the user's actual data, not a generic line.
  const featuredPattern = patterns?.find((p) => !p.isPredicted) ?? patterns?.[0] ?? null;

  return (
    <View style={[styles.host, { paddingTop: insets.top }]}>
      <DayPager
        onScan={handleScan}
        onOpenRitual={handleOpenRitual}
        onShare={handleShare}
      />
      <ShareSheet
        visible={!!share}
        day={share?.day ?? null}
        initialTemplate={(share?.template as never) ?? 'glow'}
        patternHeadline={featuredPattern?.insightText}
        patternBody={featuredPattern?.detailText}
        // Same 14-day window the in-feed pager builds — keeps the share
        // asset anchored to real data instead of a stub.
        arcSeries={arcSeries}
        onClose={handleCloseShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: P.bg,
  },
});
