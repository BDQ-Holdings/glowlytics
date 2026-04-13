import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { scheduleDailyReminder, requestNotificationPermissions } from '../../src/services/notifications';
import { trackEvent } from '../../src/services/analytics';
import { Colors } from '../../src/constants/theme';

function ReminderIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="remGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.6} />
          <Stop offset="45%" stopColor="#C07B2A" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="remCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.5} />
          <Stop offset="35%" stopColor="#C07B2A" stopOpacity={0.4} />
          <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={100} cy={80} rx={80} ry={65} fill="url(#remGlow)" />
      {/* Clock-like rings */}
      <Circle cx={100} cy={80} r={45} fill="none" stroke="#C07B2A" strokeWidth={1.2} strokeOpacity={0.25} />
      <Circle cx={100} cy={80} r={32} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.2} />
      <Circle cx={100} cy={80} r={18} fill="url(#remCore)" />
      <Circle cx={100} cy={80} r={6} fill="#C07B2A" fillOpacity={0.7} />
      <Circle cx={100} cy={80} r={2.5} fill="#FFFFFF" fillOpacity={0.9} />
      {/* Hour markers */}
      <Circle cx={100} cy={35} r={2} fill="#C07B2A" fillOpacity={0.45} />
      <Circle cx={145} cy={80} r={2} fill="#C07B2A" fillOpacity={0.4} />
      <Circle cx={100} cy={125} r={2} fill="#C07B2A" fillOpacity={0.35} />
      <Circle cx={55} cy={80} r={2} fill="#C07B2A" fillOpacity={0.4} />
      {/* Particles */}
      <Circle cx={65} cy={45} r={1.5} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={140} cy={50} r={1.5} fill="#3A9E8F" fillOpacity={0.25} />
      <Circle cx={60} cy={115} r={2} fill="#3A9E8F" fillOpacity={0.2} />
      <Circle cx={145} cy={112} r={1.5} fill="#3A9E8F" fillOpacity={0.25} />
    </Svg>
  );
}

export default function ScanReminder() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setNotificationTime = useStore((s) => s.setNotificationTime);

  const [time, setTime] = useState(new Date(2000, 0, 1, 8, 0)); // default 8:00 AM

  const handleSetReminder = async () => {
    const hour = time.getHours();
    const minute = time.getMinutes();
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
      illustration={<ReminderIllustration />}
      heading="When should we remind you to scan?"
      subtext="Pick a time that works with your routine. We'll send a quick nudge so you don't forget."
      primaryLabel="Set reminder"
      primaryOnPress={handleSetReminder}
      secondaryLabel="Skip"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={time}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => { if (selected) setTime(selected); }}
          textColor={Colors.text}
          themeVariant="light"
          style={styles.picker}
        />
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  picker: {
    width: 280,
    height: 160,
  },
});
