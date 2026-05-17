import React, { useState } from 'react';
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
  Toggle,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

export default function PrivacyScreen() {
  const router = useRouter();
  const [shareResearch, setShareResearch] = useState(true);
  const [crash, setCrash] = useState(true);
  const [shareProvider, setShareProvider] = useState(false);
  const [hidePreviews, setHidePreviews] = useState(true);

  return (
    <SettingsPage>
      <SettingsHeader title="Privacy & data" />

      {/* Pledge hero */}
      <View style={styles.pledge}>
        <View style={styles.pledgeGlow} pointerEvents="none" />
        <View>
          <Text style={styles.pledgeEyebrow}>Our pledge</Text>
          <Text style={styles.pledgeTitle}>Your face never leaves your phone.</Text>
          <Text style={styles.pledgeBody}>
            Photos are processed on-device. We see numbers, not pictures.
          </Text>
        </View>
      </View>

      <SectionLabel>What's on this device</SectionLabel>
      <ListGroup>
        <Row label="Face photos"  value="124 MB" sub="Encrypted at rest" />
        <Row label="Scan history" value="9 KB"   sub="47 reads since March" />
        <Row label="Patterns"     value="3 KB"   sub="Discovered locally" />
      </ListGroup>

      <SectionLabel>What leaves</SectionLabel>
      <ListGroup>
        <Row
          label="Anonymous research"
          sub="Aggregate skin trends — never your face"
          control={<Toggle on={shareResearch} onChange={setShareResearch} />}
        />
        <Row
          label="Crash reports"
          sub="Diagnostic only, no personal data"
          control={<Toggle on={crash} onChange={setCrash} />}
        />
        <Row
          label="Share with provider"
          sub="Off · your dermatologist"
          control={<Toggle on={shareProvider} onChange={setShareProvider} />}
        />
      </ListGroup>

      <SectionLabel>Controls</SectionLabel>
      <ListGroup>
        <Row label="Who can see your scores" value="Just you" />
        <Row label="App lock"                value="Face ID" />
        <Row
          label="Hide previews on lockscreen"
          control={<Toggle on={hidePreviews} onChange={setHidePreviews} />}
        />
      </ListGroup>

      <View style={styles.footer}>
        <GhostButton
          label="See our privacy policy"
          onPress={() => router.push('/privacy-policy' as any)}
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
