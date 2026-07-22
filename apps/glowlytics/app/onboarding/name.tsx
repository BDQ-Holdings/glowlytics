import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { useStore } from '../../src/store/useStore';
import { FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';

/**
 * Onboarding — preferred name (hand-off S03).
 * Client-side only: the name feeds reveal copy and the notification preview,
 * never the backend profile.
 */
export default function Name() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const preferredName = useStore((s) => s.preferredName);
  const setPreferredName = useStore((s) => s.setPreferredName);
  const [value, setValue] = useState(preferredName ?? '');

  const handleContinue = () => {
    const trimmed = value.trim();
    setPreferredName(trimmed.length > 0 ? trimmed : null);
    advance();
  };

  return (
    <OnboardingTransition
      heading={'What should\nwe call you?'}
      headingSize={36}
      subtext="We'll use it gently — never in a notification you'd flinch at."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
      onSkip={advance}
    >
      <View style={styles.inputBlock}>
        <View style={[styles.inputRow, { borderBottomColor: P.accent }]}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Your name"
            placeholderTextColor={P.muted}
            selectionColor={P.accent}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            accessibilityLabel="Your name"
            style={[styles.input, { color: P.ink }]}
          />
        </View>
        <Text style={[styles.overline, { color: P.muted }]}>your name</Text>
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  inputBlock: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  inputRow: {
    borderBottomWidth: 1.5,
    paddingBottom: Spacing.sm,
  },
  input: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
    padding: 0,
  },
  overline: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: Spacing.sm + Spacing.xs,
  },
});
