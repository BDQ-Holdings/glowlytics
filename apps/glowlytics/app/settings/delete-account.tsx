import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Chip,
  GhostButton,
  ListGroup,
  PrimaryButton,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;
const DANGER = '#A14A55';

const REASONS = ['Privacy', 'Too many nudges', 'Not useful', 'Cost', 'Other'];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);

  const confirmDelete = () => {
    Alert.alert(
      'Erase everything?',
      "We'll begin a 24-hour countdown. You can cancel any time before it ends.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, start deletion',
          style: 'destructive',
          onPress: () => {
            // Hooks into the cascading-deletion flow handled by the account stack.
            router.replace('/account' as any);
          },
        },
      ],
    );
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Delete account" eyebrow="Step 2 of 3 · This is permanent" />

      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Feather name="alert-triangle" size={16} color="white" />
        </View>
        <Text style={styles.heroEyebrow}>This can't be undone</Text>
        <Text style={styles.heroTitle}>
          We'll <Text style={{ color: DANGER }}>erase everything</Text> in 24 hours.
        </Text>
      </View>

      <SectionLabel>What goes away</SectionLabel>
      <ListGroup>
        <Row label="47 scans · 12-day streak" sub="All check-ins back to March" />
        <Row label="124 MB of face photos"     sub="From this device + iCloud backup" />
        <Row label="3 discovered patterns"     sub="Sleep · Tuesday redness · Retinoid" />
        <Row label="Your product shelf"        sub="5 items + impact history" />
      </ListGroup>

      <SectionLabel>Before you go</SectionLabel>
      <View style={styles.offRamps}>
        {[
          {
            l: 'Export your data first',
            sub: 'Take it with you',
            cta: 'Export',
            go: () => router.push('/settings/export' as any),
          },
          {
            l: 'Take a break instead',
            sub: 'Pause for 30 days, then we ask again',
            cta: 'Pause',
            go: () => router.back(),
          },
        ].map((o) => (
          <View key={o.l} style={styles.rampRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rampLabel}>{o.l}</Text>
              <Text style={styles.rampSub}>{o.sub}</Text>
            </View>
            <GhostButton label={o.cta} onPress={o.go} style={styles.rampCta} />
          </View>
        ))}
      </View>

      <SectionLabel>Why are you leaving?</SectionLabel>
      <View style={styles.reasonRow}>
        {REASONS.map((r) => (
          <Chip key={r} active={reason === r} onPress={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Delete my account" danger onPress={confirmDelete} style={styles.deleteBtn} />
        <GhostButton label="Cancel · keep me" onPress={() => router.back()} />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: DANGER + '11',
    borderColor: DANGER + '44',
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },
  heroBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DANGER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroEyebrow: {
    fontFamily: FontFamily.sansBold,
    fontSize: 11,
    color: DANGER,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
    color: P.ink,
    marginTop: 8,
    lineHeight: 28,
  },
  offRamps: {
    paddingHorizontal: 16,
    gap: 6,
  },
  rampRow: {
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
  rampLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    color: P.ink,
  },
  rampSub: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },
  rampCta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: P.bg,
    borderRadius: 999,
  },
  reasonRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actions: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: 8,
  },
  deleteBtn: {
    backgroundColor: DANGER,
  },
});
