/**
 * Bone-structure capture flow.
 *
 * On TrueDepth devices this drives a brief ARKit FaceAnchor capture.
 * On other devices it returns a deformed canonical mesh keyed by the user's
 * detected facial proportions. The viewer renders alongside the capture +
 * analyze stages, with the mesh progressively "forming" via a reveal tween
 * so the user sees their face being mapped rather than just a spinner.
 *
 * After capture, the mesh is POSTed to /api/vision/bone-structure and the
 * result is attached to the latest scan via `attachBoneStructure`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { BoneCaptureSexPrompt } from '../../src/components/BoneCaptureSexPrompt';
import { Button } from '../../src/components/Button';
import { Face3DViewer } from '../../src/components/Face3DViewer';
import { buildCanonicalMesh } from '../../src/services/canonicalFaceMesh';
import { captureFaceMesh } from '../../src/services/faceMeshCapture';
import { analyzeBoneStructure } from '../../src/services/boneStructure';
import { useStore } from '../../src/store/useStore';
import { HARMONY_ACCENT } from '../../src/constants/boneStructure';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import type { BiologicalSex } from '../../src/types';

type Stage = 'idle' | 'capturing' | 'analysing' | 'done' | 'error';

const STAGE_COPY: Record<Stage, { title: string; subtitle: string }> = {
  idle:       { title: 'Preparing capture',           subtitle: 'Stand by. We’re initializing the sensors.' },
  capturing:  { title: 'Mapping your facial geometry', subtitle: 'Stay still for a moment. We’re sampling 50 named anatomical landmarks across your face.' },
  analysing:  { title: 'Composing your Harmony score', subtitle: 'Computing canthal tilt, mandibular contour, midface balance, and what to do about each.' },
  done:       { title: 'All done',                     subtitle: 'Taking you to the results.' },
  error:      { title: 'Something went wrong',         subtitle: 'We couldn’t finish the analysis. Try again in a moment.' },
};

// Reveal animation: the mesh fades in over the capture + analyse window.
// Tuned so the head silhouette is clearly forming by the time the analyse
// call typically completes (~600ms) and is fully built at ~1.4s.
const STAGE_TARGET_REVEAL: Record<Stage, number> = {
  idle:      0.0,
  capturing: 0.45,
  analysing: 0.85,
  done:      1.0,
  error:     1.0,
};

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export default function BoneCapture() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { dailyId } = useLocalSearchParams<{ dailyId?: string }>();
  const sex = useStore((s) => s.user?.sex);
  const updateUser = useStore((s) => s.updateUser);
  const attachBoneStructure = useStore((s) => s.attachBoneStructure);

  // Gate the auto-run on a known sex value. If the user has explicitly chosen
  // anything (including 'prefer_not' or 'other') we don't ask again.
  const needsSexPrompt = sex == null;

  const [stage, setStage] = useState<Stage>('idle');
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sexPromptVisible, setSexPromptVisible] = useState(needsSexPrompt);
  // The choice the user just made — captured in-component so the analyse call
  // can pass it even before the store update has hit Postgres.
  const [pendingSexChoice, setPendingSexChoice] = useState<BiologicalSex | null>(null);
  const ranRef = useRef(false);

  // Drive the reveal progress toward the current stage's target. We use a
  // RAF loop with a soft cubic-out lerp so transitions don't feel mechanical.
  const targetRef = useRef(0);
  useEffect(() => {
    targetRef.current = STAGE_TARGET_REVEAL[stage];
    let raf = 0;
    let lastT = Date.now();
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.12, (now - lastT) / 1000); // seconds, capped
      lastT = now;
      setReveal((prev) => {
        const delta = targetRef.current - prev;
        if (Math.abs(delta) < 0.001) return targetRef.current;
        // Approach target at ~3.5/s (smooth, ~0.6s to close most of the gap)
        return prev + delta * Math.min(1, dt * 3.5);
      });
      if (Math.abs(targetRef.current - reveal) > 0.001 || stage === 'capturing' || stage === 'analysing') {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // Apply an `easeOutCubic` curve on top of the linearly-approached reveal so
  // the mesh appears with a confident "land" rather than a constant trickle.
  const displayedReveal = easeOutCubic(reveal);

  useEffect(() => {
    // Hold off on auto-run until the sex prompt resolves (if it was shown).
    if (sexPromptVisible) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        // Haptic choreography:
        //   Light  — "we’re taking the picture"  (stage = capturing)
        //   Medium — "we got it, now thinking"   (stage = analysing)
        //   Selection — quiet tap on the linger before navigation
        //   Success — landed on the result      (stage = done)
        // Failures all fall through to the Error notification in catch.
        setStage('capturing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const captured = await captureFaceMesh();
        if (cancelled) return;

        setStage('analysing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        // Effective sex for this scan — prefer the just-picked choice, else
        // the stored profile value, else undefined (server uses unisex).
        const effectiveSex = pendingSexChoice ?? sex;
        const sexOverride = effectiveSex === 'male' || effectiveSex === 'female' ? effectiveSex : undefined;
        const result = await analyzeBoneStructure({
          mesh: captured.mesh,
          dailyId,
          sexOverride,
        });
        if (cancelled) return;

        if (dailyId) attachBoneStructure(dailyId, result);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        setStage('done');
        // Linger briefly on the fully-formed mesh before navigating —
        // gives the user a visual "complete" beat. Quiet selection tick
        // right before nav so the transition feels intentional.
        setTimeout(() => {
          if (!cancelled) {
            Haptics.selectionAsync().catch(() => {});
            router.replace({ pathname: '/scan/bone-results', params: { dailyId: dailyId || '' } });
          }
        }, 650);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStage('error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    })();

    return () => { cancelled = true; };
  }, [dailyId, sexPromptVisible]);

  const handleSexChoice = (choice: BiologicalSex) => {
    setPendingSexChoice(choice);
    setSexPromptVisible(false);
    // Persist so we don't ask again. updateUser is a no-op when the user
    // record hasn't been created yet (still in onboarding) — the in-component
    // pendingSexChoice covers that case for the analyse call.
    try { updateUser({ sex: choice }); } catch { /* no-op */ }
  };

  const copy = STAGE_COPY[stage];
  const viewerSize = Math.min(320, screenW - Spacing.xl * 2);
  const ringSize = viewerSize + 40;
  const isDone = stage === 'done';
  const isError = stage === 'error';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.container,
          { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {/* Hero — the mesh forming, wrapped in a stage-driven progress ring */}
        <View style={[styles.heroWrap, { width: ringSize, height: ringSize }]}>
          <View style={styles.heroGlow} />
          <CaptureProgressRing
            size={ringSize}
            progress={displayedReveal}
            done={isDone}
            error={isError}
          />
          <View style={styles.meshSlot}>
            <Face3DViewer
              vertices={buildCanonicalMesh()}
              source="canonical"
              mode="anatomy"
              size={viewerSize}
              revealProgress={displayedReveal}
            />
          </View>
          {isDone && (
            <Animated.View
              entering={ZoomIn.duration(360)}
              style={styles.doneBadge}
              pointerEvents="none"
            >
              <Feather name="check" size={18} color={Colors.background} />
            </Animated.View>
          )}
        </View>

        {/* Stage copy — crossfades on stage change. key={stage} remounts the
            node so entering+exiting both fire instead of an abrupt swap. */}
        <Animated.View
          key={stage}
          entering={FadeInUp.duration(380)}
          exiting={FadeOut.duration(220)}
          style={styles.copyWrap}
        >
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </Animated.View>

        {/* Stage chips — gives a sense of "what step are we on" */}
        <Animated.View entering={FadeIn.duration(450).delay(200)} style={styles.stagesRow}>
          <StageChip
            label="Capture"
            icon="camera"
            active={stage === 'capturing'}
            done={stage === 'analysing' || stage === 'done'}
          />
          <View style={styles.stageSep} />
          <StageChip
            label="Analyse"
            icon="cpu"
            active={stage === 'analysing'}
            done={stage === 'done'}
          />
          <View style={styles.stageSep} />
          <StageChip
            label="Compose"
            icon="check"
            active={stage === 'done'}
            done={stage === 'done'}
          />
        </Animated.View>

        {stage === 'error' && (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.errorWrap}>
            <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
            <Button title="Back" onPress={() => router.back()} />
          </Animated.View>
        )}
      </View>

      {/* One-time sex baseline prompt — gates the auto-run useEffect above. */}
      <BoneCaptureSexPrompt visible={sexPromptVisible} onChoose={handleSexChoice} />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CaptureProgressRing — thin SVG ring around the mesh that fills as the
// capture+analyse stages progress. Tinted by state: HARMONY_ACCENT while
// in flight, Colors.success on done, Colors.error on error. Uses the same
// `progress` value (0..1) that drives the mesh reveal so visual + ring
// stay in lock-step.
// ───────────────────────────────────────────────────────────────────────

interface RingProps {
  size: number;
  progress: number;
  done: boolean;
  error: boolean;
}

const CaptureProgressRing: React.FC<RingProps> = ({ size, progress, done, error }) => {
  const stroke = 2.4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Land at full when done; on error fade the ring opacity instead of filling.
  const filled = done ? 1 : Math.max(0, Math.min(1, progress));
  const accent = error ? Colors.error : done ? Colors.success : HARMONY_ACCENT;
  // SVG stroke-dasharray starts the ring at 3 o'clock and goes clockwise.
  // We rotate -90° so it starts at 12 o'clock like a standard progress dial.
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgLG id="captureRingFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <Stop offset="100%" stopColor={accent} stopOpacity="1" />
          </SvgLG>
        </Defs>
        {/* Track */}
        <SvgCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={accent}
          strokeOpacity={0.12}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Fill */}
        <SvgCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#captureRingFill)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - filled)}
          fill="none"
        />
      </Svg>
    </View>
  );
};

// ───────────────────────────────────────────────────────────────────────
// StageChip — leading-icon + label pill with a subtle breathing dot when
// the chip is the active stage. Done chips show the check icon swap.
// ───────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  done: boolean;
}

const StageChip: React.FC<ChipProps> = ({ label, icon, active, done }) => {
  const color = done ? Colors.success : active ? HARMONY_ACCENT : Colors.textDim;
  // Soft pulse on the active dot to signal "working on this".
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!active) { pulse.value = 1; return; }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [active]);
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.55 + (pulse.value - 1) * 0.9,
  }));

  return (
    <View style={[styles.chip, (active || done) && styles.chipActive]}>
      <Feather name={done ? 'check' : icon} size={12} color={color} />
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
      {active && !done && (
        <Animated.View style={[styles.chipDot, { backgroundColor: HARMONY_ACCENT }, dotStyle]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    position: 'relative',
  },
  meshSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.success,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  heroGlow: {
    position: 'absolute',
    width: 320, height: 320,
    borderRadius: 160,
    backgroundColor: HARMONY_ACCENT + '14',
  },
  copyWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  title: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  stagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.surface,
  },
  chipActive: {
    backgroundColor: Glow.palette.glow,
  },
  chipLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  chipDot: {
    width: 5, height: 5,
    borderRadius: 3,
    marginLeft: 2,
  },
  stageSep: {
    width: 12,
    height: 1,
    backgroundColor: Colors.borderStrong,
    opacity: 0.4,
  },
  errorWrap: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    color: Colors.error,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
