import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { FadeUp, SectionHead } from '../../src/components/glow/GlowPrimitives';
import { FocusFade } from '../../src/components/FocusFade';
import {
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import { activeProducts } from '../../src/services/ritual';

let useUser: (() => { user: { firstName?: string | null; primaryEmailAddress?: { emailAddress?: string } } | null | undefined }) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clerk = require('@clerk/clerk-expo');
  useUser = clerk.useUser;
} catch {
  // Clerk not available
}

interface MeStat {
  label: string;
  value: string | number;
}

interface MeGoal {
  label: string;
  target: string;
  progress: number; // 0-100
}

const SETTINGS_ROWS = [
  { key: 'all',           label: 'All settings',           route: '/settings' as const },
  { key: 'skin',          label: 'Skin profile',           route: '/settings/skin-profile' as const },
  { key: 'notifications', label: 'Notifications',          route: '/settings/notifications' as const },
  { key: 'camera',        label: 'Camera & photos',        route: '/settings/camera' as const },
  { key: 'privacy',       label: 'Privacy & data',         route: '/settings/privacy' as const },
  { key: 'appearance',    label: 'Appearance',             route: '/settings/appearance' as const },
  { key: 'export',        label: 'Export your data',       route: '/settings/export' as const },
  { key: 'help',          label: 'Help & feedback',        route: '/settings/help' as const },
];

export default function MeTab() {
  const router = useRouter();
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();

  const user = useStore((s) => s.user);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const allProducts = useStore((s) => s.products);
  const products = useMemo(() => activeProducts(allProducts), [allProducts]);
  const modelOutputs = useStore((s) => s.modelOutputs);
  // Future: surface user-defined goals from store; the redesign falls back to
  // sensible defaults derived from streak + onboarding data when none exist.
  const goals: Array<{ title?: string; label?: string; target?: string; subtitle?: string; progress?: number }> = [];
  const getStreak = useStore((s) => s.getStreak);
  const streak = useMemo(() => getStreak(), [dailyRecords, getStreak]);

  const clerkUser = useUser ? useUser() : null;
  const firstName = clerkUser?.user?.firstName ?? '';
  const email = clerkUser?.user?.primaryEmailAddress?.emailAddress;
  const initial = (firstName || email || 'You').charAt(0).toUpperCase();

  const memberSince = useMemo(() => {
    const created = (user as any)?.created_at;
    if (!created) return null;
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [user]);

  const glowGained = useMemo(() => {
    if (modelOutputs.length < 2) return 0;
    const baseline = modelOutputs[0];
    const latest = modelOutputs[modelOutputs.length - 1];
    const baseInsight = buildOverallSkinInsight({
      latestOutput: baseline,
      baselineOutput: baseline,
      latestDaily: getLatestDailyForOutput(baseline, dailyRecords),
      baselineDaily: getLatestDailyForOutput(baseline, dailyRecords),
      serverSignalScores: baseline.signal_scores,
      serverSignalFeatures: baseline.signal_features,
      serverSignalConfidence: baseline.signal_confidence,
      serverLesions: baseline.lesions,
    });
    const latestInsight = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily: getLatestDailyForOutput(latest, dailyRecords),
      baselineDaily: getLatestDailyForOutput(baseline, dailyRecords),
      serverSignalScores: latest.signal_scores,
      serverSignalFeatures: latest.signal_features,
      serverSignalConfidence: latest.signal_confidence,
      serverLesions: latest.lesions,
    });
    return Math.round((latestInsight?.score ?? 0) - (baseInsight?.score ?? 0));
  }, [modelOutputs, dailyRecords]);

  const stats: MeStat[] = [
    { label: 'Day streak', value: streak },
    { label: 'Check-ins', value: modelOutputs.length },
    { label: 'Glow gained', value: `${glowGained >= 0 ? '+' : ''}${glowGained}` },
  ];

  const meGoals: MeGoal[] = useMemo(() => {
    if (!goals || goals.length === 0) {
      // Derive real progress from the user's data — no hardcoded percentages.
      // Each goal advertises the metric driving its bar so it's transparent
      // what the user is being measured on.

      // 1. Daily check-in: streak vs 30-day target.
      const checkInProgress = Math.min(100, (streak / 30) * 100);

      // 2. Build your shelf: 3 products in the user's catalogue.
      const shelfProgress = Math.min(100, (products.length / 3) * 100);

      // 3. Calm baseline: % of the last 7 scans with inflammation ≥ 70.
      // Aligns with the 100=optimal convention so high values = calm skin.
      const lastSeven = modelOutputs.slice(-7);
      const calmCount = lastSeven.filter((o) => {
        const v = o.signal_scores?.inflammation;
        return Number.isFinite(v) && (v as number) >= 70;
      }).length;
      const calmProgress = lastSeven.length === 0
        ? 0
        : Math.min(100, (calmCount / Math.min(7, lastSeven.length)) * 100);

      return [
        { label: 'Daily check-in',   target: '30 days in a row',         progress: checkInProgress },
        { label: 'Build your shelf', target: 'Three core products',      progress: shelfProgress },
        { label: 'Calm baseline',    target: 'Steady redness for a week', progress: calmProgress },
      ];
    }
    return goals.slice(0, 3).map((g: any) => ({
      label: g.title || g.label || 'Goal',
      target: g.target || g.subtitle || '',
      progress: Math.max(0, Math.min(100, g.progress ?? 0)),
    }));
  }, [goals, streak, products.length, modelOutputs]);

  return (
    <FocusFade>
      <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.header}>
          <LinearGradient
            colors={[palette.accent, palette.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.avatar}
          >
            <Text style={[s.avatarText, { color: palette.surface }]}>{initial}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: palette.ink }]}>
              {firstName || 'Welcome'}
            </Text>
            <Text style={[s.subtitle, { color: palette.muted }]}>
              {memberSince ? `Member since ${memberSince}` : email || 'Glowlytics member'}
            </Text>
          </View>
        </View>
      </FadeUp>

      <FadeUp index={1}>
        <View style={[s.statsRow]}>
          {stats.map((st) => (
            <View
              key={st.label}
              style={[s.statCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
            >
              <Text style={[s.statValue, { color: palette.ink }]}>{st.value}</Text>
              <Text style={[s.statLabel, { color: palette.muted }]}>
                {st.label.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </FadeUp>

      <FadeUp index={2}>
        <View style={s.section}>
          <SectionHead
            title="Your goals"
            hint={`${meGoals.length} active`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={{ marginTop: 12, gap: 8 }}>
            {meGoals.map((g, i) => (
              <View
                key={i}
                style={[s.goalCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
              >
                <View style={s.goalTopRow}>
                  <Text style={[s.goalLabel, { color: palette.ink }]}>{g.label}</Text>
                  <Text style={[s.goalProgress, { color: palette.accent }]}>
                    {Math.round(g.progress)}%
                  </Text>
                </View>
                {!!g.target && (
                  <Text style={[s.goalTarget, { color: palette.muted }]}>{g.target}</Text>
                )}
                <View style={[s.goalTrack, { backgroundColor: palette.bg }]}>
                  <View
                    style={{
                      height: '100%',
                      width: `${g.progress}%`,
                      backgroundColor: palette.accent,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </FadeUp>

      <FadeUp index={3}>
        <View style={s.section}>
          <SectionHead
            title="Settings"
            hint=""
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={[s.settingsCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
            {SETTINGS_ROWS.map((row, i) => (
              <TouchableOpacity
                key={row.key}
                activeOpacity={0.7}
                onPress={() => router.push(row.route as any)}
                style={[
                  s.settingsRow,
                  i < SETTINGS_ROWS.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.bg },
                ]}
              >
                <Text style={[s.settingsLabel, { color: palette.ink }]}>{row.label}</Text>
                <GlowIcon name="chevron" size={14} color={palette.muted} stroke={1.6} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </FadeUp>
    </ScrollView>
    </FocusFade>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
  },
  name: {
    fontFamily: FontFamily.sans,
    fontSize: 28,
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    marginTop: 2,
  },
  statsRow: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.sans,
    fontSize: 26,
  },
  statLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  goalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  goalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  goalProgress: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
  },
  goalTarget: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 4,
  },
  goalTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  settingsCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
  },
});
