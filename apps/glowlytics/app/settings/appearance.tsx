import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { useStore } from '../../src/store/useStore';
import { supportsAlternateAppIcon } from '../../src/services/appearance';
import type {
  AppearanceIconKey,
  AppearanceMode,
  AppearancePaletteId,
} from '../../src/types';

const P = Glow.palette;

// ---------------------------------------------------------------------------
// Static option metadata
// ---------------------------------------------------------------------------

interface PaletteOption {
  id: AppearancePaletteId;
  name: string;
  swatches: [string, string, string];
  note?: string;
}

const PALETTES: PaletteOption[] = [
  { id: 'dusk',   name: 'Dusk',   swatches: ['#F5EFE8', '#5A3A5E', '#D9A28B'] },
  { id: 'meadow', name: 'Meadow', swatches: ['#EEF1EA', '#3D6B52', '#C9B786'] },
  { id: 'rose',   name: 'Rose',   swatches: ['#F6ECEB', '#A14A55', '#E0B8A6'] },
  { id: 'auto',   name: 'Auto',   swatches: ['#F5EFE8', '#EEF1EA', '#F6ECEB'], note: 'Sunrise shift' },
];

const MODES: Array<{ id: AppearanceMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark',  label: 'Dark' },
  { id: 'auto',  label: 'Auto' },
];

interface IconOption {
  id: AppearanceIconKey;
  label: string;
  source: number;
}

// `require` is hoisted statically so Metro bundles the assets at build time.
// Each icon ships at 1024×1024 — we let RN downsample for the picker tile.
const ICON_OPTIONS: IconOption[] = [
  { id: 'og-dusk',     label: 'Dusk',      source: require('../../assets/app-icons/og-dusk.png') },
  { id: 'og-sunset',   label: 'Sunset',    source: require('../../assets/app-icons/og-sunset.png') },
  { id: 'og-meadow',   label: 'Meadow',    source: require('../../assets/app-icons/og-meadow.png') },
  { id: 'og-rose',     label: 'Rose',      source: require('../../assets/app-icons/og-rose.png') },
  { id: 'og-plum',     label: 'Plum',      source: require('../../assets/app-icons/og-plum.png') },
  { id: 'lowercase-g', label: 'Lowercase', source: require('../../assets/app-icons/lowercase-g.png') },
  { id: 'cursive-g',   label: 'Cursive',   source: require('../../assets/app-icons/cursive-g.png') },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AppearanceScreen() {
  const appearance = useStore((s) => s.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  // iOS-only feature. Checked once; the underlying device capability doesn't
  // change at runtime.
  const iconSwapSupported = useMemo(() => supportsAlternateAppIcon(), []);

  return (
    <SettingsPage>
      <SettingsHeader title="Appearance" />

      <SectionLabel>Palette</SectionLabel>
      <View style={styles.paletteGrid}>
        {PALETTES.map((p) => {
          const active = appearance.palette === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setAppearance({ palette: p.id })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p.name} palette${active ? ', selected' : ''}`}
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
          const active = appearance.mode === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => setAppearance({ mode: m.id })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${m.label} mode${active ? ', selected' : ''}`}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
            >
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{m.label}</Text>
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
                  style={[styles.sliderFill, { width: `${appearance.textSize * 100}%` }]}
                />
                <Pressable
                  onPress={() => {
                    const next = appearance.textSize >= 1
                      ? 0
                      : Math.min(1, Math.round((appearance.textSize + 0.2) * 10) / 10);
                    setAppearance({ textSize: next });
                  }}
                  hitSlop={10}
                  accessibilityRole="adjustable"
                  accessibilityLabel="Text size"
                  accessibilityValue={{ now: Math.round(appearance.textSize * 100), min: 0, max: 100 }}
                  style={[styles.sliderThumb, { left: `${appearance.textSize * 100}%` }]}
                />
              </View>
              <Text style={styles.sliderLabelLarge}>A</Text>
            </View>
          }
        />
        <Row
          label="Serif italics"
          sub="The little flourish on accents"
          control={
            <Toggle
              on={appearance.serifItalics}
              onChange={(v) => setAppearance({ serifItalics: v })}
            />
          }
        />
        <Row
          label="Reduce motion"
          sub="Slower fades, fewer halos"
          control={
            <Toggle
              on={appearance.reduceMotion}
              onChange={(v) => setAppearance({ reduceMotion: v })}
            />
          }
        />
      </ListGroup>

      <SectionLabel>App icon</SectionLabel>
      {!iconSwapSupported && (
        <Text style={styles.iconUnsupportedNote}>
          Switching the home-screen icon needs iOS 10.3+ on a real device. Your
          choice is saved and will apply on the next compatible build.
        </Text>
      )}
      <View style={styles.iconGrid}>
        {ICON_OPTIONS.map((opt) => {
          const active = appearance.icon === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setAppearance({ icon: opt.id })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.label} app icon${active ? ', selected' : ''}`}
              style={styles.iconCell}
            >
              <View
                style={[
                  styles.iconTileWrap,
                  active && styles.iconTileWrapActive,
                ]}
              >
                <Image source={opt.source} style={styles.iconTileImage} />
                {active && (
                  <View style={styles.iconActiveDot}>
                    <Feather name="check" size={11} color={P.surface} />
                  </View>
                )}
              </View>
              <Text style={[styles.iconLabel, active && styles.iconLabelActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SettingsPage>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ICON_TILE = 60;

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
  iconUnsupportedNote: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    lineHeight: 16,
  },
  iconGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 14,
  },
  iconCell: {
    alignItems: 'center',
    width: ICON_TILE + 4,
  },
  iconTileWrap: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: 14,
    overflow: 'hidden',
    // iOS-style subtle border so the cream icons still have a contour.
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    position: 'relative',
  },
  iconTileWrapActive: {
    borderWidth: 2,
    borderColor: P.ink,
  },
  iconTileImage: {
    width: '100%',
    height: '100%',
  },
  iconActiveDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: P.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: {
    marginTop: 6,
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
  },
  iconLabelActive: {
    color: P.ink,
  },
});
