import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Chip,
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

const SKIN_TYPES = ['Dry', 'Normal', 'Combination', 'Oily', 'Not sure'];
const SENSITIVITY_OPTIONS = [
  'Fragrance',
  'Alcohol',
  'Essential oils',
  'Salicylic acid',
  'Retinoids',
  'Mineral SPF',
];

const DEFAULT_CONCERNS = [
  { id: 'redness',  label: 'Redness around cheeks', body: 'Persistent · since teens' },
  { id: 'tone',     label: 'Uneven tone',           body: 'Sun spots, T-zone' },
  { id: 'texture',  label: 'Texture',                body: 'Forehead, chin' },
  { id: 'dryness',  label: 'Dryness around eyes',    body: 'Winter only' },
];

export default function SkinProfileScreen() {
  const [skinType, setSkinType] = useState('Combination');
  const [sensitivities, setSensitivities] = useState<Set<string>>(
    new Set(['Fragrance', 'Essential oils']),
  );
  const [concerns] = useState(DEFAULT_CONCERNS);

  const toggleSensitivity = (value: string) => {
    setSensitivities((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Skin profile" />

      <Intro>
        We tune what we look for to your skin.{' '}
        <IntroAccent>Honest answers help.</IntroAccent>
      </Intro>

      <SectionLabel>Type</SectionLabel>
      <View style={styles.chipWrap}>
        {SKIN_TYPES.map((t) => (
          <Chip key={t} active={skinType === t} onPress={() => setSkinType(t)}>
            {t}
          </Chip>
        ))}
      </View>

      <SectionLabel>Sensitivities</SectionLabel>
      <View style={styles.chipWrap}>
        {SENSITIVITY_OPTIONS.map((s) => (
          <Chip key={s} active={sensitivities.has(s)} onPress={() => toggleSensitivity(s)}>
            {s}
          </Chip>
        ))}
      </View>

      <SectionLabel>Concerns · ranked</SectionLabel>
      <View style={styles.concernsCard}>
        {concerns.map((c, i) => (
          <View
            key={c.id}
            style={[styles.concernRow, i < concerns.length - 1 && styles.concernDivider]}
          >
            <View style={styles.rankBubble}>
              <Text style={styles.rankNum}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.concernLabel}>{c.label}</Text>
              <Text style={styles.concernBody}>{c.body}</Text>
            </View>
            <Feather name="menu" size={14} color={P.muted} />
          </View>
        ))}
      </View>

      <SectionLabel>Environment · auto</SectionLabel>
      <ListGroup>
        <Row label="Climate"      value="Cold · dry"  sub="Brooklyn · May" />
        <Row label="Sun exposure" value="Low" />
        <Row label="Water"        value="Soft" />
      </ListGroup>

      <View style={styles.footer}>
        <PrimaryButton label="Save changes" />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  concernsCard: {
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 6,
  },
  concernRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  concernDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.glow,
  },
  rankBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 11,
    color: P.ink,
  },
  concernLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: P.ink,
  },
  concernBody: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 1,
  },
  footer: {
    padding: Spacing.lg,
  },
});
