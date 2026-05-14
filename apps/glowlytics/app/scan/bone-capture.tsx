/**
 * Bone-structure capture flow.
 *
 * On TrueDepth devices this drives a brief ARKit FaceAnchor capture.
 * On other devices it returns a deformed canonical mesh keyed by the user's
 * detected facial proportions (currently a coarse jaw / cheek / chin
 * heuristic — replace with a richer 2D-landmark sampler when available).
 *
 * After capture, the mesh is POSTed to /api/vision/bone-structure and the
 * result is attached to the latest scan via `attachBoneStructure`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Button } from '../../src/components/Button';
import { captureFaceMesh } from '../../src/services/faceMeshCapture';
import { analyzeBoneStructure } from '../../src/services/boneStructure';
import { useStore } from '../../src/store/useStore';
import { Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';

type Stage = 'idle' | 'capturing' | 'analysing' | 'done' | 'error';

export default function BoneCapture() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dailyId } = useLocalSearchParams<{ dailyId?: string }>();
  const sex = useStore((s) => s.user?.sex);
  const attachBoneStructure = useStore((s) => s.attachBoneStructure);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        setStage('capturing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const captured = await captureFaceMesh();
        if (cancelled) return;

        setStage('analysing');
        const sexOverride = sex === 'male' || sex === 'female' ? sex : undefined;
        const result = await analyzeBoneStructure({
          mesh: captured.mesh,
          dailyId,
          sexOverride,
        });
        if (cancelled) return;

        if (dailyId) attachBoneStructure(dailyId, result);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        setStage('done');
        router.replace({ pathname: '/scan/bone-results', params: { dailyId: dailyId || '' } });
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStage('error');
      }
    })();

    return () => { cancelled = true; };
  }, [dailyId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl }]}>
      <View style={styles.center}>
        {stage !== 'error' && <ActivityIndicator size="large" color={Glow.palette.accent} />}
        <Text style={styles.title}>
          {stage === 'capturing' ? 'Capturing your face mesh' :
           stage === 'analysing' ? 'Analysing facial architecture' :
           stage === 'done' ? 'All done' :
           stage === 'error' ? 'Something went wrong' :
           'Preparing capture'}
        </Text>
        {stage === 'capturing' && (
          <Text style={styles.subtitle}>Stay still for a moment. We're sampling your face's geometry.</Text>
        )}
        {stage === 'analysing' && (
          <Text style={styles.subtitle}>Computing your Harmony score and personalised recommendations.</Text>
        )}
        {stage === 'error' && (
          <>
            <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
            <Button title="Back" onPress={() => router.back()} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Glow.palette.bg,
    justifyContent: 'center',
  },
  center: { alignItems: 'center', gap: Spacing.lg },
  title: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    color: Colors.error,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
