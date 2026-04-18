import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';

type LocationMode = 'auto' | 'manual' | null;

function LocationIllustration() {
  return (
    <Svg width={180} height={160} viewBox="0 0 180 160">
      <Defs>
        <RadialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3B7FC4" stopOpacity={0.4} />
          <Stop offset="60%" stopColor="#3B7FC4" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#3B7FC4" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="tealPin" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.7} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Topographic rings */}
      <Ellipse cx={90} cy={80} rx={72} ry={55} fill="none" stroke="#3B7FC4" strokeWidth={0.7} strokeOpacity={0.12} />
      <Ellipse cx={85} cy={78} rx={58} ry={44} fill="none" stroke="#3B7FC4" strokeWidth={0.8} strokeOpacity={0.16} />
      <Ellipse cx={88} cy={82} rx={44} ry={33} fill="none" stroke="#3A9E8F" strokeWidth={0.9} strokeOpacity={0.2} />
      <Ellipse cx={92} cy={79} rx={30} ry={22} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.25} />
      <Ellipse cx={90} cy={80} rx={16} ry={12} fill="none" stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.3} />
      {/* Center glow */}
      <Circle cx={90} cy={80} r={20} fill="url(#mapGlow)" />
      {/* Location pin */}
      <Circle cx={90} cy={76} r={6} fill="url(#tealPin)" />
      <Circle cx={90} cy={76} r={3} fill="#3A9E8F" fillOpacity={0.8} />
      <Path d="M90 82 L87 88 L90 86 L93 88 Z" fill="#3A9E8F" fillOpacity={0.6} />
      {/* Grid dots */}
      <Circle cx={40} cy={50} r={1.5} fill="#3B7FC4" fillOpacity={0.2} />
      <Circle cx={150} cy={55} r={1.5} fill="#3B7FC4" fillOpacity={0.2} />
      <Circle cx={35} cy={110} r={1.5} fill="#3A9E8F" fillOpacity={0.15} />
      <Circle cx={145} cy={105} r={1.5} fill="#3A9E8F" fillOpacity={0.15} />
      <Circle cx={60} cy={35} r={1} fill="#3B7FC4" fillOpacity={0.15} />
      <Circle cx={120} cy={130} r={1} fill="#3B7FC4" fillOpacity={0.15} />
    </Svg>
  );
}

export default function LocationScreen() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [mode, setMode] = useState<LocationMode>(null);
  const [locationValue, setLocationValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleAutoLocation = useCallback(async () => {
    setMode('auto');
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Location permission was not granted. You can enter your region manually instead.',
        );
        setMode('manual');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });

      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      if (geocode) {
        const region = [geocode.city, geocode.region].filter(Boolean).join(', ');
        setLocationValue(region || `${loc.coords.latitude.toFixed(1)}, ${loc.coords.longitude.toFixed(1)}`);
        setConfirmed(true);
      } else {
        setLocationValue(`${loc.coords.latitude.toFixed(1)}, ${loc.coords.longitude.toFixed(1)}`);
        setConfirmed(true);
      }
    } catch (err) {
      Alert.alert(
        'Location unavailable',
        'We could not determine your location. Please enter your region manually.',
      );
      setMode('manual');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualMode = () => {
    setMode('manual');
    setLocationValue('');
    setConfirmed(false);
  };

  const handleZipChange = (text: string) => {
    setLocationValue(text);
    setConfirmed(text.trim().length >= 3);
  };

  const handleContinue = () => {
    if (!confirmed || !locationValue.trim()) return;
    updateUser({ location_coarse: locationValue.trim() });
    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<LocationIllustration />}
      heading="Where do you live?"
      subtext="UV and humidity vary a lot by region, and both show up in your skin. We only store your general area."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!confirmed}
      secondaryLabel="Skip location"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.options}>
        <OnboardingOptionCard
          label="Use my location"
          description={
            mode === 'auto' && loading
              ? 'Detecting...'
              : mode === 'auto' && confirmed
                ? locationValue
                : 'We only store your region, never precise coordinates'
          }
          selected={mode === 'auto'}
          onPress={handleAutoLocation}
        />
        <OnboardingOptionCard
          label="Enter my region"
          description="Type a ZIP code or city name"
          selected={mode === 'manual'}
          onPress={handleManualMode}
        />
      </View>

      {mode === 'auto' && loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} size="small" />
        </View>
      )}

      {mode === 'manual' && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={locationValue}
            onChangeText={handleZipChange}
            placeholder="ZIP code or city"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            keyboardType="default"
            returnKeyType="done"
            autoCorrect={false}
          />
        </View>
      )}

      <Text style={styles.privacy}>
        Only your region is stored. Precise location is never saved.
      </Text>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: Spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  inputContainer: {
    marginTop: Spacing.md,
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
  privacy: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 16,
  },
});
