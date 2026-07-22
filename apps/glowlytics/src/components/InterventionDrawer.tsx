/**
 * InterventionDrawer — three-tab card showing Lifestyle / Pharmacological /
 * Interventional suggestions. The Interventional tab carries an explicit
 * disclaimer in addition to the app-wide informational notice.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';
import type { BoneIntervention, BoneInterventionTier, InterventionBundle } from '../types';

interface Props {
  bundle: InterventionBundle;
}

const TABS: { key: BoneInterventionTier; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'lifestyle',       label: 'Lifestyle',       icon: 'sun' },
  { key: 'pharmacological', label: 'Pharma',          icon: 'droplet' },
  { key: 'interventional',  label: 'Procedural',      icon: 'activity' },
];

const CLINICAL_SOURCES = [
  {
    label: 'AAD Sunscreen Guidance',
    url: 'https://www.aad.org/public/skin-hair-nails/skin-care/sunscreen/choosing-the-right-sunscreen',
  },
  {
    label: 'American Academy of Dermatology',
    url: 'https://www.aad.org/public/diseases/acne/derm-treat/treat',
  },
  {
    label: 'American Society of Plastic Surgeons',
    url: 'https://www.plasticsurgery.org/cosmetic-procedures',
  },
] satisfies Array<{ label: string; url: string }>;

export const InterventionDrawer: React.FC<Props> = ({ bundle }) => {
  const firstNonEmptyTab = useMemo(
    () => TABS.find((t) => (bundle[t.key] || []).length > 0)?.key ?? null,
    [bundle],
  );
  const [tab, setTab] = useState<BoneInterventionTier>(firstNonEmptyTab ?? 'lifestyle');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, true>>({});
  const items: BoneIntervention[] = bundle[tab] || [];

  useEffect(() => {
    if (firstNonEmptyTab && (bundle[tab] || []).length === 0) setTab(firstNonEmptyTab);
  }, [bundle, firstNonEmptyTab, tab]);

  if (!firstNonEmptyTab) {
    return (
      <View style={[styles.wrap, styles.emptyWrap]}>
        <Text style={styles.emptyCompact}>No suggestions for this scan.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = (bundle[t.key] || []).length;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                if (count > 0) setTab(t.key);
              }}
              disabled={count === 0}
              style={({ pressed }) => [styles.tab, count === 0 && styles.tabDisabled, active && styles.tabActive, pressed && count > 0 && styles.tabPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: count === 0 }}
              accessibilityLabel={`${t.label} tab (${count} suggestions)`}
            >
              <Feather name={t.icon} size={14} color={active ? Glow.palette.accent : Colors.textMuted} />
              <Text style={[styles.tabLabel, count === 0 && styles.tabLabelDisabled, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              <View style={[styles.badge, count === 0 && styles.badgeEmpty, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, count === 0 && styles.badgeTextEmpty, active && styles.badgeTextActive]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {tab === 'interventional' && bundle.procedural_disclaimer ? (
        <View style={styles.disclaimer}>
          <Feather name="alert-triangle" size={14} color={Colors.warning} />
          <Text style={styles.disclaimerText}>{bundle.procedural_disclaimer}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {items.map((item) => {
          const expanded = Boolean(expandedRows[item.id]);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} suggestion: ${item.title}`}
              onPress={() => setExpandedRows((rows) => {
                if (!expanded) return { ...rows, [item.id]: true };
                const next = { ...rows };
                delete next[item.id];
                return next;
              })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </View>
              <Text style={styles.cardBody} numberOfLines={expanded ? undefined : 2}>{item.body}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sourcesCard}>
        <Pressable
          onPress={() => setSourcesOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: sourcesOpen }}
          accessibilityLabel={`Clinical sources, ${CLINICAL_SOURCES.length} references. ${sourcesOpen ? 'Expanded' : 'Collapsed'}.`}
          style={styles.sourcesSummary}
        >
          <Text style={styles.sourcesTitle}>Sources ({CLINICAL_SOURCES.length})</Text>
          <Feather name={sourcesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </Pressable>
        {sourcesOpen ? (
          <View style={styles.sourcesList}>
            {CLINICAL_SOURCES.map((source) => (
              <Pressable
                key={source.url}
                accessibilityRole="link"
                accessibilityLabel={`Open source: ${source.label}`}
                onPress={() => Linking.openURL(source.url).catch(() => {})}
                style={styles.sourceRow}
              >
                <Text style={styles.sourceLabel}>{source.label}</Text>
                <Text style={styles.sourceLink}>Open source</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  emptyWrap: {
    paddingVertical: Spacing.md,
  },
  emptyCompact: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: Glow.palette.bg,
  },
  tabDisabled: {
    opacity: 0.48,
  },
  tabPressed: {
    opacity: 0.82,
  },
  tabActive: {
    backgroundColor: Glow.palette.glow,
  },
  tabLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  tabLabelDisabled: {
    color: Colors.textDim,
  },
  tabLabelActive: {
    color: Glow.palette.accent,
  },
  badge: {
    minWidth: 18,
    paddingHorizontal: 4,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textDim,
  },
  badgeEmpty: {
    backgroundColor: Colors.surfaceHighlight,
  },
  badgeActive: {
    backgroundColor: Glow.palette.accent,
  },
  badgeText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
  },
  badgeTextEmpty: { color: Colors.textDim },
  badgeTextActive: { color: Colors.background },
  disclaimer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.warning + '14',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.warning + '33',
  },
  disclaimerText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  list: { maxHeight: 260 },
  listContent: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  card: {
    backgroundColor: Glow.palette.bg,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xxs,
    minHeight: 44,
  },
  cardPressed: {
    opacity: 0.86,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  cardBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  sourcesCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  sourcesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sourcesList: {
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  sourcesTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  sourceRow: {
    paddingTop: Spacing.xs,
    minHeight: 44,
    gap: 2,
  },
  sourceLabel: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  sourceLink: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textDecorationLine: 'underline',
  },
});
