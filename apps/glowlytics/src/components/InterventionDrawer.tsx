/**
 * InterventionDrawer — three-tab card showing Lifestyle / Pharmacological /
 * Interventional suggestions. The Interventional tab carries an explicit
 * disclaimer in addition to the app-wide informational notice.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export const InterventionDrawer: React.FC<Props> = ({ bundle }) => {
  const [tab, setTab] = useState<BoneInterventionTier>('lifestyle');
  const items: BoneIntervention[] = bundle[tab] || [];

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = (bundle[t.key] || []).length;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityLabel={`${t.label} tab (${count} suggestions)`}
            >
              <Feather name={t.icon} size={14} color={active ? Glow.palette.accent : Colors.textMuted} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
                </View>
              )}
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
        {items.length === 0 ? (
          <Text style={styles.empty}>
            No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} suggestions for this scan.
          </Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
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
    borderRadius: BorderRadius.lg,
    backgroundColor: Glow.palette.bg,
  },
  tabActive: {
    backgroundColor: Glow.palette.glow,
  },
  tabLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
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
  badgeActive: {
    backgroundColor: Glow.palette.accent,
  },
  badgeText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
  },
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
  list: { maxHeight: 360 },
  listContent: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  empty: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  card: {
    backgroundColor: Glow.palette.bg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  cardBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
});
