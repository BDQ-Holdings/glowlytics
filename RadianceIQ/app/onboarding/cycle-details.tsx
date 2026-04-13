import React, { useState } from 'react';
import { Alert, View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingGridOption, OnboardingChip, OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import type { BirthControlType } from '../../src/types';

const CYCLE_LENGTH_OPTIONS = ['21-25', '26-30', '31+', 'Not sure'] as const;
type CycleLengthOption = typeof CYCLE_LENGTH_OPTIONS[number];

const BIRTH_CONTROL_RESPONSE = ['Yes', 'No', 'Prefer not to say'] as const;
type BirthControlResponse = typeof BIRTH_CONTROL_RESPONSE[number];

const BIRTH_CONTROL_TYPES: { label: string; value: BirthControlType }[] = [
  { label: 'Pill', value: 'pill' },
  { label: 'IUD', value: 'iud' },
  { label: 'Patch', value: 'patch' },
  { label: 'Ring', value: 'ring' },
  { label: 'Injection', value: 'injection' },
  { label: 'Implant', value: 'implant' },
];

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

function birthControlResponseToValue(resp: BirthControlResponse): 'yes' | 'no' | 'prefer_not' {
  switch (resp) {
    case 'Yes': return 'yes';
    case 'No': return 'no';
    case 'Prefer not to say': return 'prefer_not';
  }
}

export default function CycleDetails() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [lastPeriodDate, setLastPeriodDate] = useState('');
  const [cycleLength, setCycleLength] = useState<CycleLengthOption | null>(null);
  const [birthControl, setBirthControl] = useState<BirthControlResponse | null>(null);
  const [birthControlType, setBirthControlType] = useState<BirthControlType | null>(null);

  const handleContinue = () => {
    const updates: Record<string, any> = {};

    if (lastPeriodDate.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodDate.trim())) {
        Alert.alert('Invalid date', 'Please enter a date in YYYY-MM-DD format.');
        return;
      }
      updates.period_last_start_date = lastPeriodDate.trim();
    }
    if (cycleLength) {
      updates.cycle_length_days = cycleLengthToNumber(cycleLength);
    }
    if (birthControl) {
      updates.on_hormonal_birth_control = birthControlResponseToValue(birthControl);
    }
    if (birthControl === 'Yes' && birthControlType) {
      updates.birth_control_type = birthControlType;
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Last period date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>When did your last period start?</Text>
          <TextInput
            style={styles.input}
            value={lastPeriodDate}
            onChangeText={setLastPeriodDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            autoCorrect={false}
            maxLength={10}
            accessibilityLabel="Last period start date"
          />
        </View>

        {/* Cycle length */}
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

        {/* Birth control */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Are you on hormonal birth control?</Text>
          <View style={styles.bcOptions}>
            {BIRTH_CONTROL_RESPONSE.map((opt) => (
              <OnboardingOptionCard
                key={opt}
                label={opt}
                selected={birthControl === opt}
                onPress={() => {
                  setBirthControl(opt);
                  if (opt !== 'Yes') setBirthControlType(null);
                }}
              />
            ))}
          </View>
        </View>

        {/* Birth control type chips */}
        {birthControl === 'Yes' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What type?</Text>
            <View style={styles.chipRow}>
              {BIRTH_CONTROL_TYPES.map((bc) => (
                <OnboardingChip
                  key={bc.value}
                  label={bc.label}
                  selected={birthControlType === bc.value}
                  onPress={() => setBirthControlType(bc.value)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    maxHeight: 340,
  },
  scrollContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    color: Colors.text,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridItem: {
    width: '48%',
  },
  bcOptions: {
    gap: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
