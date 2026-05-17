import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow } from '../../src/constants/theme';
import {
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
  Toggle,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

type PaletteOption = {
  id: 'dusk' | 'meadow' | 'rose' | 'auto';
  name: string;
  swatches: [string, string, string];
  note?: string;
};

const PALETTES: PaletteOption[] = [
  { id: 'dusk',   name: 'Dusk',   swatches: ['#F5EFE8', '#5A3A5E', '#D9A28B'] },
  { id: 'meadow', name: 'Meadow', swatches: ['#EEF1EA', '#3D6B52', '#C9B786'] },
  { id: 'rose',   name: 'Rose',   swatches: ['#F6ECEB', '#A14A55', '#E0B8A6'] },
  { id: 'auto',   name: 'Auto',   swatches: ['#F5EFE8', '#EEF1EA', '#F6ECEB'], note: 'Sunrise shift' },
];

const MODES = ['Light', 'Dark', 'Auto'] as const;

export default function AppearanceScreen() {
  const [palette, setPalette] = useState<PaletteOption['id']>('dusk');
  const [mode, setMode] = useState<(typeof MODES)[number]>('Light');
  const [serifItalics, setSerifItalics] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [iconIndex, setIconIndex] = useState(0);
  const [textSize, setTextSize] = useState(0.4);

  return (
    <SettingsPage>
      <SettingsHeader title="Appearance" />

      <SectionLabel>Palette</SectionLabel>
      <View style={styles.paletteGrid}>
        {PALETTES.map((p) => {
          const active = palette === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPalette(p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.paletteCard,
                { borderColor: active ? P.ink : P.glow, borderWidth: active ? 1.5 : 1 },
              ]}
            >
              <View style={styles.swatchRow}>
                {p.swatches.map((c, i) => (
                  <View key={i} style={[styles.swatch, { backgroundColor: c }]} />
                ))}
              </View>
              <View style={styles.paletteFoot}>
                <Text style={styles.paletteName}>{p.name}</Text>
                {active && (
                  <View style={styles.activeDot}>
                    <Feather name="check" size={10} color={P.surface} />
                  </View>
                )}
              </View>
              {!!p.note && <Text style={styles.paletteNote}>{p.note}</Text>}
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Mode</SectionLabel>
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
            >
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Text</SectionLabel>
      <ListGroup>
        <Row
          label="Text size"
          control={
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabelSmall}>A</Text>
              <View style={styles.sliderTrack}>
                <View
                  style={[styles.sliderFill, { width: `${textSize * 100}%` }]}
                />
                <Pressable
                  onPress={() =>
                    setTextSize((prev) => (prev >= 1 ? 0 : Math.min(1, prev + 0.2)))
                  }
                  hitSlop={10}
                  style={[styles.sliderThumb, { left: `${textSize * 100}%` }]}
                />
              </View>
              <Text style={styles.sliderLabelLarge}>A</Text>
            </View>
          }
        />
        <Row
          label="Serif italics"
          sub="The little flourish on accents"
          control={<Toggle on={serifItalics} onChange={setSerifItalics} />}
        />
        <Row
          label="Reduce motion"
          sub="Slower fades, fewer halos"
          control={<Toggle on={reduceMotion} onChange={setReduceMotion} />}
        />
      </ListGroup>

      <SectionLabel>App icon</SectionLabel>
      <View style={styles.iconRow}>
        {[
          { bg: [P.accent, P.accent2], textColor: 'white' },
          { bg: [P.ink, P.ink], textColor: 'white' },
          { bg: [P.glow, P.surface], textColor: P.ink },
          { bg: [P.surface, P.surface], textColor: P.ink, border: true },
        ].map((opt, i) => {
          const active = iconIndex === i;
          return (
            <Pressable
              key={i}
              onPress={() => setIconIndex(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.iconTile,
                opt.border && styles.iconTileBordered,
                active && styles.iconTileActive,
                { backgroundColor: opt.bg[0] },
              ]}
            >
              <Text style={[styles.iconGlyph, { color: opt.textColor }]}>g</Text>
            </Pressable>
          );
        })}
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  paletteGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paletteCard: {
    width: '47.5%',
    backgroundColor: P.surface,
    borderRadius: 18,
    padding: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  swatch: { flex: 1 },
  paletteFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  paletteName: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    color: P.ink,
  },
  activeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: P.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteNote: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    marginTop: 2,
  },
  modeRow: {
    marginHorizontal: 16,
    flexDirection: 'row',
    gap: 2,
    backgroundColor: P.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.glow,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: P.ink,
  },
  modeLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: P.ink,
  },
  modeLabelActive: {
    color: P.surface,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderLabelSmall: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
  },
  sliderLabelLarge: {
    fontFamily: FontFamily.sans,
    fontSize: 16,
    color: P.muted,
  },
  sliderTrack: {
    width: 90,
    height: 4,
    backgroundColor: P.bg,
    borderRadius: 999,
    justifyContent: 'center',
  },
  sliderFill: {
    height: 4,
    backgroundColor: P.accent,
    borderRadius: 999,
  },
  sliderThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'white',
    marginLeft: -8,
    top: -6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  iconRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileBordered: {
    borderWidth: 1,
    borderColor: P.ink,
  },
  iconTileActive: {
    borderWidth: 2,
    borderColor: P.ink,
  },
  iconGlyph: {
    fontFamily: FontFamily.accent,
    fontSize: 26,
  },
});
