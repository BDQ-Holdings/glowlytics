import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function SettingsHubScreen() {
  const router = useRouter();
  const subscription = useStore((s) => s.subscription);
  const userRecord = useStore((s) => s.user);
  const resetAll = useStore((s) => s.resetAll);

  const clerk = useUser ? useUser() : null;
  const clerkLib = useClerk ? useClerk() : null;
  const firstName = clerk?.user?.firstName ?? '';
  const email = clerk?.user?.primaryEmailAddress?.emailAddress ?? '';
  const initial = (firstName || email || 'You').charAt(0).toUpperCase();
  const fullName = firstName || (email ? email.split('@')[0] : 'Glowlytics member');

  const memberSince = useMemo(() => {
    const created = (userRecord as any)?.created_at;
    if (!created) return null;
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [userRecord]);

  const isPremium = subscription?.tier === 'premium';
  const planLabel = isPremium ? 'Plus' : 'Free plan';
  const planColor = isPremium ? P.accent : P.muted;

  const handleSignOut = async () => {
    if (!clerkLib?.signOut) return;
    try {
      await clerkLib.signOut();
      // Clear local data on sign-out (parity with account.tsx). Without this,
      // the next account to sign in on this device inherits this user's data.
      await resetAll();
      router.replace('/auth/sign-in' as any);
    } catch {
      // swallow; treat as no-op on failure
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Settings" eyebrow={memberSince ? `${fullName} · since ${memberSince}` : fullName} />

      {/* Profile hero */}
      <Pressable
        onPress={() => router.push('/account' as any)}
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
          onPress={() => router.push('/settings/skin-profile' as any)}
        />
        <Row
          label="Rituals & routine"
          value="AM + PM"
          onPress={() => router.push('/routine' as any)}
        />
      </ListGroup>

      <SectionLabel>Insights & data</SectionLabel>
      <ListGroup>
        <Row
          label="Notifications"
          value="Tune nudges"
          onPress={() => router.push('/settings/notifications' as any)}
        />
        <Row
          label="Connected health"
          value="Apple Health"
          onPress={() => router.push('/account' as any)}
        />
        <Row
          label="Camera & photos"
          value="On device"
          onPress={() => router.push('/settings/camera' as any)}
        />
        <Row
          label="Privacy & data"
          value="Quiet"
          onPress={() => router.push('/settings/privacy' as any)}
        />
        <Row
          label="Clinical sources"
          value="AAD · ACOG · WHO"
          onPress={() => router.push('/settings/clinical-sources' as any)}
        />
      </ListGroup>

      <SectionLabel>App</SectionLabel>
      <ListGroup>
        <Row
          label="Appearance"
          value="Dusk · light"
          onPress={() => router.push('/settings/appearance' as any)}
        />
        <Row
          label={
            <Text style={styles.rowMixed}>
              Glowlytics{' '}
              <Text style={{ color: P.accent, fontFamily: FontFamily.accent }}>Plus</Text>
            </Text>
          }
          value={isPremium ? 'Active' : 'Upgrade'}
          onPress={() => router.push('/paywall' as any)}
        />
        <Row
          label="Export your data"
          onPress={() => router.push('/settings/export' as any)}
        />
      </ListGroup>

      <SectionLabel>Support</SectionLabel>
      <ListGroup>
        <Row
          label="Help & feedback"
          onPress={() => router.push('/settings/help' as any)}
        />
        <Row
          label="About Glowlytics"
          value="v1.1.6"
          onPress={() => router.push('/settings/about' as any)}
        />
      </ListGroup>

      <View style={styles.dangerRow}>
        <Pressable onPress={handleSignOut} hitSlop={6}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/delete-account' as any)}
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
