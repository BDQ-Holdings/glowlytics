import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { scheduleDailyReminder, requestNotificationPermissions } from '../../src/services/notifications';
import { trackEvent } from '../../src/services/analytics';
import { Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';

const TIME_OPTIONS = ['6:30', '7:00', '7:30', '8:00', '8:30', '9:00', '9:30', '10:00'];

export default function ScanReminder() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setNotificationTime = useStore((s) => s.setNotificationTime);
  const preferredName = useStore((s) => s.preferredName);

  // Discrete morning slot. Defaults to 8:00 — the screen's prior default time.
  const [picked, setPicked] = useState('8:00');

  const handleSetReminder = async () => {
    const [hour, minute] = picked.split(':').map(Number);
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const granted = await requestNotificationPermissions();
    if (granted) {
      trackEvent('onboarding_scan_reminder_set', { time: timeStr });
      await scheduleDailyReminder(hour, minute);
      setNotificationTime(timeStr);
    } else {
      trackEvent('onboarding_scan_reminder_denied');
    }

    advance();
  };

  const handleSkip = () => {
    trackEvent('onboarding_scan_reminder_skipped');
    advance();
  };

  return (
    <OnboardingTransition
      heading={'When do you do\nmornings?'}
      subtext={'We\'ll send one quiet nudge. No "Don\'t break your streak!" — promise.'}
      primaryLabel={`Set ${picked} AM`}
      primaryOnPress={handleSetReminder}
      onSkip={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View>
        <View style={styles.grid}>
          {TIME_OPTIONS.map((t) => {
            const on = t === picked;
            return (
              <View key={t} style={styles.cellWrap}>
                <TouchableOpacity
                  onPress={() => setPicked(t)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t} AM`}
                  style={[
                    styles.cell,
                    { backgroundColor: on ? P.ink : P.surface, borderColor: on ? P.ink : P.glow },
                  ]}
                >
                  <Text style={[styles.cellLabel, { color: on ? P.surface : P.ink }]}>{t}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Notification preview */}
        <View style={[styles.previewCard, { backgroundColor: P.surface, borderColor: P.glow }]}>
          <Text style={[styles.previewOverline, { color: P.muted }]}>{`What you'll get at ${picked}`}</Text>
          <View style={styles.previewRow}>
            <View style={[styles.previewTile, { backgroundColor: P.accent }]}>
              <GlowIcon name="bell" size={14} color={P.surface} stroke={1.7} />
            </View>
            <View style={styles.previewBody}>
              <Text style={[styles.previewApp, { color: P.ink }]}>Glowlytics</Text>
              <Text style={[styles.previewText, { color: P.muted }]}>
                <Text style={styles.previewGreeting}>
                  {preferredName ? `Good morning, ${preferredName}.` : 'Good morning.'}
                </Text>
                {' Window light\'s right when you are.'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  cellWrap: {
    width: '25%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  cell: {
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
  },
  previewCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.md,
  },
  previewOverline: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  previewTile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBody: {
    flex: 1,
  },
  previewApp: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  previewText: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  previewGreeting: {
    fontFamily: FontFamily.serifItalic,
  },
});
