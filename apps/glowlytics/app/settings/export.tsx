import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Intro,
  IntroAccent,
  ListGroup,
  PrimaryButton,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

type ExportItem = {
  id: string;
  label: string;
  sub: string;
  size: string;
  defaultOn: boolean;
};

const ITEMS: ExportItem[] = [
  { id: 'scans',    label: 'Scan history',       sub: '47 reads · CSV',          size: '38 KB',  defaultOn: true },
  { id: 'patterns', label: 'Patterns + insights', sub: 'What we found · JSON',    size: '4 KB',   defaultOn: true },
  { id: 'products', label: 'Product shelf',       sub: '5 items + impact · CSV',  size: '6 KB',   defaultOn: true },
  { id: 'mood',     label: 'Mood + ritual logs',  sub: 'Daily check-offs · CSV',  size: '18 KB',  defaultOn: false },
  { id: 'photos',   label: 'Photos (originals)',  sub: '47 captures · ZIP',        size: '124 MB', defaultOn: false },
];

const FORMATS: Array<{ id: 'pdf' | 'raw' | 'md'; l: string; sub: string }> = [
  { id: 'pdf', l: 'PDF book', sub: 'Pretty' },
  { id: 'raw', l: 'Raw files', sub: 'CSV + JSON' },
  { id: 'md',  l: 'Markdown',  sub: 'For Obsidian' },
];

export default function ExportScreen() {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(ITEMS.filter((i) => i.defaultOn).map((i) => i.id)),
  );
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('pdf');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SettingsPage>
      <SettingsHeader title="Export your data" />
      <Intro>
        Take everything with you, anytime. <IntroAccent>It's yours.</IntroAccent>
      </Intro>

      <SectionLabel>What to include</SectionLabel>
      <View style={styles.list}>
        {ITEMS.map((it) => {
          const on = selected.has(it.id);
          return (
            <Pressable
              key={it.id}
              onPress={() => toggle(it.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.85 }]}
            >
              <View
                style={[
                  styles.checkbox,
                  on
                    ? { backgroundColor: P.ink, borderColor: P.ink }
                    : { borderColor: P.muted, backgroundColor: 'transparent' },
                ]}
              >
                {on && <Feather name="check" size={12} color={P.surface} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemLabel}>{it.label}</Text>
                <Text style={styles.itemSub}>{it.sub}</Text>
              </View>
              <Text style={styles.itemSize}>{it.size}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Format</SectionLabel>
      <View style={styles.formatRow}>
        {FORMATS.map((f) => {
          const active = format === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFormat(f.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.formatCard,
                active ? styles.formatCardActive : styles.formatCardIdle,
              ]}
            >
              <Text style={[styles.formatLabel, active && styles.formatLabelActive]}>
                {f.l}
              </Text>
              <Text style={[styles.formatSub, active && styles.formatSubActive]}>
                {f.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Deliver to</SectionLabel>
      <ListGroup>
        <Row label="Email" value="you@email.com" />
        <Row label="iCloud Drive" value="/Glowlytics" />
      </ListGroup>

      <View style={styles.footer}>
        <PrimaryButton label="Request export · ~24h" />
        <Text style={styles.footnote}>We'll send a one-time download link.</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    gap: 6,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    color: P.ink,
  },
  itemSub: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },
  itemSize: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    letterSpacing: 0.3,
  },
  formatRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  formatCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  formatCardActive: {
    backgroundColor: P.ink,
  },
  formatCardIdle: {
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
  },
  formatLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    color: P.ink,
  },
  formatLabelActive: { color: P.surface },
  formatSub: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    marginTop: 2,
  },
  formatSubActive: { color: P.surface, opacity: 0.7 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: 8,
  },
  footnote: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    textAlign: 'center',
  },
});
