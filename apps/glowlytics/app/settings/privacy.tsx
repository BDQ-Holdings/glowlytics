import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  GhostButton,
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { useStore } from '../../src/store/useStore';
import { activeProducts } from '../../src/services/ritual';

const P = Glow.palette;

export default function PrivacyScreen() {
  const router = useRouter();
  const scanCount = useStore((s) => s.modelOutputs.length);
  const photoCount = useStore((s) => s.dailyRecords.filter((record) => !!record.photo_uri).length);
  const productCount = useStore((s) => activeProducts(s.products).length);
  const patternCount = useStore((s) => s.patterns.length);
  return (
    <SettingsPage>
      <SettingsHeader title="Privacy & data" />

      {/* Pledge hero */}
      <View style={styles.pledge}>
        <View style={styles.pledgeGlow} pointerEvents="none" />
        <View>
          <Text style={styles.pledgeEyebrow}>Our pledge</Text>
          <Text style={styles.pledgeTitle}>Your scans, handled with care.</Text>
          <Text style={styles.pledgeBody}>
            Photos are uploaded to our secure backend and OpenAI to generate your
            skin insights. They’re never sold and never used to identify you.
          </Text>
        </View>
      </View>

      <SectionLabel>What's on this device</SectionLabel>
      <ListGroup>
        <Row label="Face photos" value={String(photoCount)} sub="Stored on this device, uploaded for analysis" />
        <Row label="Scan history" value={String(scanCount)} sub="Completed analysis results" />
        <Row label="Patterns" value={String(patternCount)} sub="Discovered from your records" />
        <Row label="Products" value={String(productCount)} sub="Your skincare shelf" />
      </ListGroup>

      <SectionLabel>What leaves</SectionLabel>
      <ListGroup>
        <Row
          label="Face photos"
          sub="Sent to our secure backend and OpenAI to generate your insights"
        />
        <Row
          label="Account & scan history"
          sub="Synced to our encrypted database"
        />
      </ListGroup>

      <SectionLabel>Controls</SectionLabel>
      <ListGroup>
        <Row label="Who can see your scores" value="Just you" />
      </ListGroup>

      <View style={styles.footer}>
        <GhostButton
          label="See our privacy policy"
          onPress={() => router.push('/privacy-policy')}
        />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  pledge: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: P.ink,
    borderRadius: 22,
    overflow: 'hidden',
  },
  pledgeGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: P.accent2,
    opacity: 0.3,
  },
  pledgeEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.accent2,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pledgeTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
    color: P.surface,
    marginTop: 8,
    lineHeight: 28,
  },
  pledgeBody: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.surface,
    opacity: 0.7,
    marginTop: 8,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
});
