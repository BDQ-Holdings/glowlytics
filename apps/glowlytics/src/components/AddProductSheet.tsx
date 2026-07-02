import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { localDateStr } from '../utils/localDate';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { GlowIcon } from './glow/GlowIcons';
import { FadeUp } from './glow/GlowPrimitives';
// Safe VisionCamera import — gracefully degrades in Expo Go where native modules aren't available
let VisionCamera: any = null;
let useCameraDeviceHook: (position: string) => any = () => null;
let useCameraPermissionHook: () => { hasPermission: boolean; requestPermission: () => Promise<boolean> } =
  () => ({ hasPermission: false, requestPermission: async () => false });
let useCodeScannerHook: (opts: any) => any = () => ({});
try {
  const vc = require('react-native-vision-camera');
  VisionCamera = vc.Camera;
  useCameraDeviceHook = vc.useCameraDevice;
  useCameraPermissionHook = vc.useCameraPermission;
  useCodeScannerHook = vc.useCodeScanner;
} catch {
  // VisionCamera not available (Expo Go) — camera features will show fallback UI
}
import { imageToBase64 } from '../services/visionAPI';
import * as Haptics from 'expo-haptics';
import {
  BorderRadius,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { lookupBarcode, searchProductsMultiSource, identifyProductPhoto } from '../services/productLookup';
import { isApiError } from '../services/httpClient';
import { trackEvent } from '../services/analytics';
import type { CaptureMethod, UsageSchedule } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type SheetMode = 'menu' | 'search' | 'barcode' | 'photo' | 'manual' | 'schedule';

interface SelectedProduct {
  name: string;
  ingredients: string[];
  brand?: string;
}

// Menu entry config — keeps the JSX flat and the entries trivially reorderable.
interface MenuEntry {
  id: 'photo' | 'barcode' | 'search' | 'manual';
  label: string;
  desc: string;
  icon: 'camera' | 'sparkle' | 'plus';
  feather?: keyof typeof Feather.glyphMap;
}

const MENU: MenuEntry[] = [
  { id: 'photo',   label: 'Snap the bottle',  desc: 'AI reads the label — no barcode needed', icon: 'camera' },
  { id: 'barcode', label: 'Scan barcode',     desc: 'Fastest path when there is one',          icon: 'sparkle', feather: 'maximize' },
  { id: 'search',  label: 'Search by name',   desc: 'Pull from our curated database',          icon: 'sparkle', feather: 'search' },
  { id: 'manual',  label: 'Enter manually',   desc: 'Type the name and ingredients',           icon: 'plus',    feather: 'edit-3' },
];

export const AddProductSheet: React.FC<Props> = ({ visible, onClose }) => {
  const addProduct = useStore((s) => s.addProduct);
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermissionHook();
  const device = useCameraDeviceHook('back');

  const [mode, setMode] = useState<SheetMode>('menu');
  const [originMode, setOriginMode] = useState<SheetMode>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; brand?: string; ingredients: string[] }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SelectedProduct | null>(null);
  const [schedule, setSchedule] = useState<UsageSchedule>('AM');
  const [manualName, setManualName] = useState('');
  const [manualIngredients, setManualIngredients] = useState('');
  const [barcodeFound, setBarcodeFound] = useState(false);
  const [photoIdentifying, setPhotoIdentifying] = useState(false);
  const processingRef = useRef(false);
  const lastScannedBarcodeRef = useRef<string | null>(null);
  const photoCancelledRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Aborts the in-flight backend search when the user types again or closes
  // the sheet. Without this, a slow response from the previous query would
  // overwrite results from a fresher query.
  const searchAbortRef = useRef<AbortController | null>(null);
  // Each keystroke increments this counter; the async resolver only commits
  // results when its captured value still matches the latest count. Belt-and-
  // suspenders alongside the AbortController.
  const searchSeqRef = useRef(0);
  const cameraRef = useRef<any>(null);

  const palette = Glow.palette;

  // Barcode scanner hook — only active when in barcode mode
  const codeScanner = useCodeScannerHook({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e'],
    onCodeScanned: (codes: any[]) => {
      if (codes.length > 0 && codes[0].value) {
        handleBarcodeScan(codes[0].value);
      }
    },
  });

  // Clean up debounce timer + abort in-flight search on unmount.
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  const resetState = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setMode('menu');
    setOriginMode('menu');
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setSelected(null);
    setSchedule('AM');
    setManualName('');
    setManualIngredients('');
    setBarcodeFound(false);
    setPhotoIdentifying(false);
    lastScannedBarcodeRef.current = null;
    photoCancelledRef.current = false;
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const goToSchedule = (product: SelectedProduct, from: SheetMode) => {
    setSelected(product);
    setOriginMode(from);
    setMode('schedule');
  };

  // Debounced multi-source search.
  //
  // Three guards stack to keep the result UI honest:
  //   1. setTimeout debounce (220ms) — collapses rapid typing into one call.
  //   2. AbortController.abort() on each new keystroke — server-side cancels.
  //   3. Sequence number — only the most recent call writes state, so a slow
  //      response that survives the abort doesn't clobber fresher results.
  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    try {
      searchAbortRef.current?.abort();
    } catch {
      // Some RN polyfills throw when aborting an already-aborted controller —
      // we don't care.
    }
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++searchSeqRef.current;
    searchTimerRef.current = setTimeout(() => {
      // Wrap the entire async path in a self-invoking IIFE with a top-level
      // try/catch. Any unhandled rejection here would otherwise tear down
      // the JS context (RN's default unhandled-rejection handler) — which
      // surfaces to the user as "the app crashes back to sign-in".
      (async () => {
        const controller = new AbortController();
        searchAbortRef.current = controller;
        try {
          const results = await searchProductsMultiSource(query, controller.signal);
          if (mySeq !== searchSeqRef.current) return; // stale response
          if (!Array.isArray(results)) {
            setSearchResults([]);
            return;
          }
          setSearchResults(results.slice(0, 15));
          try {
            trackEvent('product_searched', { query, result_count: results.length });
          } catch {
            /* analytics never crashes the UI */
          }
        } catch (err) {
          if (mySeq !== searchSeqRef.current) return;
          if (controller.signal.aborted || isApiError(err, 0)) {
            // Aborted by us (newer keystroke or sheet closed) — leave state.
            return;
          }
          if (__DEV__) console.warn('[AddProductSheet] search failed:', err);
          setSearchResults([]);
        } finally {
          if (mySeq === searchSeqRef.current) setSearching(false);
        }
      })().catch((err) => {
        // Belt-and-braces: this path should be unreachable because the
        // inner try/catch already covers every async error. If something
        // still escapes (sync render-time error inside the IIFE itself),
        // swallow it so the JS context survives.
        if (__DEV__) console.warn('[AddProductSheet] unexpected search error:', err);
      });
    }, 220);
  }, []);

  const handleSelectResult = (product: { name: string; brand?: string; ingredients: string[] }) => {
    goToSchedule({ name: product.name, brand: product.brand, ingredients: product.ingredients }, 'search');
  };

  const handleBarcodeScan = async (barcode: string) => {
    if (processingRef.current) return;
    if (lastScannedBarcodeRef.current === barcode) return;
    lastScannedBarcodeRef.current = barcode;
    processingRef.current = true;
    setBarcodeFound(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const result = await lookupBarcode(barcode);
      if (result) {
        trackEvent('product_barcode_scanned', { found: true });
        goToSchedule({ name: result.name, brand: result.brand, ingredients: result.ingredients }, 'barcode');
      } else {
        trackEvent('product_barcode_scanned', { found: false });
        setBarcodeFound(false);
        Alert.alert('Not found', 'Product not found. Try searching by name or take a photo instead.', [
          { text: 'Search', onPress: () => setMode('search') },
          { text: 'Take Photo', onPress: () => setMode('photo') },
          { text: 'Cancel', style: 'cancel', onPress: () => setMode('menu') },
        ]);
      }
    } catch {
      setBarcodeFound(false);
      Alert.alert('Error', 'Could not look up barcode.');
      setMode('menu');
    }
    processingRef.current = false;
  };

  const handlePhotoCapture = async () => {
    if (!cameraRef.current || photoIdentifying) return;
    photoCancelledRef.current = false;
    setPhotoIdentifying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      if (!photo?.path) {
        setPhotoIdentifying(false);
        Alert.alert('Error', 'Could not capture photo. Please try again.');
        return;
      }
      const base64 = await imageToBase64(photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`);
      const result = await identifyProductPhoto(base64);
      if (photoCancelledRef.current) return;
      if (result) {
        trackEvent('product_photo_identified', { success: true, confidence: result.confidence });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        goToSchedule({
          name: result.name,
          brand: result.brand,
          ingredients: result.ingredients,
        }, 'photo');
      } else {
        trackEvent('product_photo_identified', { success: false });
        Alert.alert(
          'Could not identify',
          'Try a different angle showing the product name, or enter it manually.',
          [
            { text: 'Try Again', onPress: () => setPhotoIdentifying(false) },
            { text: 'Enter Manually', onPress: () => { setPhotoIdentifying(false); setMode('manual'); } },
          ],
        );
      }
    } catch {
      Alert.alert('Error', 'Product identification failed. Please try again.');
    }
    setPhotoIdentifying(false);
  };

  const handleManualAdd = () => {
    if (!manualName.trim()) return;
    const ingredients = manualIngredients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    goToSchedule({ name: manualName.trim(), ingredients }, 'manual');
  };

  const handleConfirmAdd = (allowDuplicate = false) => {
    if (!selected) return;
    const captureMethod: CaptureMethod =
      originMode === 'barcode' ? 'barcode' :
      originMode === 'photo' ? 'photo' : 'search';
    const result = addProduct({
      product_name: selected.name,
      brand: selected.brand,
      product_capture_method: captureMethod,
      ingredients_list: selected.ingredients,
      usage_schedule: schedule,
      start_date: localDateStr(),
    }, { allowDuplicate });
    if (result.status === 'duplicate') {
      Alert.alert(
        'Already on your shelf',
        `${result.duplicate.product_name} is already in your shelf.`,
        [
          {
            text: 'View shelf',
            onPress: () => {
              handleClose();
              router.replace('/(tabs)/products');
            },
          },
          { text: 'Add anyway', onPress: () => handleConfirmAdd(true) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    if (result.status === 'ignored') {
      handleClose();
      return;
    }
    trackEvent('product_added', { product_name: selected.name, capture_method: captureMethod, schedule });
    handleClose();
  };

  const requestCameraAndGo = async (target: SheetMode) => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    setBarcodeFound(false);
    setPhotoIdentifying(false);
    setMode(target);
  };

  const titleFor = (m: SheetMode) => {
    switch (m) {
      case 'menu':     return ['Add a', 'product'];
      case 'search':   return ['Find your', 'product'];
      case 'barcode':  return ['Scan the', 'barcode'];
      case 'photo':    return ['Snap the', 'label'];
      case 'manual':   return ['Enter', 'manually'];
      case 'schedule': return ['When do you', 'use it?'];
    }
  };

  const [titleLeft, titleRight] = titleFor(mode);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: palette.bg }]}>
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: palette.muted + '55' }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: palette.muted }]}>SHELF</Text>
              <Text style={[styles.title, { color: palette.ink }]}>
                {titleLeft}{' '}
                <Text style={[styles.titleAccent, { color: palette.accent }]}>{titleRight}</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close add product"
              style={[styles.closeBtn, { backgroundColor: palette.surface }]}
            >
              <GlowIcon name="x" size={18} color={palette.ink} stroke={1.9} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetContent}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'menu' && (
              <View style={styles.menuOptions}>
                {MENU.map((entry, i) => (
                  <FadeUp key={entry.id} index={i}>
                    <TouchableOpacity
                      style={[
                        styles.menuOption,
                        { backgroundColor: palette.surface, borderColor: palette.glow },
                      ]}
                      onPress={() => {
                        if (entry.id === 'photo' || entry.id === 'barcode') {
                          void requestCameraAndGo(entry.id);
                        } else {
                          setMode(entry.id);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.menuIconWrap, { backgroundColor: palette.glow }]}>
                        {entry.feather ? (
                          <Feather name={entry.feather} size={18} color={palette.accent} />
                        ) : (
                          <GlowIcon name={entry.icon} size={20} color={palette.accent} stroke={1.8} />
                        )}
                      </View>
                      <View style={styles.menuTextCol}>
                        <Text style={[styles.menuLabel, { color: palette.ink }]}>{entry.label}</Text>
                        <Text style={[styles.menuDesc, { color: palette.muted }]}>{entry.desc}</Text>
                      </View>
                      <GlowIcon name="arrow" size={14} color={palette.muted} stroke={1.7} />
                    </TouchableOpacity>
                  </FadeUp>
                ))}
              </View>
            )}

            {mode === 'search' && (
              <View style={styles.searchMode}>
                <View
                  style={[
                    styles.searchInputRow,
                    { backgroundColor: palette.surface, borderColor: palette.glow },
                  ]}
                >
                  <Feather name="search" size={16} color={palette.muted} />
                  <TextInput
                    style={[styles.searchInput, { color: palette.ink }]}
                    placeholder="Try “cerave” or “byoma”"
                    placeholderTextColor={palette.muted}
                    value={searchQuery}
                    onChangeText={handleSearchInput}
                    autoFocus
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handleSearchInput('')}
                      hitSlop={10}
                      accessibilityLabel="Clear search"
                    >
                      <GlowIcon name="x" size={14} color={palette.muted} stroke={1.8} />
                    </TouchableOpacity>
                  )}
                </View>

                {searching && (
                  <View style={styles.searchingRow}>
                    <ActivityIndicator color={palette.accent} />
                    <Text style={[styles.searchingText, { color: palette.muted }]}>
                      Looking through the shelf…
                    </Text>
                  </View>
                )}

                {!searching && searchResults.map((r, i) => (
                  <FadeUp key={`${r.name}-${i}`} index={Math.min(i, 5)}>
                    <TouchableOpacity
                      style={[
                        styles.resultRow,
                        { backgroundColor: palette.surface, borderColor: palette.glow },
                      ]}
                      onPress={() => handleSelectResult(r)}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.resultName, { color: palette.ink }]} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={[styles.resultMeta, { color: palette.muted }]} numberOfLines={1}>
                          {r.brand ? `${r.brand} · ` : ''}
                          {r.ingredients.length === 0
                            ? 'No ingredients listed'
                            : `${r.ingredients.length} ingredient${r.ingredients.length === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                      <GlowIcon name="arrow" size={14} color={palette.muted} stroke={1.7} />
                    </TouchableOpacity>
                  </FadeUp>
                ))}

                {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                  <View style={styles.emptyResults}>
                    <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                      Nothing came up
                    </Text>
                    <Text style={[styles.emptyBody, { color: palette.muted }]}>
                      Try a shorter query — or add it manually and we'll learn it for next time.
                    </Text>
                    <TouchableOpacity
                      style={[styles.emptyBtn, { borderColor: palette.muted }]}
                      onPress={() => setMode('manual')}
                    >
                      <Text style={[styles.emptyBtnText, { color: palette.ink }]}>Enter manually</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {mode === 'barcode' && (
              <View style={styles.barcodeMode}>
                {hasPermission && device && VisionCamera ? (
                  <>
                    <View style={[styles.cameraBox, { backgroundColor: palette.ink }]}>
                      <VisionCamera
                        style={styles.camera}
                        device={device}
                        isActive={mode === 'barcode'}
                        codeScanner={codeScanner}
                      />
                      <View style={styles.cameraOverlay}>
                        <View
                          style={[
                            styles.scanFrame,
                            { borderColor: barcodeFound ? palette.accent : palette.surface },
                            barcodeFound && styles.scanFrameFound,
                          ]}
                        />
                        {barcodeFound && (
                          <View style={[styles.scanFeedback, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                            <GlowIcon name="check" size={16} color={palette.surface} stroke={2} />
                            <Text style={[styles.scanFeedbackText, { color: palette.surface }]}>
                              Got it
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.photoFallbackLink}
                      onPress={() => setMode('photo')}
                    >
                      <GlowIcon name="camera" size={14} color={palette.accent} stroke={1.8} />
                      <Text style={[styles.photoFallbackText, { color: palette.accent }]}>
                        No barcode? Snap a photo instead
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.emptyBody, { color: palette.muted }]}>
                    Camera permission required to scan barcodes.
                  </Text>
                )}
              </View>
            )}

            {mode === 'photo' && (
              <View style={styles.photoMode}>
                {hasPermission && device && VisionCamera ? (
                  <>
                    <Text style={[styles.photoHint, { color: palette.muted }]}>
                      Aim so the brand and product name read clearly
                    </Text>
                    <View style={[styles.cameraBox, { backgroundColor: palette.ink }]}>
                      <VisionCamera
                        ref={cameraRef}
                        style={styles.camera}
                        device={device}
                        isActive={mode === 'photo'}
                        photo={true}
                      />
                      {photoIdentifying && (
                        <View style={styles.photoOverlay}>
                          <ActivityIndicator size="large" color={palette.surface} />
                          <Text style={[styles.photoOverlayText, { color: palette.surface }]}>
                            Reading the label…
                          </Text>
                          <TouchableOpacity
                            style={styles.photoCancelButton}
                            onPress={() => { photoCancelledRef.current = true; setPhotoIdentifying(false); setMode('menu'); }}
                            hitSlop={12}
                          >
                            <Text style={[styles.photoCancelText, { color: palette.surface }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.shutterButton,
                        { borderColor: palette.accent },
                        photoIdentifying && styles.shutterButtonDisabled,
                      ]}
                      onPress={handlePhotoCapture}
                      disabled={photoIdentifying}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Capture product photo"
                    >
                      <View style={[styles.shutterInner, { backgroundColor: palette.accent }]} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.emptyBody, { color: palette.muted }]}>
                    Camera permission required to take photos.
                  </Text>
                )}
              </View>
            )}

            {mode === 'manual' && (
              <View style={styles.manualMode}>
                <Text style={[styles.fieldLabel, { color: palette.muted }]}>Product name</Text>
                <TextInput
                  style={[
                    styles.textField,
                    { backgroundColor: palette.surface, borderColor: palette.glow, color: palette.ink },
                  ]}
                  placeholder="e.g. CeraVe Hydrating Cleanser"
                  placeholderTextColor={palette.muted}
                  value={manualName}
                  onChangeText={setManualName}
                  autoFocus
                />
                <Text style={[styles.fieldLabel, { color: palette.muted }]}>
                  Ingredients (comma-separated)
                </Text>
                <TextInput
                  style={[
                    styles.textField,
                    styles.textFieldMulti,
                    { backgroundColor: palette.surface, borderColor: palette.glow, color: palette.ink },
                  ]}
                  placeholder="e.g. Niacinamide, Hyaluronic Acid, Ceramides"
                  placeholderTextColor={palette.muted}
                  value={manualIngredients}
                  onChangeText={setManualIngredients}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    { backgroundColor: palette.ink },
                    !manualName.trim() && styles.confirmButtonDisabled,
                  ]}
                  onPress={handleManualAdd}
                  disabled={!manualName.trim()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.confirmText, { color: palette.surface }]}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'schedule' && selected && (
              <View style={styles.scheduleMode}>
                <Text style={[styles.selectedName, { color: palette.ink }]} numberOfLines={2}>
                  {selected.name}
                </Text>
                {selected.brand && (
                  <Text style={[styles.selectedBrand, { color: palette.accent }]} numberOfLines={1}>
                    {selected.brand}
                  </Text>
                )}
                <Text style={[styles.selectedMeta, { color: palette.muted }]}>
                  {selected.ingredients.length === 0
                    ? 'No ingredients on file yet'
                    : `${selected.ingredients.length} ingredient${selected.ingredients.length === 1 ? '' : 's'}`}
                </Text>

                <Text style={[styles.fieldLabel, { color: palette.muted, marginTop: 24 }]}>
                  When do you use this?
                </Text>
                <View style={styles.scheduleOptions}>
                  {(['AM', 'PM', 'both'] as UsageSchedule[]).map((s) => {
                    const active = schedule === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.scheduleChip,
                          {
                            backgroundColor: active ? palette.ink : palette.surface,
                            borderColor: active ? palette.ink : palette.glow,
                          },
                        ]}
                        onPress={() => setSchedule(s)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.scheduleChipText,
                            { color: active ? palette.surface : palette.ink },
                          ]}
                        >
                          {s === 'both' ? 'AM & PM' : s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: palette.ink }]}
                  onPress={() => handleConfirmAdd()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.confirmText, { color: palette.surface }]}>Add to shelf</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    minHeight: 360,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: Spacing.md,
    gap: 12,
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 26,
    lineHeight: 32,
    marginTop: 2,
  },
  titleAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 30,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  menuOptions: {
    gap: 10,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
    gap: 3,
  },
  menuLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  menuDesc: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  searchMode: {
    gap: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  searchingText: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    fontStyle: 'italic',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  resultName: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm + 1,
  },
  resultMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 3,
  },
  emptyResults: {
    paddingTop: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  emptyBtnText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
  },
  barcodeMode: {
    alignItems: 'center',
    gap: 12,
  },
  cameraBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 2.5,
    borderRadius: 18,
  },
  scanFrameFound: {
    borderWidth: 3,
  },
  scanFeedback: {
    position: 'absolute',
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scanFeedbackText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
  },
  photoFallbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  photoFallbackText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
  },
  photoMode: {
    alignItems: 'center',
    gap: 14,
  },
  photoHint: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  photoOverlayText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  photoCancelButton: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCancelText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textDecorationLine: 'underline',
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  shutterButtonDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  manualMode: {
    gap: 10,
  },
  fieldLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  textField: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    minHeight: 48,
  },
  textFieldMulti: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  scheduleMode: {
    gap: 6,
    alignItems: 'center',
  },
  selectedName: {
    fontFamily: FontFamily.sansBold,
    fontSize: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  selectedBrand: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    marginTop: 2,
  },
  selectedMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  scheduleOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  scheduleChip: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
  },
  scheduleChipText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },
  confirmButton: {
    width: '100%',
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
});
