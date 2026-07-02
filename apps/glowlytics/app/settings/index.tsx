import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import {
  ListGroup,
  Pill,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { confirmSignOut } from '../../src/services/session';
import { restorePurchases } from '../../src/services/subscription';
import { resolveColorMode } from '../../src/services/appearance';
import type { AppearancePaletteId } from '../../src/types';
let useUser:
  | (() => {
      user:
        | {
            firstName?: string | null;
            primaryEmailAddress?: { emailAddress?: string };
          }
        | null
        | undefined;
    })
  | undefined;

let useClerk: (() => { signOut: () => Promise<void> }) | undefined;

try {
  const clerk = require('@clerk/clerk-expo');
  useUser = clerk.useUser;
  useClerk = clerk.useClerk;
} catch {
  // Clerk not available
}

const P = Glow.palette;
const PALETTE_LABELS: Record<AppearancePaletteId, string> = {
  dusk: 'Dusk',
  meadow: 'Meadow',
  rose: 'Rose',
  auto: 'Auto',
};

export default function SettingsHubScreen() {
  const router = useRouter();
  const subscription = useStore((s) => s.subscription);
  const userRecord = useStore((s) => s.user);
  const setSubscription = useStore((s) => s.setSubscription);
  const appearance = useStore((s) => s.appearance);
  const systemScheme = useColorScheme();
  const clerk = useUser ? useUser() : null;
  const clerkLib = useClerk ? useClerk() : null;
  const firstName = clerk?.user?.firstName ?? '';
  const email = clerk?.user?.primaryEmailAddress?.emailAddress ?? '';
  const initial = (firstName || email || 'You').charAt(0).toUpperCase();
  const fullName = firstName || (email ? email.split('@')[0] : 'Glowlytics member');

  const memberSince = useMemo(() => {
    if (!userRecord || !('created_at' in userRecord)) return null;
    const created = userRecord.created_at;
    if (typeof created !== 'string' && typeof created !== 'number') return null;
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [userRecord]);

  const isPremium = subscription?.tier === 'premium';
  const planLabel = isPremium ? 'Plus' : 'Free plan';
  const planColor = isPremium ? P.accent : P.muted;

  const appearanceValue = `${PALETTE_LABELS[appearance.palette]} · ${resolveColorMode(appearance.mode, systemScheme)}`;

  const handleSignOut = () => {
    confirmSignOut(clerkLib);
  };

  const handleRestorePurchases = async () => {
    try {
      const next = await restorePurchases(subscription);
      setSubscription(next);
      Alert.alert(
        next.is_active ? 'Restored' : 'Nothing to restore',
        next.is_active ? 'Your subscription has been restored.' : 'No previous purchases were found.',
      );
    } catch {
      Alert.alert('Restore failed', 'Unable to restore purchases. Please try again later.');
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Settings" eyebrow={memberSince ? `${fullName} · since ${memberSince}` : fullName} />

      {/* Profile hero */}
      <Pressable
        onPress={() => router.push('/account')}
        style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Open account"
      >
        <LinearGradient
          colors={[P.accent, P.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroName} numberOfLines={1}>{fullName}</Text>
          {!!email && <Text style={styles.heroEmail} numberOfLines={1}>{email}</Text>}
          <View style={styles.heroPillRow}>
            <Pill color={planColor}>{planLabel}</Pill>
          </View>
        </View>
        <Feather name="chevron-right" size={16} color={P.muted} />
      </Pressable>

      <SectionLabel>Skin & you</SectionLabel>
      <ListGroup>
        <Row
          label="Skin profile"
          value="Tap to refine"
          onPress={() => router.push('/settings/skin-profile')}
        />
        <Row
          label="Rituals & routine"
          value="AM + PM"
          onPress={() => router.push('/routine')}
        />
      </ListGroup>

      <SectionLabel>Insights & data</SectionLabel>
      <ListGroup>
        <Row
          label="Notifications"
          value="Tune nudges"
          onPress={() => router.push('/settings/notifications')}
        />
        <Row
          label="Connected health"
          value="Apple Health"
          onPress={() => router.push('/account')}
        />
        <Row
          label="Privacy & data"
          value="Quiet"
          onPress={() => router.push('/settings/privacy')}
        />
        <Row
          label="Clinical sources"
          value="AAD · ACOG · WHO"
          onPress={() => router.push('/settings/clinical-sources')}
        />
      </ListGroup>

      <SectionLabel>App</SectionLabel>
      <ListGroup>
        <Row
          label="Appearance"
          value={appearanceValue}
          onPress={() => router.push('/settings/appearance')}
        />
        <Row
          label={
            <Text style={styles.rowMixed}>
              Glowlytics{' '}
              <Text style={{ color: P.accent, fontFamily: FontFamily.accent }}>Plus</Text>
            </Text>
          }
          value={isPremium ? 'Active' : 'Upgrade'}
          onPress={() => router.push('/paywall')}
        />
        <Row
          label="Restore purchases"
          value="App Store"
          onPress={handleRestorePurchases}
        />
        <Row
          label="Export your data"
          onPress={() => router.push('/settings/export')}
        />
      </ListGroup>

      <SectionLabel>Support</SectionLabel>
      <ListGroup>
        <Row
          label="Help & feedback"
          onPress={() => router.push('/settings/help')}
        />
        <Row
          label="About Glowlytics"
          value={`v${Constants.expoConfig?.version ?? '1.2.0'}`}
          onPress={() => router.push('/settings/about')}
        />
      </ListGroup>

      <View style={styles.dangerRow}>
        <Pressable onPress={handleSignOut} hitSlop={6}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/delete-account')}
          hitSlop={6}
        >
          <Text style={styles.delete}>Delete account</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Made with care · Brooklyn</Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.sans,
    fontSize: 26,
    color: P.surface,
  },
  heroName: {
    fontFamily: FontFamily.sansBold,
    fontSize: 16,
    color: P.ink,
  },
  heroEmail: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },
  heroPillRow: {
    marginTop: 6,
  },
  rowMixed: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: P.ink,
  },
  dangerRow: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  signOut: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: P.muted,
    paddingVertical: 10,
  },
  delete: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.accent,
    opacity: 0.7,
    paddingVertical: 10,
  },
  footer: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
  },
});
