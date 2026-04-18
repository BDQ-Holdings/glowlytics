import React, { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, Ellipse, G } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingChip } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, Spacing, BorderRadius, FontFamily, FontSize } from '../../src/constants/theme';

const SUPPLEMENT_OPTIONS = [
  'Vitamin D',
  'Vitamin C / Retinol',
  'Omega-3 / Fish Oil',
  'Collagen Peptides',
  'Biotin / Hair & Nail',
  'Zinc',
  'HRT (Estrogen)',
  'TRT (Testosterone)',
  'None of these',
  'Something else',
] as const;

function SupplementsIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="leafGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#2D8B6E" stopOpacity={0.8} />
          <Stop offset="60%" stopColor="#2D8B6E" stopOpacity={0.2} />
          <Stop offset="100%" stopColor="#2D8B6E" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="mossGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#7BAE7F" stopOpacity={0.7} />
          <Stop offset="55%" stopColor="#7BAE7F" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#7BAE7F" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coreLeaf" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="30%" stopColor="#7BAE7F" stopOpacity={0.6} />
          <Stop offset="100%" stopColor="#2D8B6E" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Background moss halo */}
      <Ellipse cx={100} cy={80} rx={75} ry={65} fill="url(#mossGlow)" />
      {/* Central leaf glow */}
      <Circle cx={100} cy={80} r={50} fill="url(#leafGlow)" />
      {/* Botanical leaf path 1 */}
      <Path
        d="M100 45 Q115 60 110 85 Q105 100 100 110 Q95 100 90 85 Q85 60 100 45Z"
        fill="#2D8B6E"
        fillOpacity={0.6}
      />
      {/* Botanical leaf path 2 */}
      <Path
        d="M75 70 Q90 55 100 75 Q95 90 80 85 Q70 80 75 70Z"
        fill="#7BAE7F"
        fillOpacity={0.5}
      />
      {/* Botanical leaf path 3 */}
      <Path
        d="M125 70 Q110 55 100 75 Q105 90 120 85 Q130 80 125 70Z"
        fill="#7BAE7F"
        fillOpacity={0.45}
      />
      {/* Stem vein */}
      <Path
        d="M100 50 L100 110"
        stroke="#2D8B6E"
        strokeWidth={1.5}
        strokeOpacity={0.4}
      />
      {/* Core bright point */}
      <Circle cx={100} cy={78} r={8} fill="url(#coreLeaf)" />
      <Circle cx={100} cy={78} r={3} fill="#7BAE7F" fillOpacity={0.8} />
      {/* Orbiting spore dots */}
      <Circle cx={65} cy={50} r={2.5} fill="#7BAE7F" fillOpacity={0.5} />
      <Circle cx={140} cy={55} r={2} fill="#2D8B6E" fillOpacity={0.4} />
      <Circle cx={60} cy={105} r={3} fill="#2D8B6E" fillOpacity={0.35} />
      <Circle cx={145} cy={100} r={2.5} fill="#7BAE7F" fillOpacity={0.3} />
      <Circle cx={80} cy={130} r={1.5} fill="#7BAE7F" fillOpacity={0.25} />
      <Circle cx={125} cy={125} r={2} fill="#2D8B6E" fillOpacity={0.3} />
    </Svg>
  );
}

export default function Supplements() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');

  const toggleOption = (option: string) => {
    if (option === 'None of these') {
      setSelected(['None of these']);
      setCustomText('');
      return;
    }

    // Deselect "None of these" when selecting anything else
    const withoutNone = selected.filter((s) => s !== 'None of these');

    if (withoutNone.includes(option)) {
      const next = withoutNone.filter((s) => s !== option);
      setSelected(next);
      if (option === 'Something else') {
        setCustomText('');
      }
    } else {
      setSelected([...withoutNone, option]);
    }
  };

  const handleContinue = () => {
    const supplements = selected
      .filter((s) => s !== 'Something else' && s !== 'None of these')
      .concat(customText.trim() ? [customText.trim()] : []);

    updateUser({ supplements: selected.includes('None of these') ? [] : supplements });

    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<SupplementsIllustration />}
      heading="Taking any supplements or hormones?"
      subtext="Things like retinol, omega-3, or HRT all show up in your skin over time. Knowing what you take makes your trends way more readable."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={selected.length === 0}
      secondaryLabel="Skip supplements"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.chipGrid}>
        {SUPPLEMENT_OPTIONS.map((option) => (
          <OnboardingChip
            key={option}
            label={option}
            selected={selected.includes(option)}
            onPress={() => toggleOption(option)}
          />
        ))}
      </View>
      {selected.includes('Something else') && (
        <TextInput
          style={styles.input}
          value={customText}
          onChangeText={(text) => setCustomText(text.slice(0, 60))}
          placeholder="What are you taking?"
          placeholderTextColor={Colors.textMuted}
          maxLength={60}
          autoFocus
        />
      )}
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.text,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
});
