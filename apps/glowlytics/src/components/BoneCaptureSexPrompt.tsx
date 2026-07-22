/**
 * BoneCaptureSexPrompt — one-time modal asked before the first bone-capture
 * if the user's biological sex hasn't been recorded.
 *
 * Why: three Harmony metrics use sex-aware ideals — gonial_angle,
 * nasolabial_angle, brow_position. When `user.sex` is unset we silently
 * fall back to unisex midpoints, which is fine but loses a meaningful
 * chunk of analytic accuracy (men and women have markedly different
 * mandibular angle, brow rim, and columella norms).
 *
 * The prompt only appears once per user: if they pick Male or Female
 * we persist via updateUser({ sex }); if they Skip, we record
 * `prefer_not` so we never ask again — same effect as the existing
 * onboarding option for users who don't want to specify.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Button } from './Button';
import { HARMONY_ACCENT } from '../constants/boneStructure';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';
import type { BiologicalSex } from '../types';

interface Props {
  visible: boolean;
  /** Called when the user picks an option (or skips). 'prefer_not' on Skip. */
  onChoose: (sex: BiologicalSex) => void;
}

export const BoneCaptureSexPrompt: React.FC<Props> = ({ visible, onChoose }) => {
  const { width: screenW } = useWindowDimensions();
  const cardWidth = Math.min(360, screenW - Spacing.xl * 2);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(180)} style={styles.scrim}>
        <Animated.View entering={FadeIn.duration(380)} style={[styles.card, { width: cardWidth }]}>
          <LinearGradient
            colors={[Glow.palette.glow, Glow.palette.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.inner}>
            <View style={styles.iconBubble}>
              <Feather name="user" size={20} color={HARMONY_ACCENT} />
            </View>
            <Text style={styles.eyebrow}>Quick question</Text>
            <Text style={styles.title}>Which baseline should we use?</Text>
            <Text style={styles.body}>
              A few measurements (jaw angle, brow position, columella) have meaningfully different healthy ranges by sex. Tell us which one to compare you to.
            </Text>

            <View style={styles.choices}>
              <Pressable
                style={styles.choiceButton}
                onPress={() => onChoose('male')}
                accessibilityLabel="Compare to male reference range"
              >
                <Feather name="user" size={18} color={HARMONY_ACCENT} />
                <Text style={styles.choiceLabel}>Male</Text>
              </Pressable>
              <Pressable
                style={styles.choiceButton}
                onPress={() => onChoose('female')}
                accessibilityLabel="Compare to female reference range"
              >
                <Feather name="user" size={18} color={HARMONY_ACCENT} />
                <Text style={styles.choiceLabel}>Female</Text>
              </Pressable>
            </View>

            <Button
              title="Skip and use a unisex baseline"
              variant="secondary"
              onPress={() => onChoose('prefer_not')}
              size="lg"
            />

            <Text style={styles.footnote}>
              We don't ask again. You can change this any time in your profile.
            </Text>
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
  inner: {
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
  choices: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginBottom: Spacing.xs,
  },
  choiceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: HARMONY_ACCENT + '18',
    borderWidth: 1,
    borderColor: HARMONY_ACCENT + '38',
  },
  choiceLabel: {
    color: HARMONY_ACCENT,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  footnote: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
