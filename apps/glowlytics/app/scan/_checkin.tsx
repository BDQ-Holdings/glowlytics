import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AtmosphereScreen } from '../../src/components/AtmosphereScreen';
import { Colors, FontSize, FontFamily, Spacing, BorderRadius } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { OptionSelector } from '../../src/components/OptionSelector';
import { useStore } from '../../src/store/useStore';
import { getEstimatedCycleDay } from '../../src/utils/cycleDay';
import { trackEvent } from '../../src/services/analytics';

export default function DailyCheckin() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    inflammation: string;
    pigmentation: string;
    texture: string;
    photoUri: string;
  }>();

  const user = useStore((s) => s.user);
  const dailyRecords = useStore((s) => s.dailyRecords);

  const [sunscreen, setSunscreen] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<string | null>(null);
  const [periodAccurate, setPeriodAccurate] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [sleep, setSleep] = useState<string | null>(null);
  const [stress, setStress] = useState<string | null>(null);
  const [drinks, setDrinks] = useState<string | null>(null);

  // Auto-expand optional context for first 3 scans as a nudge
  useEffect(() => {
    if (dailyRecords.length < 3) {
      setShowContext(true);
    }
  }, []);

  const estimatedCycleDay = useMemo(() => getEstimatedCycleDay(user) ?? null, [user]);

  const canContinue = sunscreen !== null && newProduct !== null;

  const handleSeeResults = () => {
    trackEvent('scan_checkin_submitted', {
      sunscreen: sunscreen === 'yes',
      new_product: newProduct === 'yes',
      sleep_quality: sleep,
      stress_level: stress,
    });
    router.replace({
      pathname: '/scan/analyzing',
      params: {
        inflammation: params.inflammation || '',
        pigmentation: params.pigmentation || '',
        texture: params.texture || '',
        photoUri: params.photoUri || '',
        sunscreen: sunscreen || '',
        newProduct: newProduct || '',
        periodAccurate: periodAccurate || '',
        sleep: sleep || '',
        stress: stress || '',
        drinks: drinks || '',
      },
    });
  };

  return (
    <AtmosphereScreen>
      <Animated.View entering={FadeInDown.duration(400).delay(0)}>
        <Text style={styles.title}>Quick check-in</Text>
        <Text style={styles.subtitle}>A few quick taps before your results.</Text>
      </Animated.View>

      {/* Sunscreen */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.sectionLabel}>Sunscreen today?</Text>
        <OptionSelector
          options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          selected={sunscreen}
          onSelect={setSunscreen}
          horizontal
        />
      </Animated.View>

      {/* New product */}
      <Animated.View entering={FadeInDown.duration(400).delay(200)}>
        <Text style={styles.sectionLabel}>Any new product since yesterday?</Text>
        <OptionSelector
          options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          selected={newProduct}
          onSelect={setNewProduct}
          horizontal
        />
      </Animated.View>

      {/* Period status */}
      {user?.period_applicable === 'yes' && estimatedCycleDay && (
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Text style={styles.sectionLabel}>Period status</Text>
          <View style={styles.cycleDayCard}>
            <Text style={styles.cycleDayText}>
              Estimated: Day {estimatedCycleDay}
            </Text>
            <OptionSelector
              options={[
                { label: 'Accurate', value: 'accurate' },
                { label: 'Not accurate', value: 'not_accurate' },
              ]}
              selected={periodAccurate}
              onSelect={setPeriodAccurate}
              horizontal
            />
          </View>
        </Animated.View>
      )}

      {/* Optional context */}
      {!showContext ? (
        <Animated.View entering={FadeInDown.duration(400).delay(400)}>
          <TouchableOpacity
            style={styles.contextToggle}
            onPress={() => setShowContext(true)}
          >
            <Text style={styles.contextToggleText}>Add context (optional)</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.duration(400).delay(400)} style={styles.contextSection}>
          <Text style={styles.sectionLabel}>Sleep (yesterday)</Text>
          <OptionSelector
            options={[
              { label: 'Poor', value: 'poor' },
              { label: 'OK', value: 'ok' },
              { label: 'Great', value: 'great' },
            ]}
            selected={sleep}
            onSelect={setSleep}
            horizontal
          />

          <Text style={styles.sectionLabel}>Stress (yesterday)</Text>
          <OptionSelector
            options={[
              { label: 'Low', value: 'low' },
              { label: 'Med', value: 'med' },
              { label: 'High', value: 'high' },
            ]}
            selected={stress}
            onSelect={setStress}
            horizontal
          />

          <Text style={styles.sectionLabel}>Drinks yesterday</Text>
          <OptionSelector
            options={[
              { label: '0', value: '0' },
              { label: '1-2', value: '1-2' },
              { label: '3+', value: '3+' },
            ]}
            selected={drinks}
            onSelect={setDrinks}
            horizontal
          />
        </Animated.View>
      )}

      <View style={styles.bottom}>
        <Button
          title="See results"
          onPress={handleSeeResults}
          disabled={!canContinue}
        />
      </View>
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.sansBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cycleDayCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cycleDayText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemiBold,
  },
  contextToggle: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  contextToggleText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  contextSection: {
    marginTop: Spacing.md,
  },
  bottom: {
    marginTop: Spacing.xl,
  },
});
