import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { localDateStr } from '../../src/utils/localDate';

const CYCLE_LENGTH_OPTIONS = ['21-25', '26-30', '31+', 'Not sure'] as const;
type CycleLengthOption = typeof CYCLE_LENGTH_OPTIONS[number];

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
  const P = Glow.palette;
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
      heading={'A little more\nabout your cycle.'}
      subtext="Rough numbers are fine. We use this to estimate cycle timing, not to log it precisely."
      primaryLabel="Got it"
      primaryOnPress={handleContinue}
      onSkip={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.sectionStack}>
        {/* Last period start — S03 underline treatment */}
        <View>
          <Pressable
            disabled={Platform.OS === 'ios'}
            onPress={() => setShowAndroidPicker(true)}
            accessibilityRole={Platform.OS === 'ios' ? undefined : 'button'}
            accessibilityLabel="Change last period start date"
          >
            <View style={[styles.underline, { borderBottomColor: P.accent }]}>
              <Text style={[styles.dateValue, { color: lastPeriodDate ? P.ink : P.muted }]}>
                {formatSelectedDate(lastPeriodDate)}
              </Text>
            </View>
          </Pressable>
          <Text style={[styles.fieldLabel, { color: P.muted }]}>Last period start</Text>
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
              textColor={P.ink}
              themeVariant="light"
              style={styles.datePicker}
            />
          )}
        </View>

        {/* Typical cycle length — S09 grid */}
        <View>
          <Text style={[styles.fieldLabel, styles.fieldLabelTop, { color: P.muted }]}>Typical cycle length</Text>
          <View style={styles.grid}>
            {CYCLE_LENGTH_OPTIONS.map((opt) => {
              const on = cycleLength === opt;
              return (
                <View key={opt} style={styles.gridCellWrap}>
                  <TouchableOpacity
                    onPress={() => setCycleLength(opt)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={opt}
                    style={[
                      styles.gridCell,
                      { backgroundColor: on ? P.ink : P.surface, borderColor: on ? P.ink : P.glow },
                    ]}
                  >
                    <Text style={[styles.gridLabel, { color: on ? P.surface : P.ink }]}>{opt}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: Spacing.xl,
  },
  underline: {
    borderBottomWidth: 1.5,
    paddingBottom: Spacing.sm,
  },
  dateValue: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xxl,
  },
  fieldLabel: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  fieldLabelTop: {
    marginTop: 0,
    marginBottom: Spacing.md,
  },
  datePicker: {
    alignSelf: 'center',
    width: 280,
    marginTop: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridCellWrap: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  gridCell: {
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
  },
});
