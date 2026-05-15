import React, { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AtmosphereScreen } from '../src/components/AtmosphereScreen';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
  Surfaces,
} from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { harmonyStatusLabel } from '../src/constants/boneStructure';
import { resetHarmonyIntro } from '../src/components/HarmonyIntroOverlay';
import {
  presentPaywall,
  presentCustomerCenter,
  checkSubscriptionStatus,
  restorePurchases,
  isTrialActive,
  trialDaysRemaining,
} from '../src/services/subscription';
import { scheduleDailyReminder, cancelDailyReminder } from '../src/services/notifications';
import { trackEvent, resetAnalytics } from '../src/services/analytics';
import * as api from '../src/services/api';
import { formatRelativeTime } from '../src/utils/formatRelativeTime';
import { ConnectedAppsSection } from '../src/components/ConnectedAppsSection';
import { GamificationCard } from '../src/components/GamificationCard';
import { LevelProgressBar } from '../src/components/LevelProgressBar';
import { BadgeShowcase } from '../src/components/BadgeShowcase';

let useUser: (() => { user: { primaryEmailAddress?: { emailAddress?: string } } | null | undefined }) | undefined;
let useClerk: (() => { signOut: () => Promise<void> }) | undefined;

try {
  const clerk = require('@clerk/clerk-expo');
  useUser = clerk.useUser;
  useClerk = clerk.useClerk;
} catch {
  // Clerk not available
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
  </View>
);

// ArchitectureLauncher — entry button into the bone-structure flow. When the
// user has run at least one scan with bone analysis, the last Harmony score
// is shown as a trailing badge so the launcher reads as a live data surface
// rather than dead text.
const ArchitectureLauncher: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const lastHarmony = useStore((s) => {
    const outputs = s.modelOutputs ?? [];
    for (let i = outputs.length - 1; i >= 0; i--) {
      const h = outputs[i]?.bone_structure?.harmony;
      if (typeof h === 'number' && Number.isFinite(h)) return h;
    }
    return null;
  });
  const hasScan = lastHarmony != null;
  const statusLabel = hasScan ? harmonyStatusLabel(lastHarmony) : null;

  return (
    <TouchableOpacity
      style={styles.modeButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={hasScan
        ? `Open facial architecture analysis. Last Harmony score ${lastHarmony}, ${statusLabel}.`
        : 'Run facial architecture analysis'}
    >
      <Feather name="hexagon" size={16} color={Colors.harmony} />
      <Text style={styles.modeButtonText}>Facial architecture</Text>
      <View style={styles.archBadge}>
        {hasScan ? (
          <>
            <Text style={styles.archBadgeScore}>{lastHarmony}</Text>
            <Text style={styles.archBadgeDot}> · </Text>
            <Text style={styles.archBadgeStatus}>{statusLabel}</Text>
          </>
        ) : (
          <Text style={styles.archBadgeBeta}>Beta</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const getErrorMessage = (err: unknown, fallback = 'Unknown error') => {
  const clerkMessage = (err as any)?.errors?.[0]?.longMessage ?? (err as any)?.errors?.[0]?.message;
  if (typeof clerkMessage === 'string' && clerkMessage.trim().length > 0) {
    return clerkMessage;
  }
  return err instanceof Error ? err.message : String(err ?? fallback);
};

const getHealthkitHint = (message: string) => {
  if (/expo go|native module|unimplemented/i.test(message)) {
    return 'HealthKit requires an iOS development/production build (not Expo Go). Rebuild the app with EAS and try again.';
  }
  return message;
};

export default function AccountScreen() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const protocol = useStore((s) => s.protocol);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const gamification = useStore((s) => s.gamification);
  const subscription = useStore((s) => s.subscription);
  const setSubscription = useStore((s) => s.setSubscription);
  const notificationSettings = useStore((s) => s.notificationSettings);
  const setNotificationTime = useStore((s) => s.setNotificationTime);
  const resetAll = useStore((s) => s.resetAll);
  const healthConnection = useStore((s) => s.user?.health_connection);
  const healthSyncStatus = useStore((s) => s.healthSyncStatus);
  const updateHealthConnection = useStore((s) => s.updateHealthConnection);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [healthConnecting, setHealthConnecting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const getStreak = useStore((s) => s.getStreak);
  const streak = getStreak();

  const clerkUser = useUser ? useUser() : null;
  const clerk = useClerk ? useClerk() : null;
  const clerkEmail = clerkUser?.user?.primaryEmailAddress?.emailAddress;

  const periodLabel =
    user?.period_applicable === 'yes'
      ? 'Tracking'
      : user?.period_applicable === 'no'
        ? 'Not applicable'
        : 'Prefer not to say';

  const handleSignOut = async () => {
    if (clerk) {
      Alert.alert(
        'Sign out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: async () => {
              try {
                trackEvent('auth_sign_out');
                resetAnalytics();
                await clerk.signOut();
                await resetAll();
                // AuthRedirector handles navigation when isSignedIn → false
              } catch {
                Alert.alert('Sign out failed', 'Please try again.');
              }
            },
          },
        ],
      );
    }
  };

  const handleDeleteAccount = () => {
    if (!user?.user_id || deletingAccount) return;

    Alert.alert(
      'Delete account',
      'This permanently deletes your Glowlytics account and synced data, including scan history, products, photos, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              trackEvent('account_delete_requested');
              await api.deleteUser(user.user_id);
              await clerk?.signOut().catch(() => {});
              resetAnalytics();
              await resetAll();
              router.replace('/');
            } catch (err: unknown) {
              Alert.alert(
                'Delete account failed',
                getErrorMessage(err, 'We could not delete your account. Please try again.'),
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  const handleHealthConnect = async () => {
    setHealthConnecting(true);
    try {
      const { getHealthConnectionState, connectHealthData } = require('../src/services/healthPermissions');

      const initialState = await getHealthConnectionState();
      if (initialState.status === 'unavailable') {
        updateHealthConnection(initialState);
        Alert.alert(
          'Apple Health unavailable',
          initialState.availability_note || 'Apple Health is not available on this device.',
        );
        return;
      }

      const conn = await connectHealthData();
      updateHealthConnection(conn);

      if (conn.status === 'granted') {
        const { added, errors } = await useStore.getState().syncHealthData();
        if (errors.length > 0) {
          console.warn('[Health] Sync completed with errors:', errors[0]);
        }
        if (added === 0 && errors.length > 0) {
          Alert.alert('Connected with limited data', errors[0]);
        }
        return;
      }

      const reason =
        conn.availability_note ||
        (conn.status === 'denied'
          ? 'Permission was not granted. You can allow access in Apple Health > Sharing > Apps.'
          : 'Apple Health is not available on this device.');
      Alert.alert(
        conn.status === 'denied' ? 'Apple Health permission needed' : 'Apple Health unavailable',
        reason,
      );
    } catch (e: unknown) {
      const message = getHealthkitHint(getErrorMessage(e));
      console.warn('[Health] Connect failed:', message);
      Alert.alert('Could not connect Apple Health', message);
      updateHealthConnection({
        status: 'unavailable',
        availability_note: message,
      });
    } finally {
      setHealthConnecting(false);
    }
  };

  return (
    <AtmosphereScreen>
      {/* Identity header */}
      <View style={styles.identityHeader}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarGlow} />
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {(clerkEmail?.[0] || user?.age_range?.[0] || 'G').toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.identityInfo}>
          {clerkEmail && <Text style={styles.identityEmail} numberOfLines={1}>{clerkEmail}</Text>}
          <View style={styles.identityMeta}>
            <View style={[styles.tierBadge, {
              backgroundColor: subscription.is_active
                ? 'rgba(192, 123, 42, 0.12)'
                : isTrialActive(subscription)
                  ? Colors.surfaceOverlay
                  : Colors.surface,
            }]}>
              <Text style={[styles.tierBadgeText, {
                color: subscription.is_active
                  ? Colors.warning
                  : isTrialActive(subscription)
                    ? Colors.primary
                    : Colors.textMuted,
              }]}>
                {subscription.is_active ? 'Glow Pro' : isTrialActive(subscription) ? 'Trial' : 'Free'}
              </Text>
            </View>
            {streak > 0 && (
              <View style={styles.identityStreakRow}>
                <Feather name="zap" size={11} color={streak >= 7 ? Colors.warning : Colors.primary} />
                <Text style={[styles.identityStreak, { color: streak >= 7 ? Colors.warning : Colors.primary }]}>
                  {streak}d
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Account & Subscription */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Feather name="user" size={15} color={Colors.primary} />
          <Text style={styles.cardTitle}>Account & Plan</Text>
        </View>
        {clerkEmail ? (
          <InfoRow label="Email" value={clerkEmail} />
        ) : null}
        <TouchableOpacity
          style={styles.modeButton}
          onPress={handleSignOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sign out of your account"
        >
          <Feather name="log-out" size={16} color={Colors.error} />
          <Text style={[styles.modeButtonText, { color: Colors.error }]}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.modeButton}
          onPress={() => router.push('/privacy-policy')}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="Terms and Privacy Policy"
        >
          <Feather name="shield" size={16} color={Colors.primaryLight} />
          <Text style={styles.modeButtonText}>Terms & Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeButton, styles.modeButtonDestructive]}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Feather name="trash-2" size={16} color={Colors.error} />
          <Text style={[styles.modeButtonText, { color: Colors.error }]}>
            {deletingAccount ? 'Deleting account...' : 'Delete account'}
          </Text>
        </TouchableOpacity>

        <View style={styles.divider} />
        <ArchitectureLauncher onPress={() => router.push('/scan/bone-capture')} />
        <TouchableOpacity
          style={styles.archReplayRow}
          onPress={async () => {
            await resetHarmonyIntro();
            Alert.alert(
              'Intro reset',
              'The Facial architecture explainer will appear the next time you open your bone-structure results.',
            );
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Replay the Facial architecture intro"
        >
          <Feather name="rotate-ccw" size={12} color={Colors.textMuted} />
          <Text style={styles.archReplayText}>Replay architecture intro</Text>
        </TouchableOpacity>

        <View style={styles.divider} />
        <ConnectedAppsSection />

        {/* Subscription inline */}
        <View style={styles.divider} />
        {subscription.is_active ? (
          <>
            <InfoRow label="Plan" value="Glow Pro" />
            {subscription.expires_at && (
              <InfoRow
                label="Renews"
                value={new Date(subscription.expires_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              />
            )}
            <TouchableOpacity
              style={styles.modeButton}
              onPress={async () => {
                trackEvent('subscription_manage_tapped');
                try {
                  await presentCustomerCenter();
                } catch {
                  Alert.alert('Subscription', 'Unable to open subscription management. Please try again later.');
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Manage subscription"
            >
              <Feather name="settings" size={16} color={Colors.primaryLight} />
              <Text style={styles.modeButtonText}>Manage subscription</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <InfoRow
              label="Plan"
              value={isTrialActive(subscription) ? 'Free Trial' : 'Free'}
            />
            {isTrialActive(subscription) && (
              <InfoRow
                label="Trial days remaining"
                value={String(trialDaysRemaining(subscription))}
              />
            )}
            <TouchableOpacity
              style={styles.modeButton}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Glow Pro"
              onPress={async () => {
                try {
                  const purchased = await presentPaywall();
                  if (purchased) {
                    const sub = await checkSubscriptionStatus(subscription);
                    setSubscription(sub);
                  }
                } catch {
                  Alert.alert('Subscription', 'Unable to load upgrade options. Please try again later.');
                }
              }}
              activeOpacity={0.7}
            >
              <Feather name="zap" size={16} color={Colors.primary} />
              <Text style={[styles.modeButtonText, { color: Colors.primary }]}>Upgrade to Glow Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={async () => {
                try {
                  const sub = await restorePurchases(subscription);
                  setSubscription(sub);
                  if (sub.is_active) {
                    Alert.alert('Restored', 'Your subscription has been restored.');
                  } else {
                    Alert.alert('Nothing to restore', 'No previous purchases found.');
                  }
                } catch {
                  Alert.alert('Restore failed', 'Unable to restore purchases. Please try again later.');
                }
              }}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={16} color={Colors.primaryLight} />
              <Text style={styles.modeButtonText}>Restore Purchases</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Health Data */}
      {Platform.OS === 'ios' && healthConnection?.status !== 'unavailable' && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Feather name="heart" size={15} color="#FF7A78" />
            <Text style={styles.cardTitle}>Health Data</Text>
          </View>
          {healthConnection?.status === 'granted' ? (
            <>
              <InfoRow label="Apple Health" value="Connected" />
              <InfoRow
                label="Last synced"
                value={formatRelativeTime(healthSyncStatus.last_sync_at) ?? 'Never'}
              />
              <TouchableOpacity
                style={styles.modeButton}
                onPress={() => {
                  Linking.openURL('x-apple-health://').catch(() => {
                    Linking.openURL('app-settings:').catch(() => {});
                  });
                }}
                activeOpacity={0.7}
              >
                <Feather name="settings" size={16} color={Colors.primaryLight} />
                <Text style={styles.modeButtonText}>Manage in iOS Settings</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.modeButton}
              onPress={handleHealthConnect}
              disabled={healthConnecting}
              activeOpacity={0.7}
            >
              <Feather name="activity" size={16} color={Colors.primary} />
              <Text style={[styles.modeButtonText, { color: Colors.primary }]}>
                {healthConnecting ? 'Connecting...' : 'Connect Apple Health'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Notifications */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Feather name="bell" size={15} color={Colors.secondary} />
          <Text style={styles.cardTitle}>Notifications</Text>
        </View>
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => {
            if (notificationSettings.notifications_enabled) {
              setShowTimePicker(true);
            }
          }}
          activeOpacity={notificationSettings.notifications_enabled ? 0.7 : 1}
        >
          <Text style={styles.infoLabel}>Daily reminder</Text>
          <Text style={[styles.infoValue, notificationSettings.notifications_enabled && notificationSettings.notification_time
            ? { color: Colors.primary }
            : { color: Colors.textDim }]}>
            {notificationSettings.notifications_enabled && notificationSettings.notification_time
              ? notificationSettings.notification_time
              : 'Off'}
          </Text>
        </TouchableOpacity>
        {showTimePicker && (
          <DateTimePicker
            value={(() => {
              const [h, m] = (notificationSettings.notification_time || '08:00').split(':').map(Number);
              const d = new Date(2000, 0, 1, h, m);
              return d;
            })()}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={async (_, selected) => {
              setShowTimePicker(Platform.OS === 'ios');
              if (selected) {
                const h = selected.getHours();
                const m = selected.getMinutes();
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                try {
                  await scheduleDailyReminder(h, m);
                  setNotificationTime(timeStr);
                } catch { /* notification scheduling failed — non-fatal */ }
              }
            }}
            themeVariant="light"
          />
        )}
        {notificationSettings.notifications_enabled ? (
          <View style={{ gap: Spacing.sm }}>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => setShowTimePicker(!showTimePicker)}
              activeOpacity={0.7}
            >
              <Feather name="clock" size={16} color={Colors.primary} />
              <Text style={[styles.modeButtonText, { color: Colors.primary }]}>Change time</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={async () => {
                try {
                  await cancelDailyReminder();
                } catch { /* non-fatal */ }
                setNotificationTime(null);
                setShowTimePicker(false);
              }}
              activeOpacity={0.7}
            >
              <Feather name="bell-off" size={16} color={Colors.error} />
              <Text style={[styles.modeButtonText, { color: Colors.error }]}>Turn off reminders</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.modeButton}
            onPress={async () => {
              const defaultTime = '08:00';
              const [h, m] = defaultTime.split(':').map(Number);
              try {
                await scheduleDailyReminder(h, m);
                setNotificationTime(defaultTime);
              } catch { /* non-fatal */ }
            }}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={16} color={Colors.primary} />
            <Text style={[styles.modeButtonText, { color: Colors.primary }]}>Enable daily reminder</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Your Profile — demographics + scan protocol combined */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Feather name="edit-3" size={15} color={Colors.clay} />
          <Text style={styles.cardTitle}>Your Profile</Text>
        </View>
        <InfoRow label="Age range" value={user?.age_range || '—'} />
        <InfoRow label="Location" value={user?.location_coarse || '—'} />
        <InfoRow label="Period tracking" value={periodLabel} />
        {user?.smoker_status !== undefined && (
          <InfoRow label="Smoker" value={user.smoker_status ? 'Yes' : 'No'} />
        )}
        {user?.drink_baseline_frequency && (
          <InfoRow label="Alcohol" value={user.drink_baseline_frequency} />
        )}
        <View style={styles.divider} />
        <InfoRow label="Goal" value={protocol?.primary_goal?.replace(/_/g, ' ') || '—'} />
        <InfoRow label="Region" value={protocol?.scan_region?.replace(/_/g, ' ') || '—'} />
        <InfoRow label="Total scans" value={String(dailyRecords.length)} />
      </View>

      {/* Progress — gamification + achievements unified */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Feather name="award" size={15} color={Colors.warning} />
          <Text style={styles.cardTitle}>Progress</Text>
        </View>
        <GamificationCard gamification={gamification} streak={streak} />
        <View style={styles.divider} />
        <LevelProgressBar xp={gamification.xp} />
        <BadgeShowcase earnedBadges={gamification.badges} />
        <View style={styles.personalBests}>
          <Text style={styles.personalBestsTitle}>Personal bests</Text>
          <View style={styles.bestGrid}>
            <View style={[styles.bestItem, { backgroundColor: 'rgba(192, 123, 42, 0.06)' }]}>
              <Text style={[styles.bestValue, { color: Colors.warning }]}>
                {gamification.personal_bests?.longest_streak || '--'}
              </Text>
              <Text style={styles.bestLabel}>Longest streak</Text>
            </View>
            <View style={[styles.bestItem, { backgroundColor: Colors.glowCoral }]}>
              <Text style={[styles.bestValue, { color: Colors.acne }]}>
                {(gamification.personal_bests?.lowest_acne ?? 100) < 100 ? gamification.personal_bests!.lowest_acne : '--'}
              </Text>
              <Text style={styles.bestLabel}>Lowest acne</Text>
            </View>
            <View style={[styles.bestItem, { backgroundColor: Colors.surfaceOverlay }]}>
              <Text style={[styles.bestValue, { color: Colors.primary }]}>
                {(gamification.personal_bests?.highest_skin_score ?? 0) > 0 ? gamification.personal_bests!.highest_skin_score : '--'}
              </Text>
              <Text style={styles.bestLabel}>Best score</Text>
            </View>
            <View style={[styles.bestItem, { backgroundColor: Colors.glowSecondary }]}>
              <Text style={[styles.bestValue, { color: Colors.secondary }]}>
                {(gamification.personal_bests?.most_consistent_week ?? 0) > 0 ? `${gamification.personal_bests!.most_consistent_week}/7` : '--'}
              </Text>
              <Text style={styles.bestLabel}>Best week</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footerSpacer} />
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  identityHeader: {
    ...Surfaces.hero,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  avatarWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.glowPrimary,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: Glow.palette.surface,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  identityInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  identityEmail: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  identityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierBadge: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  tierBadgeText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  identityStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  identityStreak: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  infoLabel: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textTransform: 'capitalize',
  },
  infoValue: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textTransform: 'capitalize',
    flexShrink: 1,
    textAlign: 'right',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.glassStrong,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  modeButtonDestructive: {
    borderColor: 'rgba(209, 67, 67, 0.18)',
    backgroundColor: 'rgba(209, 67, 67, 0.06)',
  },
  modeButtonText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  archBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.harmony + '20',
  },
  archBadgeScore: {
    color: Colors.harmony,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  archBadgeDot: {
    color: Colors.harmony,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    opacity: 0.6,
  },
  archBadgeStatus: {
    color: Colors.harmony,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  archBadgeBeta: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  archReplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignSelf: 'center',
  },
  archReplayText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  personalBests: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  personalBestsTitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  bestItem: {
    width: '47%' as any,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xxs,
  },
  bestValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  bestLabel: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  footerSpacer: {
    height: Spacing.xl,
  },
});
