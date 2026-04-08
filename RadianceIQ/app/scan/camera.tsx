import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, BorderRadius, Spacing } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { CameraFaceMesh } from '../../src/components/CameraFaceMesh';
import { DirectionIndicators } from '../../src/components/DirectionIndicators';
import { LesionOverlay } from '../../src/components/LesionOverlay';
import { useFaceTracking } from '../../src/hooks/useFaceTracking';
import { getDirections } from '../../src/services/faceTracking';
import type { DetectedFace } from '../../src/services/faceTracking';
import { checkPhotoQuality } from '../../src/services/photoQuality';
import { useStore } from '../../src/store/useStore';
import { gateWithPaywall } from '../../src/services/subscription';
import { trackEvent } from '../../src/services/analytics';
import { env } from '../../src/config/env';
import { LesionTracker } from '../../src/services/lesionTracker';
import type { DetectedLesion } from '../../src/types';

// Lazy import — onnxruntime-react-native crashes in Expo Go.
type LesionModule = typeof import('../../src/services/onDeviceLesionDetection');
let _lesionMod: Awaited<LesionModule> | null = null;
const loadLesionModule = async (): Promise<Awaited<LesionModule> | null> => {
  if (_lesionMod) return _lesionMod;
  try {
    _lesionMod = await import('../../src/services/onDeviceLesionDetection');
    return _lesionMod;
  } catch (err) {
    if (__DEV__) console.warn('[Camera] Lesion detection module unavailable:', err);
    return null;
  }
};

export default function CameraScreen() {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const router = useRouter();

  // VisionCamera hooks
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const protocol = useStore((s) => s.protocol);
  const canPerformScan = useStore((s) => s.canPerformScan);

  // Defense-in-depth: present paywall if scan not allowed
  useEffect(() => {
    trackEvent('scan_started', { subscription_tier: useStore.getState().subscription.tier });
    if (!canPerformScan()) {
      (async () => {
        setPaywallVisible(true);
        const allowed = await gateWithPaywall();
        setPaywallVisible(false);
        if (!allowed) router.back();
      })();
    }
  }, []);

  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [qualityFailed, setQualityFailed] = useState(false);
  const [qualityIssues, setQualityIssues] = useState<string[]>([]);
  const [autoCountdown, setAutoCountdown] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [detectedLesions, setDetectedLesions] = useState<DetectedLesion[]>([]);
  const [detectionSource, setDetectionSource] = useState<'on_device' | 'server' | null>(null);
  const [detectionFrameSize, setDetectionFrameSize] = useState({ w: 0, h: 0 });
  const detectedLesionsRef = useRef<DetectedLesion[]>([]);

  // ─── Debug: mock lesions to preview overlay UI ──────────────────
  const DEBUG_LESION_OVERLAY = __DEV__ && false; // flip to true to test overlay visuals
  const debugLesions: DetectedLesion[] = DEBUG_LESION_OVERLAY ? [
    { class: 'papule', confidence: 0.82, bbox: [0.35, 0.30, 0.08, 0.06], zone: 'forehead', tier: 'confirmed' as const, trackId: 'dbg-1' },
    { class: 'comedone', confidence: 0.65, bbox: [0.52, 0.42, 0.06, 0.05], zone: 'nose', tier: 'confirmed' as const, trackId: 'dbg-2' },
    { class: 'pustule', confidence: 0.74, bbox: [0.28, 0.50, 0.07, 0.06], zone: 'left_cheek', tier: 'confirmed' as const, trackId: 'dbg-3' },
    { class: 'macule', confidence: 0.45, bbox: [0.60, 0.55, 0.09, 0.07], zone: 'right_cheek', tier: 'possible' as const, trackId: 'dbg-4' },
  ] : [];
  const detectingRef = useRef(false);
  const detectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alignedStartRef = useRef<number | null>(null);
  const lesionTrackerRef = useRef(new LesionTracker());

  const { trackingState, onFacesDetected, lastFrameWidth, lastFrameHeight } = useFaceTracking(
    cameraReady && !capturing && !paywallVisible,
    SCREEN_W,
    SCREEN_H,
  );

  // Keep refs in sync
  useEffect(() => { detectedLesionsRef.current = detectedLesions; }, [detectedLesions]);
  const directions = getDirections(trackingState.issues);

  const fr = trackingState.faceRect;
  const normalizedFaceRect = useMemo(() => {
    if (!fr || lastFrameWidth <= 0 || lastFrameHeight <= 0) return undefined;
    return {
      x: fr.x / lastFrameWidth,
      y: fr.y / lastFrameHeight,
      width: fr.width / lastFrameWidth,
      height: fr.height / lastFrameHeight,
    };
  }, [fr?.x, fr?.y, fr?.width, fr?.height, lastFrameWidth, lastFrameHeight]);

  // ─── MLKit Face Detection Frame Processor ──────────────────────────
  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'none',
    landmarkMode: 'none',
  });

  // Stable ref for the JS callback — updated on every render so it sees latest closure
  const onFacesRef = useRef(onFacesDetected);
  useEffect(() => { onFacesRef.current = onFacesDetected; }, [onFacesDetected]);

  // Create the worklet-to-JS bridge once
  const callOnFaces = useMemo(
    () => Worklets.createRunOnJS((faces: DetectedFace[], w: number, h: number) => {
      onFacesRef.current(faces, w, h);
    }),
    [],
  );

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const result = detectFaces(frame);
    const mapped: DetectedFace[] = result.map((f: any) => ({
      x: f.bounds.x,
      y: f.bounds.y,
      width: f.bounds.width,
      height: f.bounds.height,
      yawAngle: f.yawAngle ?? null,
      rollAngle: f.rollAngle ?? null,
    }));
    callOnFaces(mapped, frame.width, frame.height);
  }, [detectFaces, callOnFaces]);

  // ─── Animations ────────────────────────────────────────────────────
  const flashOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  // Auto-capture: 4s timer starts when aligned, countdown ticks every 1s
  const autoCaptureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const isAligned = trackingState.status === 'aligned' && trackingState.lightingOk && !capturing;

    if (isAligned && !autoCaptureTimer.current) {
      // Start alignment — haptic feedback + begin countdown
      alignedStartRef.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setAutoCountdown(4);

      // Tick countdown every second
      countdownInterval.current = setInterval(() => {
        const start = alignedStartRef.current;
        if (!start) return;
        const remaining = Math.ceil((4000 - (Date.now() - start)) / 1000);
        setAutoCountdown(Math.max(0, remaining));
      }, 1000);

      // Fire capture after 4s
      autoCaptureTimer.current = setTimeout(() => {
        handleCaptureRef.current();
      }, 4000);
    } else if (!isAligned && autoCaptureTimer.current) {
      // Alignment lost — clear everything
      clearTimeout(autoCaptureTimer.current);
      autoCaptureTimer.current = null;
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = null;
      alignedStartRef.current = null;
      setAutoCountdown(0);
    }

    return () => {
      if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
      autoCaptureTimer.current = null;
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    };
  }, [trackingState.status, trackingState.lightingOk, capturing]);

  // Lazy-load lesion detection
  useEffect(() => {
    if (__DEV__) console.log('[Camera] Initializing lesion detection model...');
    loadLesionModule()
      .then((m) => m?.initLesionDetection())
      .then((ok) => {
        if (__DEV__) console.log('[Camera] Lesion detection init:', ok ? 'SUCCESS' : 'SKIPPED');
        trackEvent('camera_lesion_init', { success: !!ok });
      })
      .catch((err) => {
        if (__DEV__) console.warn('[Camera] Lesion detection init error:', err);
        trackEvent('camera_lesion_init', { success: false, error: String(err) });
      });
    return () => {
      loadLesionModule().then((m) => m?.releaseLesionDetection()).catch(() => {});
    };
  }, []);

  // Lesion detection — starts as soon as a face is visible (not just aligned)
  useEffect(() => {
    if (trackingState.status === 'no_face' || capturing) {
      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }
      if (detectedLesionsRef.current.length > 0) setDetectedLesions([]);
      lesionTrackerRef.current.reset();
      return;
    }

    const detectOnDevice = async (frameUri: string): Promise<DetectedLesion[]> => {
      const m = await loadLesionModule();
      if (!m || !m.isReady()) return [];
      return m.detectLesions(frameUri);
    };

    const detectViaServer = async (base64: string): Promise<DetectedLesion[]> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`${env.API_BASE_URL}/api/vision/detect-lesions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: base64 }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          return data.lesions || [];
        }
      } catch {
        // Server unreachable — non-fatal
      } finally {
        clearTimeout(timeout);
      }
      return [];
    };

    const detect = async () => {
      if (detectingRef.current || !cameraRef.current) return;
      detectingRef.current = true;

      try {
        // VisionCamera takePhoto for lesion detection frame
        const photo = await cameraRef.current.takePhoto();
        if (!photo?.path) {
          detectingRef.current = false;
          return;
        }
        const photoUri = `file://${photo.path}`;
        // Store actual photo dimensions for coordinate mapping
        if (photo.width && photo.height) {
          setDetectionFrameSize((prev) =>
            prev.w === photo.width && prev.h === photo.height ? prev : { w: photo.width, h: photo.height }
          );
        }

        // Try on-device first
        let lesions = await detectOnDevice(photoUri);
        let source: 'on_device' | 'server' | 'none' = lesions.length > 0 ? 'on_device' : 'none';

        // Fall back to server if on-device returned nothing
        if (lesions.length === 0 && env.API_BASE_URL) {
          try {
            // Resize to 640px before uploading to reduce transfer size (~100KB vs 4MB)
            const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
            const resized = await manipulateAsync(
              photoUri,
              [{ resize: { width: 640 } }],
              { format: SaveFormat.JPEG, base64: true, compress: 0.8 },
            );
            if (resized.base64) {
              lesions = await detectViaServer(resized.base64);
              if (lesions.length > 0) source = 'server';
            }
            // Clean up resized temp file
            if (resized.uri && resized.uri !== photoUri) {
              FileSystemLegacy.deleteAsync(resized.uri, { idempotent: true }).catch(() => {});
            }
          } catch {
            // Resize or server detect failed — non-fatal
          }
        }

        // Clean up the detection frame
        FileSystemLegacy.deleteAsync(photoUri, { idempotent: true }).catch(() => {});

        // Apply temporal smoothing
        const stable = lesionTrackerRef.current.update(lesions);
        setDetectedLesions(stable);
        if (source !== 'none') setDetectionSource(source);

        if (stable.length > 0) {
          trackEvent('realtime_lesions_detected', {
            count: stable.length,
            source,
            raw_count: lesions.length,
          });
        }
      } catch {
        // Detection failed — non-fatal
      } finally {
        detectingRef.current = false;
      }
    };

    detect();
    detectionTimerRef.current = setInterval(detect, 350);

    return () => {
      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }
    };
  }, [trackingState.status, capturing]);

  // Button animation based on alignment
  useEffect(() => {
    if (trackingState.status === 'aligned') {
      buttonScale.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 400 }),
          withTiming(0.95, { duration: 400 }),
        ),
        -1,
      );
    } else {
      buttonScale.value = withTiming(1, { duration: 200 });
    }
  }, [trackingState.status]);

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // ─── Capture ───────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    setQualityFailed(false);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flashOpacity.value = withSequence(
      withTiming(0.3, { duration: 100 }),
      withTiming(0, { duration: 200 }),
    );

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      if (!photo?.path) {
        setCapturing(false);
        return;
      }
      const photoUri = `file://${photo.path}`;

      // Quality check (passthrough — real detection handled by frame processor)
      const quality = await checkPhotoQuality(photoUri, photo.width, photo.height);
      if (quality.overallPass || quality.issues.length === 0) {
        const currentLesions = detectedLesionsRef.current;
        if (currentLesions.length > 0) {
          useStore.getState().setPendingLesions(currentLesions);
        }
        router.push({
          pathname: '/scan/analyzing',
          params: { photoUri },
        });
      } else {
        setQualityFailed(true);
        setQualityIssues(quality.issues);
        setCapturing(false);
      }
    } catch {
      setCapturing(false);
    }
  }, [capturing, router]);

  const handleCaptureRef = useRef(handleCapture);
  useEffect(() => { handleCaptureRef.current = handleCapture; }, [handleCapture]);

  // ─── Permission not yet granted ───────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Feather name="camera" size={48} color={Colors.primary} />
          <Text style={styles.permissionTitle}>Camera Access</Text>
          <Text style={styles.permissionText}>
            Glowlytics needs camera access to analyze your skin.
          </Text>
          <Button title="Enable Camera" onPress={requestPermission} />
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Device not available (rare — no front camera)
  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Feather name="alert-circle" size={48} color={Colors.error} />
          <Text style={styles.permissionTitle}>No Camera</Text>
          <Text style={styles.permissionText}>
            No front camera detected on this device.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        device={device}
        isActive={!paywallVisible}
        photo={true}
        frameProcessor={frameProcessor}
        style={StyleSheet.absoluteFill}
        onInitialized={() => setCameraReady(true)}
        onError={(e) => { if (__DEV__) console.warn('[Camera] Error:', e); }}
      />

      {/* Face mesh overlay */}
      <CameraFaceMesh
        status={trackingState.status}
        width={SCREEN_W}
        height={SCREEN_H}
      />

      {/* Real-time lesion detection overlay — scan UI shows whenever face is visible */}
      {(trackingState.status !== 'no_face' || detectedLesions.length > 0 || DEBUG_LESION_OVERLAY) && (
        <LesionOverlay
          lesions={DEBUG_LESION_OVERLAY ? debugLesions : detectedLesions}
          width={SCREEN_W}
          height={SCREEN_H}
          sourceWidth={DEBUG_LESION_OVERLAY ? SCREEN_W : (detectionFrameSize.w || lastFrameWidth)}
          sourceHeight={DEBUG_LESION_OVERLAY ? SCREEN_H : (detectionFrameSize.h || lastFrameHeight)}
          mirrored={!DEBUG_LESION_OVERLAY}
          detectionSource={DEBUG_LESION_OVERLAY ? 'on_device' : detectionSource}
          scanActive={trackingState.status !== 'no_face'}
        />
      )}

      {/* Direction indicators */}
      {trackingState.status === 'misaligned' && (
        <DirectionIndicators directions={directions} />
      )}

      {/* Flash overlay */}
      <Animated.View style={[styles.flashOverlay, flashStyle]} pointerEvents="none" />

      {/* Top bar — distilled: back button + lighting only */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={28} color={Colors.textOnDark} />
        </TouchableOpacity>

        {/* Lesion count badge — shows when lesions are detected */}
        {detectedLesions.length > 0 && (
          <View style={styles.lesionBadge}>
            <View style={styles.lesionBadgeDot} />
            <Text style={styles.lesionBadgeText}>
              {detectedLesions.length} detected
            </Text>
          </View>
        )}

        {!trackingState.lightingUnavailable && (
          <View style={[
            styles.lightingPill,
            {
              backgroundColor: trackingState.lightingOk
                ? 'rgba(95, 211, 172, 0.2)'
                : 'rgba(242, 181, 106, 0.2)',
            },
          ]}>
            <View style={[
              styles.lightingDot,
              {
                backgroundColor: trackingState.lightingOk
                  ? Colors.success
                  : Colors.warning,
              },
            ]} />
            <Text style={[
              styles.lightingText,
              {
                color: trackingState.lightingOk
                  ? Colors.success
                  : Colors.warning,
              },
            ]}>
              {trackingState.lightingOk ? 'Good light' : 'Low light'}
            </Text>
          </View>
        )}
      </View>

      {/* Status text — larger, more prominent */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {trackingState.status === 'no_face'
            ? 'Position your face in the frame'
            : trackingState.status === 'misaligned'
              ? trackingState.issues[0] || 'Adjust position'
              : autoCountdown > 0
                ? `Hold steady · ${autoCountdown}`
                : 'Ready to capture'}
        </Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {qualityFailed ? (
          <View style={styles.retakeContainer}>
            <Text style={styles.retakeTitle}>Photo quality issue</Text>
            {qualityIssues.map((issue, i) => (
              <Text key={i} style={styles.retakeIssue}>{issue}</Text>
            ))}
            <Button
              title="Retake"
              onPress={() => {
                alignedStartRef.current = null;
                setQualityFailed(false);
                setCapturing(false);
              }}
            />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleCapture}
            disabled={trackingState.status !== 'aligned' || capturing}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            accessibilityState={{ disabled: trackingState.status !== 'aligned' || capturing }}
          >
            <Animated.View style={buttonAnimStyle}>
              <View style={[
                styles.captureRing,
                {
                  borderColor: trackingState.status === 'aligned'
                    ? Colors.primary
                    : Colors.textMuted,
                },
              ]}>
                {trackingState.status === 'aligned' && (
                  <View style={styles.captureInner} />
                )}
              </View>
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'white',
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lesionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm + 2,
    backgroundColor: 'rgba(125, 231, 225, 0.18)',
  },
  lesionBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.ringAccent,
  },
  lesionBadgeText: {
    color: Colors.ringAccent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 0.5,
  },
  lightingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lightingDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.xs,
  },
  lightingText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  statusContainer: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    letterSpacing: 0.3,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureRing: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  retakeContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
  },
  retakeTitle: {
    color: Colors.warning,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  retakeIssue: {
    color: Colors.textOnDarkDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  permissionContent: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
  permissionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  permissionText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  backLink: {
    marginTop: Spacing.md,
  },
  backLinkText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
});
