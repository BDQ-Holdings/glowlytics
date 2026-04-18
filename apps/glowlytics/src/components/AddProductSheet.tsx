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
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
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
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { lookupBarcode, searchProductsMultiSource, identifyProductPhoto } from '../services/productLookup';
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

export const AddProductSheet: React.FC<Props> = ({ visible, onClose }) => {
  const addProduct = useStore((s) => s.addProduct);
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
  const cameraRef = useRef<any>(null);

  // Barcode scanner hook — only active when in barcode mode
  const codeScanner = useCodeScannerHook({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e'],
    onCodeScanned: (codes: any[]) => {
      if (codes.length > 0 && codes[0].value) {
        handleBarcodeScan(codes[0].value);
      }
    },
  });

  // Clean up debounce timer on unmount to prevent firing after sheet closes
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const resetState = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
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

  // Debounced multi-source search
  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchProductsMultiSource(query);
        setSearchResults(results.slice(0, 15));
        trackEvent('product_searched', { query, result_count: results.length });
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  }, []);

  const handleSelectResult = (product: { name: string; brand?: string; ingredients: string[] }) => {
    goToSchedule({ name: product.name, brand: product.brand, ingredients: product.ingredients }, 'search');
  };

  const handleBarcodeScan = async (barcode: string) => {
    if (processingRef.current) return;
    // Suppress duplicate scans of the same barcode (camera fires continuously)
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
      // Discard result if user cancelled while request was in-flight
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

  const handleConfirmAdd = () => {
    if (!selected) return;
    const captureMethod: CaptureMethod =
      originMode === 'barcode' ? 'barcode' :
      originMode === 'photo' ? 'photo' : 'search';
    addProduct({
      product_name: selected.name,
      brand: selected.brand,
      product_capture_method: captureMethod,
      ingredients_list: selected.ingredients,
      usage_schedule: schedule,
      start_date: localDateStr(),
    });
    trackEvent('product_added', { product_name: selected.name, capture_method: captureMethod, schedule });
    handleClose();
  };

  const requestCameraAndGo = async (target: SheetMode) => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return; // User denied — stay on menu
    }
    setBarcodeFound(false);
    setPhotoIdentifying(false);
    setMode(target);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {mode === 'menu' ? 'Add Product' :
               mode === 'search' ? 'Search Products' :
               mode === 'barcode' ? 'Scan Barcode' :
               mode === 'photo' ? 'Take Photo' :
               mode === 'manual' ? 'Enter Manually' :
               'Usage Schedule'}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={22} color={Colors.textMuted} />
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
                {/* Photo is first — TestFlight feedback #3: "wish I could take a
                    picture of the product instead of the barcode." The feature
                    exists but was third in the menu and missed by testers. */}
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => requestCameraAndGo('photo')}
                >
                  <View style={styles.menuIconWrap}>
                    <Feather name="camera" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Take a photo</Text>
                    <Text style={styles.menuDesc}>
                      Snap the front of the product — works without a barcode
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => requestCameraAndGo('barcode')}
                >
                  <View style={styles.menuIconWrap}>
                    <Feather name="maximize" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Scan barcode</Text>
                    <Text style={styles.menuDesc}>Fastest if your product has one</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuOption} onPress={() => setMode('search')}>
                  <View style={styles.menuIconWrap}>
                    <Feather name="search" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Search by name</Text>
                    <Text style={styles.menuDesc}>Find from our database</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuOption} onPress={() => setMode('manual')}>
                  <View style={styles.menuIconWrap}>
                    <Feather name="edit-3" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Enter manually</Text>
                    <Text style={styles.menuDesc}>Type name and ingredients</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {mode === 'search' && (
              <View style={styles.searchMode}>
                <View style={styles.searchInputRow}>
                  <Feather name="search" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search products..."
                    placeholderTextColor={Colors.textMuted}
                    value={searchQuery}
                    onChangeText={handleSearchInput}
                    autoFocus
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                      <Feather name="x-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                {searching && <ActivityIndicator style={{ marginTop: 16 }} color={Colors.primary} />}
                {searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={`${r.name}-${i}`}
                    style={styles.resultRow}
                    onPress={() => handleSelectResult(r)}
                  >
                    <Text style={styles.resultName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.resultMeta}>
                      {r.brand ? `${r.brand} \u00B7 ` : ''}{r.ingredients.length} ingredients
                    </Text>
                  </TouchableOpacity>
                ))}
                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <Text style={styles.noResults}>No results found. Try a different search or enter manually.</Text>
                )}
              </View>
            )}

            {mode === 'barcode' && (
              <View style={styles.barcodeMode}>
                {hasPermission && device && VisionCamera ? (
                  <>
                    <View style={styles.cameraBox}>
                      <VisionCamera
                        style={styles.camera}
                        device={device}
                        isActive={mode === 'barcode'}
                        codeScanner={codeScanner}
                      />
                      <View style={styles.cameraOverlay}>
                        <View style={[
                          styles.scanFrame,
                          barcodeFound && styles.scanFrameFound,
                        ]} />
                        {barcodeFound && (
                          <View style={styles.scanFeedback}>
                            <Feather name="check-circle" size={28} color={Colors.success} />
                            <Text style={styles.scanFeedbackText}>Barcode detected</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.photoFallbackLink}
                      onPress={() => setMode('photo')}
                    >
                      <Feather name="camera" size={14} color={Colors.primary} />
                      <Text style={styles.photoFallbackText}>No barcode? Take a photo instead</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.noResults}>Camera permission required to scan barcodes.</Text>
                )}
              </View>
            )}

            {mode === 'photo' && (
              <View style={styles.photoMode}>
                {hasPermission && device && VisionCamera ? (
                  <>
                    <Text style={styles.photoHint}>
                      Point at the product so the name and brand are visible
                    </Text>
                    <View style={styles.cameraBox}>
                      <VisionCamera
                        ref={cameraRef}
                        style={styles.camera}
                        device={device}
                        isActive={mode === 'photo'}
                        photo={true}
                      />
                      {photoIdentifying && (
                        <View style={styles.photoOverlay}>
                          <ActivityIndicator size="large" color={Colors.textOnDark} />
                          <Text style={styles.photoOverlayText}>Identifying product...</Text>
                          <TouchableOpacity
                            style={styles.photoCancelButton}
                            onPress={() => { photoCancelledRef.current = true; setPhotoIdentifying(false); setMode('menu'); }}
                            hitSlop={12}
                          >
                            <Text style={styles.photoCancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.shutterButton, photoIdentifying && styles.shutterButtonDisabled]}
                      onPress={handlePhotoCapture}
                      disabled={photoIdentifying}
                      activeOpacity={0.7}
                    >
                      <View style={styles.shutterInner} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.noResults}>Camera permission required to take photos.</Text>
                )}
              </View>
            )}

            {mode === 'manual' && (
              <View style={styles.manualMode}>
                <Text style={styles.fieldLabel}>Product name</Text>
                <TextInput
                  style={styles.textField}
                  placeholder="e.g. CeraVe Moisturizer"
                  placeholderTextColor={Colors.textMuted}
                  value={manualName}
                  onChangeText={setManualName}
                  autoFocus
                />
                <Text style={styles.fieldLabel}>Ingredients (comma-separated)</Text>
                <TextInput
                  style={[styles.textField, styles.textFieldMulti]}
                  placeholder="e.g. Niacinamide, Hyaluronic Acid, Ceramides"
                  placeholderTextColor={Colors.textMuted}
                  value={manualIngredients}
                  onChangeText={setManualIngredients}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.confirmButton, !manualName.trim() && styles.confirmButtonDisabled]}
                  onPress={handleManualAdd}
                  disabled={!manualName.trim()}
                >
                  <Text style={styles.confirmText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'schedule' && selected && (
              <View style={styles.scheduleMode}>
                <Text style={styles.selectedName} numberOfLines={2}>{selected.name}</Text>
                {selected.brand && (
                  <Text style={styles.selectedBrand} numberOfLines={1}>{selected.brand}</Text>
                )}
                <Text style={styles.selectedMeta}>{selected.ingredients.length} ingredients</Text>

                <Text style={styles.fieldLabel}>When do you use this product?</Text>
                <View style={styles.scheduleOptions}>
                  {(['AM', 'PM', 'both'] as UsageSchedule[]).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.scheduleChip, schedule === s && styles.scheduleChipActive]}
                      onPress={() => setSchedule(s)}
                    >
                      <Text style={[styles.scheduleChipText, schedule === s && styles.scheduleChipTextActive]}>
                        {s === 'both' ? 'AM & PM' : s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmAdd}>
                  <Text style={styles.confirmText}>Add Product</Text>
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
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
    minHeight: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  sheetTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  sheetContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  menuOptions: {
    gap: Spacing.sm,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  menuDesc: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  searchMode: {
    gap: Spacing.sm,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
  },
  resultRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: 2,
  },
  resultName: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  resultMeta: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  noResults: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  barcodeMode: {
    alignItems: 'center',
  },
  cameraBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
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
    width: 200,
    height: 200,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    backgroundColor: 'transparent',
  },
  scanFrameFound: {
    borderColor: Colors.success,
    borderWidth: 3,
  },
  scanFeedback: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  scanFeedbackText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  photoFallbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  photoFallbackText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  photoMode: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  photoHint: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  photoOverlayText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  photoCancelButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    minHeight: 44, // Apple HIG minimum tap target
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCancelText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    textDecorationLine: 'underline',
  },
  shutterButton: {
    width: 72, // Apple HIG: camera shutter ≥ 60pt, we use 72pt for comfortable tap
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  shutterButtonDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary,
  },
  manualMode: {
    gap: Spacing.md,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  textField: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    height: 48,
  },
  textFieldMulti: {
    height: 90,
    textAlignVertical: 'top',
  },
  scheduleMode: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  selectedName: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    textAlign: 'center',
  },
  selectedBrand: {
    color: Colors.primary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    marginTop: -4,
  },
  selectedMeta: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  scheduleOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  scheduleChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.glass,
  },
  scheduleChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceOverlay,
  },
  scheduleChipText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  scheduleChipTextActive: {
    color: Colors.primary,
  },
  confirmButton: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
});
