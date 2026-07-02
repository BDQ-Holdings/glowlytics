import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { deleteAccountAndSignOut } from '../../src/services/accountDeletion';
import { activeProducts } from '../../src/services/ritual';
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

let useClerk: (() => { signOut: () => Promise<void> }) | undefined;

try {
  const clerk = require('@clerk/clerk-expo');
  useClerk = clerk.useClerk;
} catch {
  // Clerk not available
}

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message.trim().length > 0 ? err.message : fallback;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const user = useStore((s) => s.user);
  const scanCount = useStore((s) => s.modelOutputs.length);
  const productCount = useStore((s) => activeProducts(s.products).length);
  // Only patterns actually discovered from the user's data — predicted
  // cold-start placeholders aren't theirs to lose.
  const patternCount = useStore((s) => s.patterns.filter((p) => !p.isPredicted).length);
  const getStreak = useStore((s) => s.getStreak);
  const streak = getStreak();

  const clerk = useClerk ? useClerk() : null;

  const confirmDelete = () => {
    if (!user?.user_id || deleting) return;
    Alert.alert(
      'Delete account?',
      'This immediately and permanently deletes your account and synced data, including scan history, photos, products, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // Fire before deletion — the helper resets the analytics
              // identity, so this is the last chance to attribute the reason.
              if (reason) trackEvent('account_delete_reason', { reason });
              await deleteAccountAndSignOut({ userId: user.user_id, clerk });
              router.replace('/');
            } catch (err: unknown) {
              Alert.alert(
                'Delete account failed',
                getErrorMessage(err, 'We could not delete your account. Please try again.'),
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Delete account" eyebrow="This is permanent" />

      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Feather name="alert-triangle" size={16} color="white" />
        </View>
        <Text style={styles.heroEyebrow}>This can't be undone</Text>
        <Text style={styles.heroTitle}>
          Deleting your account <Text style={{ color: DANGER }}>erases everything</Text> immediately.
        </Text>
      </View>

      <SectionLabel>What goes away</SectionLabel>
      <ListGroup>
        <Row
          label={`${scanCount} ${scanCount === 1 ? 'scan' : 'scans'} · ${streak}-day streak`}
          sub="All scan history, photos, and check-ins"
        />
        <Row
          label={`${patternCount} discovered ${patternCount === 1 ? 'pattern' : 'patterns'}`}
          sub="Everything the pattern engine has learned"
        />
        <Row
          label="Your product shelf"
          sub={`${productCount} ${productCount === 1 ? 'item' : 'items'} + impact history`}
        />
      </ListGroup>

      <SectionLabel>Before you go</SectionLabel>
      <View style={styles.offRamps}>
        <View style={styles.rampRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rampLabel}>Export your data first</Text>
            <Text style={styles.rampSub}>Take it with you</Text>
          </View>
          <GhostButton
            label="Export"
            onPress={() => router.push('/settings/export')}
            style={styles.rampCta}
          />
        </View>
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
        <PrimaryButton
          label={deleting ? 'Deleting\u2026' : 'Delete my account'}
          danger
          onPress={confirmDelete}
          style={styles.deleteBtn}
        />
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
