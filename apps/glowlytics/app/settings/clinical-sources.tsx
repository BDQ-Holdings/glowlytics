import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { MEDICAL_SOURCE_MATCHERS } from '../../src/constants/externalLinks';

const P = Glow.palette;

const DESCRIPTIONS: Record<string, string> = {
  'American Academy of Dermatology':
    'Acne treatment guidelines from the leading U.S. dermatology body.',
  'AAD Sunscreen Guidance':
    'How to pick and apply broad-spectrum sunscreen for daily protection.',
  'American College of Obstetricians and Gynecologists':
    'Reference on the menstrual cycle and hormonal context for skin shifts.',
  'ACOG Skin Guidance During Pregnancy':
    'Pregnancy-safe skin care, including which ingredients to avoid.',
  'World Health Organization UV Index Guidance':
    'Global guidance on UV exposure, the UV Index, and sun safety.',
};

const SOURCES = MEDICAL_SOURCE_MATCHERS.map(({ label, url }) => ({
  label,
  url,
  description: DESCRIPTIONS[label] ?? '',
}));

export default function ClinicalSourcesScreen() {
  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Clinical sources" eyebrow="Evidence" />

      <Text style={styles.intro}>
        Glowlytics recommendations are informed by public clinical guidance. Tap any source
        to read the original guideline.
      </Text>

      <SectionLabel>References</SectionLabel>
      <View style={styles.stack}>
        {SOURCES.map((source) => (
          <Pressable
            key={source.label}
            onPress={() => openUrl(source.url)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            accessibilityRole="link"
            accessibilityLabel={`Open source: ${source.label}`}
          >
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>{source.label}</Text>
              {!!source.description && (
                <Text style={styles.cardDescription}>{source.description}</Text>
              )}
            </View>
            <Feather name="external-link" size={16} color={P.muted} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        These sources inform Glowlytics insights but are not a substitute for professional
        medical advice. Always consult a qualified dermatologist for diagnosis.
      </Text>

      <View style={{ height: Spacing.xl }} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    color: P.muted,
  },
  stack: {
    marginHorizontal: 16,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 16,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: P.ink,
  },
  cardDescription: {
    marginTop: 4,
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    color: P.muted,
  },
  disclaimer: {
    marginHorizontal: 16,
    marginTop: 18,
    fontFamily: FontFamily.sans,
    fontSize: 11,
    lineHeight: 17,
    color: P.muted,
    fontStyle: 'italic',
  },
});
