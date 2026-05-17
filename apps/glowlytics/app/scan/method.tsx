import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';

const P = Glow.palette;

type Source = {
  lead: string;
  meta: string;
  weight: number;
  confidence: 'Strong' | 'Likely' | 'Estimated';
  why: string;
};

const SOURCES: Source[] = [
  {
    lead: "This morning's photo",
    meta: '16 zones · 8 measures',
    weight: 60,
    confidence: 'Strong',
    why: 'Clear lighting, face held still 2.4s.',
  },
  {
    lead: 'Your last 14 days',
    meta: '13 of 14 check-ins',
    weight: 30,
    confidence: 'Strong',
    why: 'Wednesday is your usual baseline.',
  },
  {
    lead: 'What you logged',
    meta: 'Sleep 7h 20m · Water 6/8',
    weight: 10,
    confidence: 'Likely',
    why: 'Sleep tracked from Apple Health.',
  },
];

export default function MethodScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xs,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Feather name="arrow-left" size={20} color={P.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>How we read this</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.intro}>
          <Animated.Text
            entering={FadeInUp.duration(700).easing(Easing.out(Easing.cubic))}
            style={styles.title}
          >
            Three sources, one read.
          </Animated.Text>
          <Animated.Text
            entering={FadeInUp.delay(120).duration(700).easing(Easing.out(Easing.cubic))}
            style={styles.subtitle}
          >
            Today's score blends your photo, the last 14 mornings, and what you logged.
            We tell you how sure we are, every time.
          </Animated.Text>
        </View>

        <View style={styles.sourceList}>
          {SOURCES.map((s, idx) => (
            <Animated.View
              key={s.lead}
              entering={FadeInDown.delay(100 * idx + 220)
                .duration(560)
                .easing(Easing.out(Easing.cubic))}
              style={styles.sourceCard}
            >
              <View style={styles.sourceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceLead}>{s.lead}</Text>
                  <Text style={styles.sourceMeta}>{s.meta}</Text>
                </View>
                <View style={styles.weightCol}>
                  <View style={styles.weightRow}>
                    <Text style={styles.weightNum}>{s.weight}</Text>
                    <Text style={styles.weightPct}>%</Text>
                  </View>
                  <Text style={styles.confLabel}>{s.confidence}</Text>
                </View>
              </View>

              <View style={styles.weightTrack}>
                <View style={[styles.weightFill, { width: `${s.weight}%` }]} />
              </View>

              <Text style={styles.why}>{s.why}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerNote}>We never share your photos. They live on your phone.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
    color: P.ink,
  },
  intro: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 26,
    color: P.ink,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    color: P.muted,
    marginTop: 10,
    lineHeight: 20,
  },
  sourceList: {
    marginTop: 20,
    paddingHorizontal: 16,
    gap: 8,
  },
  sourceCard: {
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 16,
  },
  sourceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  sourceLead: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: P.ink,
  },
  sourceMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },
  weightCol: {
    alignItems: 'flex-end',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  weightNum: {
    fontFamily: FontFamily.sans,
    fontSize: 18,
    color: P.ink,
    lineHeight: 18,
  },
  weightPct: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
  },
  confLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: 9,
    color: P.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  weightTrack: {
    marginTop: 12,
    height: 4,
    backgroundColor: P.bg,
    borderRadius: 999,
    overflow: 'hidden',
  },
  weightFill: {
    height: '100%',
    backgroundColor: P.accent,
    borderRadius: 999,
  },
  why: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 11,
    color: P.muted,
    marginTop: 10,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  footerNote: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
