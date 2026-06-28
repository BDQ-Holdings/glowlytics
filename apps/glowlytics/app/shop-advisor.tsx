// app/shop-advisor.tsx
//
// Shopping Advisor — a skincare-aisle companion ported from the design's
// `ShopAdvisor` (.local/design-assets/advisor.jsx). Scan items back-to-back →
// glance at an overview → go deep on the one you mean it about. Advise-only:
// the endpoint is "save to your considering list", never a cart.
//
// This screen owns the step machine (intent → camera → overview → deep →
// compare → recap), the IntentPicker, and the CameraStage. The result surfaces
// (VerdictMark / OverviewSheet / DeepDive / CompareTable / Recap) and the
// verdict→label `fitMeta` live in src/components/advisor and are imported here.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type {
  Camera,
  CameraDevice,
  Code,
  CodeScanner,
} from 'react-native-vision-camera';

import { compressImageForUpload } from '../src/services/imageUpload';
import { shoppingScan } from '../src/services/api';
import { isApiError } from '../src/services/httpClient';
import { trackEvent } from '../src/services/analytics';
import { useStore } from '../src/store/useStore';
import { GlowIcon, type GlowIconName } from '../src/components/glow/GlowIcons';
import { FadeUp } from '../src/components/glow/GlowPrimitives';
import { FontFamily, Glow } from '../src/constants/theme';
import type { GlowPalette } from '../src/constants/theme';
import { fitMeta } from '../src/components/advisor/fitMeta';
import { OverviewSheet } from '../src/components/advisor/OverviewSheet';
import { DeepDive } from '../src/components/advisor/DeepDive';
import { CompareTable } from '../src/components/advisor/CompareTable';
import { Recap } from '../src/components/advisor/Recap';
import type {
  ConsideringItem,
  ShoppingProduct,
  ShoppingScanInput,
  ShoppingScanResult,
} from '../src/types';

// ── Guarded VisionCamera import ───────────────────────────────────────────────
// Native module is absent in Expo Go, so the require is wrapped and the camera
// surfaces degrade to a static fallback. Types come from the top-level
// `import type` above; the runtime values are pulled through `require`.
interface CameraPermission {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

interface VisionCameraModule {
  Camera: typeof Camera;
  useCameraDevice: (position: 'back' | 'front') => CameraDevice | undefined;
  useCameraPermission: () => CameraPermission;
  useCodeScanner: (codeScanner: CodeScanner) => CodeScanner;
}

let CameraView: VisionCameraModule['Camera'] | null = null;
let useCameraDeviceHook: VisionCameraModule['useCameraDevice'] = () => undefined;
let useCameraPermissionHook: VisionCameraModule['useCameraPermission'] = () => ({
  hasPermission: false,
  requestPermission: async () => false,
});
let useCodeScannerHook: VisionCameraModule['useCodeScanner'] = (codeScanner) => codeScanner;

try {
  // require() returns the untyped CommonJS export; cast to the known module
  // shape (library boundary — the same guarded pattern as AddProductSheet).
  const vc = require('react-native-vision-camera') as VisionCameraModule;
  CameraView = vc.Camera;
  useCameraDeviceHook = vc.useCameraDevice;
  useCameraPermissionHook = vc.useCameraPermission;
  useCodeScannerHook = vc.useCodeScanner;
} catch {
  // VisionCamera unavailable — fallback UI drives a graceful degrade.
}

// ── Lenses (the reasoning the advisor reads each scan through) ────────────────
type IntentKey = 'concern' | 'shelf' | 'compare' | 'safety';
type Step = 'intent' | 'camera' | 'compare' | 'deep' | 'recap';
type ScanMethod = 'barcode' | 'photo';

interface Lens {
  intent: IntentKey;
  concern: string;
}

interface IntentOption {
  key: IntentKey;
  icon: GlowIconName;
  label: string;
  sub: string;
}

interface ConcernOption {
  key: string;
  label: string;
  hint: string;
}

const INTENTS: IntentOption[] = [
  { key: 'concern', icon: 'drop', label: 'Solve a concern', sub: 'Redness, hydration, evenness' },
  { key: 'shelf', icon: 'shelf', label: 'Check my shelf', sub: 'Conflicts & overlap with what I own' },
  { key: 'compare', icon: 'sparkle', label: 'Compare options', sub: 'Weigh a few head-to-head' },
  { key: 'safety', icon: 'leaf', label: 'Ingredient check', sub: 'Fragrance, pregnancy, sensitivity' },
];

const CONCERNS: ConcernOption[] = [
  { key: 'Calm', label: 'Calm redness', hint: 'Tuesday flare-ups' },
  { key: 'Hydrated', label: 'Hydration', hint: 'Plump + dewy' },
  { key: 'Even', label: 'Even tone', hint: 'Brighten' },
];

// ── ConsideringItem helpers ──────────────────────────────────────────────────
// A stable id per product identity so re-scanning the same item dedupes across
// the session list and the persisted "considering" wishlist.
function makeItemId(product: ShoppingProduct): string {
  const slug = `${product.brand ?? ''}::${product.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `scan-${Date.now()}`;
}

function itemFromResult(result: ShoppingScanResult): ConsideringItem {
  return {
    id: makeItemId(result.product),
    name: result.product.name,
    brand: result.product.brand || undefined,
    verdict: result.verdict,
    score: result.score,
    result,
    savedAt: Date.now(),
  };
}

// ── Scan-line sweep (camera "reading" affordance) ────────────────────────────
function SweepLine({ color }: { color: string }): React.ReactElement {
  const progress = useSharedValue(0);
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      // Honour reduce-motion: settle the line centred instead of sweeping.
      progress.value = withTiming(0.5, { duration: 240 });
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: 24 + progress.value * 210 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.sweep, { backgroundColor: color, shadowColor: color }, style]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Intent picker (sets the lens)
// ─────────────────────────────────────────────────────────────────────────────
interface IntentPickerProps {
  palette: GlowPalette;
  insetsTop: number;
  onStart: (lens: Lens) => void;
  onCancel: () => void;
}

function IntentPicker({ palette, insetsTop, onStart, onCancel }: IntentPickerProps): React.ReactElement {
  const [intent, setIntent] = useState<IntentKey | null>(null);
  const [concern, setConcern] = useState<string>('Calm');
  const ready = intent !== null && (intent !== 'concern' || concern.length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topRow, { paddingTop: insetsTop + 12 }]}>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} activeOpacity={0.7} style={styles.cancelBtn}>
          <GlowIcon name="back" size={16} color={palette.muted} stroke={1.8} />
          <Text style={[styles.cancelText, { color: palette.muted }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.kicker, { color: palette.muted }]}>SHOPPING ADVISOR</Text>
        <View style={{ width: 56 }} />
      </View>

      <FadeUp index={0}>
        <View style={styles.introBlock}>
          <Text style={[styles.introTitle, { color: palette.ink }]}>
            Before you buy,{' '}
            <Text style={[styles.introAccent, { color: palette.accent }]}>what are you after?</Text>
          </Text>
          <Text style={[styles.introSub, { color: palette.ink + 'B3' }]}>
            I&apos;ll read every scan through this lens — and against your skin&apos;s patterns.
          </Text>
        </View>
      </FadeUp>

      <View style={styles.intentList}>
        {INTENTS.map((it, i) => {
          const on = intent === it.key;
          return (
            <FadeUp key={it.key} index={Math.min(1 + i, 5)}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIntent(it.key)}
                accessibilityRole="button"
                accessibilityLabel={`${it.label}. ${it.sub}`}
                accessibilityState={{ selected: on }}
                style={[
                  styles.intentRow,
                  { backgroundColor: on ? palette.ink : palette.surface, borderColor: on ? palette.ink : palette.glow },
                ]}
              >
                <View style={[styles.intentIcon, { backgroundColor: on ? palette.surface + '22' : palette.bg }]}>
                  <GlowIcon name={it.icon} size={20} color={on ? palette.surface : palette.accent} stroke={1.7} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.intentLabel, { color: on ? palette.surface : palette.ink }]}>{it.label}</Text>
                  <Text style={[styles.intentSub, { color: on ? palette.surface : palette.muted, opacity: on ? 0.7 : 1 }]}>
                    {it.sub}
                  </Text>
                </View>
                <View style={[styles.intentCheck, { borderColor: on ? palette.surface : palette.glow }]}>
                  {on ? <GlowIcon name="check" size={12} color={palette.surface} stroke={2.4} /> : null}
                </View>
              </TouchableOpacity>
            </FadeUp>
          );
        })}
      </View>

      {intent === 'concern' ? (
        <FadeUp index={2}>
          <View style={styles.concernBlock}>
            <Text style={[styles.concernHead, { color: palette.muted }]}>WHICH CONCERN?</Text>
            <View style={styles.concernRow}>
              {CONCERNS.map((c) => {
                const on = concern === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.85}
                    onPress={() => setConcern(c.key)}
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.concernChip,
                      { backgroundColor: on ? palette.accent + '1f' : palette.surface, borderColor: on ? palette.accent : palette.glow },
                    ]}
                  >
                    <Text style={[styles.concernLabel, { color: on ? palette.accent : palette.ink }]}>{c.label}</Text>
                    <Text style={[styles.concernHint, { color: palette.muted }]}>{c.hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </FadeUp>
      ) : null}

      <View style={styles.startBlock}>
        <TouchableOpacity
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Start scanning"
          accessibilityState={{ disabled: !ready }}
          activeOpacity={0.9}
          onPress={() => {
            if (intent !== null) onStart({ intent, concern });
          }}
          style={[styles.startBtn, { backgroundColor: ready ? palette.accent : palette.glow }]}
        >
          <GlowIcon name="camera" size={18} color={ready ? palette.surface : palette.muted} stroke={1.8} />
          <Text style={[styles.startText, { color: ready ? palette.surface : palette.muted }]}>Start scanning</Text>
        </TouchableOpacity>
        <Text style={[styles.startNote, { color: palette.muted }]}>I only advise — nothing gets bought here.</Text>
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Camera stage (scan back-to-back; considering strip grows below)
// ─────────────────────────────────────────────────────────────────────────────
interface CameraStageProps {
  palette: GlowPalette;
  lensLabel: string;
  considering: ConsideringItem[];
  scanning: boolean;
  cameraReady: boolean;
  cameraNode: ReactNode;
  insetsTop: number;
  insetsBottom: number;
  onChangeLens: () => void;
  onShutter: () => void;
  onOpenCompare: () => void;
  onFinish: () => void;
}

function CameraStage({
  palette,
  lensLabel,
  considering,
  scanning,
  cameraReady,
  cameraNode,
  insetsTop,
  insetsBottom,
  onChangeLens,
  onShutter,
  onOpenCompare,
  onFinish,
}: CameraStageProps): React.ReactElement {
  const hasItems = considering.length > 0;
  const latest = hasItems ? considering[considering.length - 1] : null;
  const cornerColor = palette.surface + '80';

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={[styles.cameraTop, { paddingTop: insetsTop + 10 }]}>
        <TouchableOpacity
          onPress={onChangeLens}
          accessibilityRole="button"
          accessibilityLabel={`Lens: ${lensLabel}. Change`}
          hitSlop={8}
          activeOpacity={0.85}
          style={[styles.lensChip, { backgroundColor: palette.surface, borderColor: palette.glow }]}
        >
          <View style={[styles.lensDot, { backgroundColor: palette.accent2 }]} />
          <Text style={[styles.lensLabel, { color: palette.ink }]} numberOfLines={1}>
            {lensLabel}
          </Text>
          <GlowIcon name="chevron" size={12} color={palette.muted} stroke={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onFinish} disabled={!hasItems} accessibilityRole="button" accessibilityLabel="Done" accessibilityState={{ disabled: !hasItems }} hitSlop={8} activeOpacity={0.7}>
          <Text style={[styles.doneText, { color: hasItems ? palette.ink : palette.muted }]}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraBody}>
        <View style={[styles.viewport, { backgroundColor: palette.ink }]}>
          {cameraNode}
          <View style={[styles.cornerTL, { borderColor: cornerColor }]} />
          <View style={[styles.cornerTR, { borderColor: cornerColor }]} />
          <View style={[styles.cornerBL, { borderColor: cornerColor }]} />
          <View style={[styles.cornerBR, { borderColor: cornerColor }]} />
          {scanning ? <SweepLine color={palette.accent2} /> : null}
          <Text style={[styles.viewportCaption, { color: palette.surface }]}>
            {scanning
              ? 'Reading the label…'
              : cameraReady
                ? 'Frame a bottle or barcode'
                : 'Camera unavailable'}
          </Text>
        </View>

        <View style={styles.shutterRow}>
          <TouchableOpacity
            onPress={onShutter}
            disabled={scanning || !cameraReady}
            accessibilityRole="button"
            accessibilityLabel="Scan product"
            accessibilityState={{ disabled: scanning || !cameraReady }}
            activeOpacity={0.8}
            style={[styles.shutter, { borderColor: palette.ink, opacity: cameraReady ? 1 : 0.4 }]}
          >
            {scanning ? (
              <ActivityIndicator color={palette.accent2} />
            ) : (
              <View style={[styles.shutterInner, { backgroundColor: palette.ink }]} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: insetsBottom + 24 }}>
        {!hasItems ? (
          <Text style={[styles.stripEmpty, { color: palette.muted }]}>
            Items you scan collect here — compare them side by side.
          </Text>
        ) : (
          <TouchableOpacity
            onPress={onOpenCompare}
            accessibilityRole="button"
            accessibilityLabel={`${considering.length} considering. Compare`}
            activeOpacity={0.9}
            style={[styles.strip, { backgroundColor: palette.surface, borderColor: palette.glow }]}
          >
            <View style={styles.stripThumbs}>
              {considering.slice(-4).map((it, i) => (
                <View
                  key={it.id}
                  style={[
                    styles.stripThumb,
                    { marginLeft: i ? -10 : 0, borderColor: palette.surface, backgroundColor: fitMeta(it.verdict, palette).dot },
                  ]}
                />
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.stripCount, { color: palette.ink }]}>{considering.length} considering</Text>
              <Text style={[styles.stripLatest, { color: palette.muted }]} numberOfLines={1}>
                {latest ? `Latest: ${latest.name}` : 'Tap to compare'}
              </Text>
            </View>
            <Text style={[styles.stripCta, { color: palette.accent }]}>Compare</Text>
            <GlowIcon name="arrow" size={17} color={palette.accent} stroke={1.9} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — owns the step machine
// ─────────────────────────────────────────────────────────────────────────────
export default function ShopAdvisorScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = Glow.palette;

  const consideringStore = useStore((s) => s.consideringList);
  const saveToConsidering = useStore((s) => s.saveToConsidering);

  const [step, setStep] = useState<Step>('intent');
  const [lens, setLens] = useState<Lens>({ intent: 'concern', concern: 'Calm' });
  const [considering, setConsidering] = useState<ConsideringItem[]>([]);
  const [sheetResult, setSheetResult] = useState<ShoppingScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deepItem, setDeepItem] = useState<ConsideringItem | null>(null);
  const [returnTo, setReturnTo] = useState<Step>('camera');
  const [toast, setToast] = useState<string | null>(null);

  const { hasPermission, requestPermission } = useCameraPermissionHook();
  const device = useCameraDeviceHook('back');
  const cameraRef = useRef<Camera>(null);
  const handleBarcodeRef = useRef<(value: string) => void>(() => {});
  const processingRef = useRef(false);
  const lastBarcodeRef = useRef<string | null>(null);
  const pausedRef = useRef(false);

  const codeScanner = useCodeScannerHook({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e'],
    onCodeScanned: (codes: Code[]) => {
      const value = codes[0]?.value;
      if (value) handleBarcodeRef.current(value);
    },
  });

  const savedIds = new Set(consideringStore.map((c) => c.id));

  // Toast auto-dismiss — local timer, cleaned up on change/unmount.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // Analytics: the advisor was opened.
  useEffect(() => {
    trackEvent('shop_advisor_opened', {});
  }, []);

  // Pause scanning while a sheet is up, mid-scan, or off the camera step.
  useEffect(() => {
    pausedRef.current = step !== 'camera' || sheetResult !== null || scanning;
  }, [step, sheetResult, scanning]);

  // Request camera permission the first time the camera step is reached.
  useEffect(() => {
    if (step === 'camera' && CameraView !== null && !hasPermission) {
      requestPermission().catch(() => {});
    }
  }, [step, hasPermission, requestPermission]);

  const ping = useCallback((message: string) => {
    setToast(message);
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const lensLabel =
    lens.intent === 'concern'
      ? CONCERNS.find((c) => c.key === lens.concern)?.label ?? 'Solve a concern'
      : INTENTS.find((i) => i.key === lens.intent)?.label ?? 'Browsing';

  const lensNote = useCallback(
    (result: ShoppingScanResult): string | null => {
      if (lens.intent === 'shelf') {
        if (result.redundancy) return `Through your "check my shelf" lens: overlaps your ${result.redundancy.withProduct}.`;
        const conflict = result.conflicts[0];
        if (conflict) return `Through your "check my shelf" lens: ${conflict.message}`;
        return 'Through your "check my shelf" lens: sits cleanly with what you own.';
      }
      if (lens.intent === 'safety') {
        const flag = result.flags[0];
        return flag ? `Safety lens flag: ${flag.message}` : 'Safety lens: no flags we could see.';
      }
      if (lens.intent === 'concern') {
        const label = CONCERNS.find((c) => c.key === lens.concern)?.label.toLowerCase() ?? 'your goal';
        return result.goalFit.score >= 60 ? `Looks aligned with your "${label}" goal.` : null;
      }
      return null;
    },
    [lens],
  );

  const submitScan = useCallback(
    async (build: () => Promise<ShoppingScanInput>, method: ScanMethod) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setScanning(true);
      trackEvent('shop_scan', { method, lens: lens.intent, concern: lens.concern });
      try {
        const input = await build();
        const result = await shoppingScan(input);
        if (!result.identified) {
          lastBarcodeRef.current = null;
          ping("Couldn't read that one — try the barcode or a clearer label.");
          return;
        }
        trackEvent('shop_verdict', { method, verdict: result.verdict, score: result.score });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSheetResult(result);
      } catch (err) {
        lastBarcodeRef.current = null;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (isApiError(err, 413)) ping('That photo is too large — try a tighter crop.');
        else if (isApiError(err, 400)) ping("Couldn't read that — try the barcode.");
        else if (isApiError(err, 0)) ping('That took a little long — give it another scan.');
        else ping('Scan failed — please try again.');
      } finally {
        setScanning(false);
        processingRef.current = false;
      }
    },
    [lens, ping],
  );

  const handleBarcode = useCallback(
    (value: string) => {
      if (pausedRef.current || processingRef.current) return;
      if (lastBarcodeRef.current === value) return;
      lastBarcodeRef.current = value;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void submitScan(async () => ({ barcode: value }), 'barcode');
    },
    [submitScan],
  );
  handleBarcodeRef.current = handleBarcode;

  const handleShutter = useCallback(() => {
    if (pausedRef.current || processingRef.current) return;
    const cam = cameraRef.current;
    if (!cam) {
      ping('Camera is not ready yet.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void submitScan(async () => {
      const photo = await cam.takePhoto({ flash: 'off' });
      const path = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const image_base64 = await compressImageForUpload(path);
      return { image_base64 };
    }, 'photo');
  }, [ping, submitScan]);

  const closeSheet = useCallback(() => {
    setSheetResult(null);
    lastBarcodeRef.current = null;
  }, []);

  const keep = useCallback(
    (result: ShoppingScanResult): ConsideringItem => {
      const item = itemFromResult(result);
      setConsidering((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item]));
      ping('Added to considering');
      return item;
    },
    [ping],
  );

  const goDeep = useCallback((item: ConsideringItem, from: Step) => {
    setDeepItem(item);
    setReturnTo(from);
    setSheetResult(null);
    lastBarcodeRef.current = null;
    setStep('deep');
  }, []);

  const save = useCallback(
    (item: ConsideringItem) => {
      saveToConsidering(item);
      trackEvent('shop_saved', { id: item.id, verdict: item.verdict, score: item.score });
      ping('Saved to your considering list');
    },
    [saveToConsidering, ping],
  );

  const openById = useCallback(
    (id: string, from: Step) => {
      const item = considering.find((c) => c.id === id);
      if (item) goDeep(item, from);
    },
    [considering, goDeep],
  );

  const cameraReady = CameraView !== null && device !== undefined && hasPermission;

  let body: ReactNode = null;
  if (step === 'intent') {
    body = (
      <IntentPicker
        palette={palette}
        insetsTop={insets.top}
        onCancel={() => router.back()}
        onStart={(next) => {
          setLens(next);
          setStep('camera');
        }}
      />
    );
  } else if (step === 'camera') {
    const cameraNode: ReactNode =
      cameraReady && CameraView !== null && device !== undefined ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={step === 'camera' && sheetResult === null}
          photo
          codeScanner={codeScanner}
        />
      ) : (
        <View style={styles.cameraFallback}>
          <GlowIcon name="camera" size={30} color={palette.surface} stroke={1.6} />
          <Text style={[styles.cameraFallbackText, { color: palette.surface }]}>
            {CameraView !== null
              ? 'Allow camera access to scan products.'
              : 'Camera scanning needs a development build.'}
          </Text>
          {CameraView !== null && (
            <TouchableOpacity
              onPress={() => {
                Linking.openSettings().catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={[styles.cameraSettingsBtn, { borderColor: palette.surface + '66' }]}
            >
              <Text style={[styles.cameraSettingsText, { color: palette.surface }]}>
                Open settings
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );

    body = (
      <CameraStage
        palette={palette}
        lensLabel={lensLabel}
        considering={considering}
        scanning={scanning}
        cameraReady={cameraReady}
        cameraNode={cameraNode}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onChangeLens={() => setStep('intent')}
        onShutter={handleShutter}
        onOpenCompare={() => setStep('compare')}
        onFinish={() => setStep('compare')}
      />
    );
  } else if (step === 'compare') {
    body = (
      <CompareTable
        items={considering}
        onOpen={(id) => openById(id, 'compare')}
        onBack={() => setStep('camera')}
        onScanMore={() => setStep('camera')}
        onRecap={() => setStep('recap')}
        palette={palette}
      />
    );
  } else if (step === 'deep') {
    body = deepItem ? (
      <DeepDive
        result={deepItem.result}
        saved={savedIds.has(deepItem.id)}
        onBack={() => setStep(returnTo)}
        onSave={() => save(deepItem)}
        palette={palette}
      />
    ) : null;
  } else if (step === 'recap') {
    body = (
      <Recap
        items={considering}
        savedIds={savedIds}
        onOpen={(id) => openById(id, 'recap')}
        onSave={(id) => {
          const item = considering.find((c) => c.id === id);
          if (item) save(item);
        }}
        onDone={() => router.back()}
        palette={palette}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {body}

      {sheetResult !== null && step === 'camera' ? (
        <OverviewSheet
          result={sheetResult}
          lensNote={lensNote(sheetResult)}
          kept={considering.some((c) => c.id === makeItemId(sheetResult.product))}
          onClose={closeSheet}
          onKeep={() => {
            keep(sheetResult);
            closeSheet();
          }}
          onDeep={() => {
            const item = keep(sheetResult);
            goDeep(item, 'camera');
          }}
          palette={palette}
        />
      ) : null}

      {toast !== null ? (
        <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: palette.ink, bottom: insets.bottom + 28 }]}>
          <Text style={[styles.toastText, { color: palette.surface }]}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Intent picker
  topRow: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cancelText: { fontFamily: FontFamily.sans, fontSize: 14 },
  kicker: { fontFamily: FontFamily.sansMedium, fontSize: 11, letterSpacing: 1 },
  introBlock: { paddingHorizontal: 24, paddingTop: 12 },
  introTitle: { fontFamily: FontFamily.sans, fontSize: 30, lineHeight: 36 },
  introAccent: { fontFamily: FontFamily.accent, fontSize: 34 },
  introSub: { fontFamily: FontFamily.sans, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  intentList: { paddingHorizontal: 24, paddingTop: 22, gap: 10 },
  intentRow: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  intentIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentLabel: { fontFamily: FontFamily.sansMedium, fontSize: 16 },
  intentSub: { fontFamily: FontFamily.sans, fontSize: 12, marginTop: 2 },
  intentCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  concernBlock: { paddingHorizontal: 24, paddingTop: 18 },
  concernHead: { fontFamily: FontFamily.sansMedium, fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
  concernRow: { flexDirection: 'row', gap: 8 },
  concernChip: { flex: 1, borderWidth: 1.5, borderRadius: 16, padding: 11 },
  concernLabel: { fontFamily: FontFamily.sansMedium, fontSize: 13 },
  concernHint: { fontFamily: FontFamily.sans, fontSize: 10.5, marginTop: 2 },
  startBlock: { paddingHorizontal: 24, paddingTop: 26 },
  startBtn: {
    borderRadius: 999,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startText: { fontFamily: FontFamily.sansMedium, fontSize: 15 },
  startNote: { textAlign: 'center', fontFamily: FontFamily.sans, fontSize: 11.5, lineHeight: 18, marginTop: 12 },

  // Camera stage
  cameraTop: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lensChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingLeft: 11,
    paddingRight: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '70%',
  },
  lensDot: { width: 7, height: 7, borderRadius: 4 },
  lensLabel: { fontFamily: FontFamily.sansMedium, fontSize: 12.5, flexShrink: 1 },
  doneText: { fontFamily: FontFamily.sansMedium, fontSize: 13.5 },
  cameraBody: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  viewport: {
    flex: 1,
    minHeight: 300,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerTL: { position: 'absolute', top: 20, left: 20, width: 24, height: 24, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  cornerTR: { position: 'absolute', top: 20, right: 20, width: 24, height: 24, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 20, left: 20, width: 24, height: 24, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 20, right: 20, width: 24, height: 24, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
  sweep: {
    position: 'absolute',
    top: 0,
    left: '14%',
    right: '14%',
    height: 2,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  viewportCaption: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FontFamily.sansMedium,
    fontSize: 12.5,
  },
  cameraFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cameraFallbackText: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 12,
    opacity: 0.85,
  },
  cameraSettingsBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  cameraSettingsText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
  },
  shutterRow: { paddingVertical: 16, alignItems: 'center' },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: '100%', height: '100%', borderRadius: 30 },

  // Considering strip
  stripEmpty: { textAlign: 'center', fontFamily: FontFamily.sans, fontSize: 12, lineHeight: 18, paddingVertical: 6 },
  strip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stripThumbs: { flexDirection: 'row' },
  stripThumb: { width: 30, height: 40, borderRadius: 7, borderWidth: 2 },
  stripCount: { fontFamily: FontFamily.sansMedium, fontSize: 13.5 },
  stripLatest: { fontFamily: FontFamily.sans, fontSize: 11, marginTop: 1 },
  stripCta: { fontFamily: FontFamily.sansMedium, fontSize: 12 },

  // Toast
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  toastText: { fontFamily: FontFamily.sansMedium, fontSize: 13 },
});
