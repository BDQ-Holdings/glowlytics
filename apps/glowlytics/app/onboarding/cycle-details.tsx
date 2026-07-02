import React, { useMemo, useState } from 'react';
import { Platform, Pressable, View, Text, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingGridOption } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { localDateStr } from '../../src/utils/localDate';

const CYCLE_LENGTH_OPTIONS = ['21-25', '26-30', '31+', 'Not sure'] as const;
type CycleLengthOption = typeof CYCLE_LENGTH_OPTIONS[number];

function CycleIllustration() {
  return (
    <Svg width={140} height={100} viewBox="0 0 140 100">
      <Defs>
        <RadialGradient id="cycleGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.3} />
          <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={70} cy={50} r={40} fill="url(#cycleGlow)" />
      <Path
        d="M15 50 Q35 30 55 50 Q75 70 95 50 Q115 30 135 50"
        fill="none"
        stroke="#C07B2A"
        strokeWidth={1.2}
        strokeOpacity={0.3}
        strokeLinecap="round"
      />
      <Circle cx={70} cy={50} r={18} fill="none" stroke="#3A9E8F" strokeWidth={0.8} strokeOpacity={0.2} />
      <Circle cx={70} cy={50} r={3} fill="#C07B2A" fillOpacity={0.5} />
      <Circle cx={30} cy={42} r={1.5} fill="#3A9E8F" fillOpacity={0.2} />
      <Circle cx={110} cy={42} r={1.5} fill="#3A9E8F" fillOpacity={0.2} />
    </Svg>
  );
}

function cycleLengthToNumber(option: CycleLengthOption): number {
  switch (option) {
    case '21-25': return 23;
    case '26-30': return 28;
    case '31+': return 33;
    case 'Not sure': return 28;
  }
}

function cycleLengthFromNumber(days?: number): CycleLengthOption | null {
  if (!days) return null;
  if (days <= 25) return '21-25';
  if (days <= 30) return '26-30';
  return '31+';
}

function parseLocalDate(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatSelectedDate(value: Date | null): string {
  if (!value) return 'Pick a date';
  return value.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CycleDetails() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);
  const today = useMemo(() => new Date(), []);

  const [lastPeriodDate, setLastPeriodDate] = useState<Date | null>(() =>
    parseLocalDate(useStore.getState().user?.period_last_start_date),
  );
  const [cycleLength, setCycleLength] = useState<CycleLengthOption | null>(() =>
    cycleLengthFromNumber(useStore.getState().user?.cycle_length_days),
  );
  // Android's DateTimePicker is a one-shot dialog: mounting it permanently
  // auto-opens it and it can never re-open after dismissal. Mount on press
  // there; iOS keeps the always-visible inline spinner.
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const handleContinue = () => {
    const updates: Record<string, string | number> = {};

    if (lastPeriodDate) {
      updates.period_last_start_date = localDateStr(lastPeriodDate);
    }
    if (cycleLength) {
      updates.cycle_length_days = cycleLengthToNumber(cycleLength);
    }

    updateUser(updates);
    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<CycleIllustration />}
      heading="A couple more details about your cycle."
      subtext="Rough numbers are fine. We use this to estimate cycle timing, not to log it precisely."
      primaryLabel="Got it"
      primaryOnPress={handleContinue}
      secondaryLabel="Skip details"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.sectionStack}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>When did your last period start?</Text>
          <View style={styles.dateCard}>
            <Pressable
              disabled={Platform.OS === 'ios'}
              onPress={() => setShowAndroidPicker(true)}
              accessibilityRole={Platform.OS === 'ios' ? undefined : 'button'}
              accessibilityLabel="Change last period start date"
            >
              <Text style={styles.dateValue}>{formatSelectedDate(lastPeriodDate)}</Text>
            </Pressable>
            {(Platform.OS === 'ios' || showAndroidPicker) && (
              <DateTimePicker
                value={lastPeriodDate ?? today}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={today}
                onChange={(_, selected) => {
                  if (Platform.OS !== 'ios') setShowAndroidPicker(false);
                  if (selected) setLastPeriodDate(selected);
                }}
                textColor={Colors.text}
                themeVariant="light"
                style={styles.datePicker}
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Typical cycle length</Text>
          <View style={styles.grid}>
            {CYCLE_LENGTH_OPTIONS.map((opt) => (
              <View key={opt} style={styles.gridItem}>
                <OnboardingGridOption
                  label={opt}
                  selected={cycleLength === opt}
                  onPress={() => setCycleLength(opt)}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
  },
  dateCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Glow.palette.glow,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  dateValue: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  datePicker: {
    alignSelf: 'center',
    width: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridItem: {
    width: '48%',
  },
});
