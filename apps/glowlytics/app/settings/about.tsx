import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { FontFamily, Glow } from '../../src/constants/theme';
import {
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { APPLE_STANDARD_EULA_URL } from '../../src/constants/externalLinks';

const P = Glow.palette;

export default function AboutScreen() {
  const router = useRouter();
  const version = (Constants.expoConfig?.version as string | undefined) ?? '1.2.0';
  const build =
    (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    '19';

  return (
    <SettingsPage>
      <SettingsHeader title="About" />

      <View style={styles.brand}>
        <LinearGradient
          colors={[P.accent, P.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoTile}
        >
          <Text style={styles.logoGlyph}>g</Text>
        </LinearGradient>
        <Text style={styles.wordmark}>Glowlytics</Text>
        <Text style={styles.versionLine}>
          Version {version} · build {build}
        </Text>
        <Text style={styles.madeIn}>Made in Brooklyn, with care</Text>
      </View>

      <SectionLabel>The why</SectionLabel>
      <View style={styles.whyCard}>
        <Text style={styles.whyQuote}>
          "A camera that knows your face, instead of judging it."
        </Text>
        <Text style={styles.whyBody}>
          We started Glowlytics because most skin apps were either dermatology dressed
          in lifestyle clothes, or beauty filters pretending to be science. We wanted
          something quieter.
        </Text>
      </View>

      <SectionLabel>Legal</SectionLabel>
      <ListGroup>
        <Row
          label="Terms of service"
          onPress={() => Linking.openURL(APPLE_STANDARD_EULA_URL).catch(() => {})}
        />
        <Row label="Privacy policy" onPress={() => router.push('/privacy-policy')} />
      </ListGroup>

      <SectionLabel>Credits</SectionLabel>
      <View style={styles.creditsCard}>
        <Text style={styles.creditsText}>
          Type: <Text style={styles.creditsBold}>Switzer</Text> by Indian Type Foundry ·{' '}
          <Text style={styles.creditsBold}>Instrument Serif</Text> by Instrument ·{' '}
          <Text style={styles.creditsBold}>Dancing Script</Text> by Pablo Impallari.
          {'\n'}
          Skin-tone calibration adapted from Monk Skin Tone Scale (10 levels).
          {'\n'}
          On-device facial-landmark inference: Apple Vision.
        </Text>
      </View>

      <Text style={styles.copyright}>© 2026 BDQ Holdings LLC</Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: P.accent,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  logoGlyph: {
    fontFamily: FontFamily.accent,
    fontSize: 44,
    color: 'white',
  },
  wordmark: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 30,
    color: P.ink,
    marginTop: 14,
  },
  versionLine: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    marginTop: 4,
  },
  madeIn: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    marginTop: 2,
  },
  whyCard: {
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 18,
  },
  whyQuote: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 18,
    color: P.ink,
    lineHeight: 25,
  },
  whyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    marginTop: 10,
    lineHeight: 18,
  },
  creditsCard: {
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 16,
  },
  creditsText: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    lineHeight: 20,
  },
  creditsBold: {
    color: P.ink,
    fontFamily: FontFamily.sansMedium,
  },
  copyright: {
    paddingTop: 32,
    textAlign: 'center',
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
  },
});
