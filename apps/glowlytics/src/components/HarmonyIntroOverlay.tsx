/**
 * HarmonyIntroOverlay — one-time 2-card explainer shown on first open of
 * the bone-results screen. After the user dismisses (or hits "Got it"),
 * an AsyncStorage flag is set so the overlay never appears again.
 *
 * Card 1 — "What is Harmony?" frames the composite score.
 * Card 2 — "How to read your face" frames the radial chart + 3-tier
 *           intervention ladder.
 *
 * The overlay sits *above* the carousel so it can't be missed, but a
 * "Skip intro" affordance is available in case the user already gets it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Button } from './Button';
import { HARMONY_ACCENT } from '../constants/boneStructure';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';

const SEEN_KEY = 'glowlytics:harmony-intro-seen-v1';

interface Card {
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof Feather.glyphMap;
}

const CARDS: Card[] = [
  {
    eyebrow: 'What is Harmony?',
    title: 'A single read on your facial architecture',
    body: 'Harmony is a 0–100 composite that weighs six aspects of your face: symmetry, the eye region, the jaw, midface, nose, and brow. It’s built from 16 anatomic measurements we sample from a 3D mesh of your face. Not a beauty rating, just a snapshot of structure.',
    icon: 'hexagon',
  },
  {
    eyebrow: 'How to read your face',
    title: 'The petal chart + three intervention tiers',
    body: 'A balanced face shows a regular hexagon on the radial chart. A pulled-in corner is the domain dragging your score. Each finding maps to three tiers of what you can do: Lifestyle (free, reversible), Pharma (topical/systemic), Procedural (board-certified clinician only).',
    icon: 'compass',
  },
];

interface Props {
  /** When true, force the overlay to show even if seen flag is set (debug). */
  force?: boolean;
}

/** Public reset helper — wired into Account / debug flows later if needed. */
export async function resetHarmonyIntro(): Promise<void> {
  try { await AsyncStorage.removeItem(SEEN_KEY); } catch { /* no-op */ }
}

export const HarmonyIntroOverlay: React.FC<Props> = ({ force = false }) => {
  const { width: screenW } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (force) {
          if (!cancelled) setVisible(true);
          return;
        }
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!cancelled && seen !== 'true') setVisible(true);
      } catch {
        if (!cancelled) setVisible(true);  // fail-open: prefer showing intro over silent miss
      }
    })();
    return () => { cancelled = true; };
  }, [force]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    try { await AsyncStorage.setItem(SEEN_KEY, 'true'); } catch { /* no-op */ }
  }, []);

  const onPrimary = useCallback(() => {
    if (cardIdx < CARDS.length - 1) setCardIdx((i) => i + 1);
    else void dismiss();
  }, [cardIdx, dismiss]);

  if (!visible) return null;
  const card = CARDS[cardIdx];
  const isLast = cardIdx === CARDS.length - 1;
  const cardWidth = Math.min(360, screenW - Spacing.xl * 2);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(220)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss intro" />
        <Animated.View
          key={cardIdx}
          entering={FadeIn.duration(360)}
          style={[styles.card, { width: cardWidth }]}
        >
          <LinearGradient
            colors={[Glow.palette.glow, Glow.palette.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardInner}>
            <View style={styles.iconBubble}>
              <Feather name={card.icon} size={20} color={HARMONY_ACCENT} />
            </View>
            <Text style={styles.eyebrow}>{card.eyebrow}</Text>
            <Text style={styles.title}>{card.title}</Text>
            <Text style={styles.body}>{card.body}</Text>

            <View style={styles.dotsRow}>
              {CARDS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === cardIdx && styles.dotActive,
                  ]}
                />
              ))}
            </View>

            <Button
              title={isLast ? 'Got it' : 'Next'}
              onPress={onPrimary}
              size="lg"
            />
            {!isLast && (
              <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Skip intro" style={styles.skip}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 24, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: HARMONY_ACCENT + '38',
  },
  cardInner: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBubble: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: HARMONY_ACCENT + '22',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  eyebrow: {
    color: HARMONY_ACCENT,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  title: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    textAlign: 'center',
    lineHeight: 28,
  },
  body: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textDim,
    opacity: 0.45,
  },
  dotActive: {
    backgroundColor: HARMONY_ACCENT,
    opacity: 1,
    width: 18,
    borderRadius: 3,
  },
  skip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  skipText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
});
