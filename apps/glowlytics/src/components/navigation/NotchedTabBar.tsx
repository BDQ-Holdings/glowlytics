import React, { useEffect, useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../../constants/theme';
import { GlowIcon, type GlowIconName } from '../glow/GlowIcons';

// ─── Layout ──────────────────────────────────────────────────────────
const CALM_EASING = Easing.out(Easing.cubic);
const TAB_HEIGHT = 64;
const CAMERA_SIZE = 60;
const BAR_RADIUS = 20;
// FAB hovers fully ABOVE the bar with a clean gap — no overlap means no
// shadow bleed onto the tab labels behind it. `FAB_GAP_ABOVE` is the
// vertical space between the FAB's bottom edge and the bar's top edge.
// Horizontal centering uses a full-width anchor + `alignItems: 'center'`
// rather than `left: '50%'` + negative margin — the latter is unreliable
// in RN when the parent has asymmetric padding/insets (visibly drifts
// right of true centre on iPhone notch devices).
const FAB_GAP_ABOVE = 10;

/** Bottom content inset for screens behind the tab bar. */
export const DOCKED_TAB_SPACE = TAB_HEIGHT + Spacing.sm;

// Safe area adjustment — the bar's built-in padding partially covers the safe area
const SAFE_AREA_OVERLAP = 2;
const BOTTOM_INSET_MIN = 8;

// ─── Tab config ──────────────────────────────────────────────────────
// Route file names are kept stable (today, products, profile) to preserve
// deep-links; only the user-facing labels and icons reflect the Glow
// redesign (Today / Shelf / Me). The Story tab was retired in the May 2026
// redesign hand-off — its content is now folded into the Today day-pager.
type TabConfig = {
  name: string;
  label: string;
  icon: GlowIconName;
};

const SIDE_TABS: TabConfig[] = [
  { name: 'today',    label: 'Today', icon: 'today' },
  { name: 'products', label: 'Shelf', icon: 'shelf' },
  { name: 'profile',  label: 'Me',    icon: 'me' },
];

// ─── Animated Tab ────────────────────────────────────────────────────
interface AnimatedTabProps {
  tab: TabConfig;
  isFocused: boolean;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
}

function AnimatedTab({ tab, isFocused, accessibilityLabel, testID, onPress, onLongPress }: AnimatedTabProps) {
  const reducedMotion = useReducedMotion();
  const pressScale = useSharedValue(1);
  const activeProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      activeProgress.value = isFocused ? 1 : 0;
      return;
    }
    activeProgress.value = withTiming(isFocused ? 1 : 0, {
      duration: 200,
      easing: CALM_EASING,
    });
  }, [isFocused, reducedMotion]);

  const handlePressIn = () => {
    if (reducedMotion) return;
    pressScale.value = withSpring(0.94, { damping: 18, stiffness: 280 });
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    pressScale.value = withSpring(1, { damping: 14, stiffness: 200 });
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  // Active icon lifts 1px — subtle elevated feel above the pill
  const iconLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -activeProgress.value }],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    transform: [{ scale: 0.8 + activeProgress.value * 0.2 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={accessibilityLabel ?? tab.label}
      testID={testID}
      // Generous vertical splash zone so taps just above the icon (where the
      // eye expects the touch target relative to the camera button) still
      // land. Lateral stays small so adjacent tabs don't shadow each other.
      hitSlop={{ top: 20, bottom: 28, left: 6, right: 6 }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabSlot}
    >
      <Animated.View style={[styles.tabInner, containerStyle]}>
        <Animated.View style={[styles.iconWrap, iconLiftStyle]}>
          <Animated.View style={[styles.iconBgPill, pillStyle]} />
          <GlowIcon
            name={tab.icon}
            size={20}
            color={isFocused ? Glow.palette.accent : Colors.textMuted}
            stroke={isFocused ? 1.8 : 1.5}
          />
        </Animated.View>
        <Text
          numberOfLines={1}
          style={[styles.tabLabel, { color: isFocused ? Colors.text : Colors.textMuted }]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Camera Button ───────────────────────────────────────────────────
// Glow palette accents — `accent` (dusk plum) and a slightly lifted tone for
// the gradient. Falls back to the previous teal pair when the palette key
// drifts.
const GRADIENT_COLORS: readonly [string, string] = (() => {
  const a = Glow.palette.accent;
  const b = Glow.palette.accent2;
  return [a, b] as const;
})();

interface AnimatedCameraProps {
  onPress: () => void;
  pulseCamera: boolean;
  accessibilityLabel?: string;
  isFocused: boolean;
  /** When true the FAB animates to 0 opacity and stops receiving taps. Used
   *  on the Me tab — the camera CTA has no meaningful action there. */
  hidden?: boolean;
}

function AnimatedCameraButton({ onPress, pulseCamera, accessibilityLabel, isFocused, hidden }: AnimatedCameraProps) {
  const reducedMotion = useReducedMotion();
  const pressScale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    if (pulseCamera) {
      pulseScale.value = withRepeat(
        withTiming(1.05, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300, easing: CALM_EASING });
    }
  }, [pulseCamera, reducedMotion]);

  const handlePressIn = () => {
    if (reducedMotion) return;
    pressScale.value = withSpring(0.93, { damping: 18, stiffness: 280 });
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    pressScale.value = withSpring(1, { damping: 12, stiffness: 180 });
  };

  // Compose press scale × pulse × hide opacity into one transform/opacity
  // pair. The animated style is read by the outer wrapper so taps fall
  // through to the bar (or to nothing) once the FAB fades out.
  const hideProgress = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      hideProgress.value = hidden ? 1 : 0;
      return;
    }
    hideProgress.value = withTiming(hidden ? 1 : 0, { duration: 220, easing: CALM_EASING });
  }, [hidden, reducedMotion]);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: 1 - hideProgress.value,
    transform: [
      { scale: pressScale.value * pulseScale.value * (1 - 0.15 * hideProgress.value) },
      { translateY: 6 * hideProgress.value },
    ],
  }));

  return (
    // box-none is load-bearing here. cameraAnchor is position: absolute with
    // left/right: 0 and zIndex: 10 — without it, the invisible wrapper above
    // the centered 56px button intercepts taps across the entire upper strip
    // of the tab bar (the icon zone of every other tab), so side-tab presses
    // get eaten and "require multiple clicks to change tab."
    <Animated.View
      style={[styles.cameraAnchor, outerStyle]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Open camera'}
        accessibilityState={{ selected: isFocused, disabled: hidden }}
        // FAB sits in empty space above the bar — generous symmetric slop
        // is safe (won't poach any side tab) and brings the tap target up
        // to a comfortable 80×80.
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={hidden}
      >
        <View style={styles.cameraOuter}>
          <View style={styles.gradientClip} pointerEvents="none">
            <LinearGradient
              colors={[...GRADIENT_COLORS]}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
          <GlowIcon name="camera" size={22} color={Glow.palette.surface} stroke={1.6} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Tab Bar ────────────────────────────────────────────────────
type NotchedTabBarProps = BottomTabBarProps & {
  /** Called when the FAB is tapped. Receives the currently-focused route
   *  name so the host can branch (today → /scan/camera, products → add a
   *  product, etc). The host is responsible for the actual side-effect; the
   *  bar stays presentation-only. */
  onCameraPress: (activeRouteName: string) => void;
  pulseCamera?: boolean;
};

export function NotchedTabBar({
  state,
  descriptors,
  navigation,
  onCameraPress,
  pulseCamera = false,
}: NotchedTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const keyboardVisible = useSharedValue(0); // 0 = visible bar, 1 = hidden

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      keyboardVisible.value = reducedMotion
        ? 1
        : withTiming(1, { duration: 200, easing: CALM_EASING });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardVisible.value = reducedMotion
        ? 0
        : withTiming(0, { duration: 250, easing: CALM_EASING });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [reducedMotion]);

  const barAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - keyboardVisible.value,
    transform: [{ translateY: keyboardVisible.value * 24 }],
  }));

  const indexByName = useMemo(() => {
    return new Map(state.routes.map((route, index) => [route.name, index]));
  }, [state.routes]);

  const renderSideTab = (tab: TabConfig) => {
    const index = indexByName.get(tab.name);
    if (typeof index !== 'number') {
      return <View key={tab.name} style={styles.tabSlot} />;
    }

    const route = state.routes[index];
    const isFocused = state.index === index;
    const options = descriptors[route.key]?.options;

    return (
      <AnimatedTab
        key={tab.name}
        tab={tab}
        isFocused={isFocused}
        accessibilityLabel={options?.tabBarAccessibilityLabel}
        testID={options?.tabBarButtonTestID}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }}
        onLongPress={() => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        }}
      />
    );
  };

  const cameraIndex = indexByName.get('camera');
  const cameraRoute = typeof cameraIndex === 'number' ? state.routes[cameraIndex] : undefined;
  const cameraOptions = cameraRoute ? descriptors[cameraRoute.key]?.options : undefined;
  const isCameraFocused = typeof cameraIndex === 'number' && state.index === cameraIndex;
  const activeRouteName = state.routes[state.index]?.name ?? '';
  // The FAB has no action on the Me tab — fade it out rather than leaving
  // a dead-tap target above the bar.
  const cameraHidden = activeRouteName === 'profile';

  const bottomPad = Math.max(insets.bottom - SAFE_AREA_OVERLAP, BOTTOM_INSET_MIN);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View pointerEvents="box-none" style={[styles.dockedWrap, barAnimStyle, { paddingBottom: bottomPad }]}>
        <View pointerEvents="box-none" style={styles.tabBarContainer}>
          {/* Bar background — simple rounded pill */}
          <View style={styles.barBackground} />

          {/* Tab buttons — 3 evenly-spaced tabs. The camera is a true FAB
              (rendered as a sibling, position: absolute above-right) so the
              bar itself stays perfectly symmetric. */}
          <View style={styles.tabsRow}>
            {SIDE_TABS.map(renderSideTab)}
          </View>

          {/* Camera button — floats above the bar */}
          <AnimatedCameraButton
            onPress={() => onCameraPress(activeRouteName)}
            pulseCamera={pulseCamera}
            accessibilityLabel={cameraOptions?.tabBarAccessibilityLabel}
            isFocused={isCameraFocused}
            hidden={cameraHidden}
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  dockedWrap: {
    paddingHorizontal: Spacing.md,
  },
  tabBarContainer: {
    height: TAB_HEIGHT,
    overflow: 'visible',
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.93)',
    borderRadius: BAR_RADIUS,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 8,
  },

  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  tabSlot: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    // The 3 side tabs now share the bar symmetrically and the camera is a
    // sibling FAB hovering above the bar, so the bottom-padding bias we
    // used to apply (to compensate for an overlapping camera circle) is no
    // longer needed.
    paddingBottom: 0,
  },
  // (cameraSpacer removed — the bar now hosts 3 evenly-spaced tabs.)

  // Camera FAB — hovers fully above the bar, perfectly centered horizontally.
  // Full-width absolute container + `alignItems: 'center'` is the only
  // RN-safe way to centre an absolutely-positioned child; `left: '50%'`
  // computes against the parent's content box which the safe-area inset
  // and `dockedWrap` padding visibly shifts off-centre.
  cameraAnchor: {
    position: 'absolute',
    top: -(CAMERA_SIZE + FAB_GAP_ABOVE),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  cameraOuter: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: CAMERA_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft brand halo — kept small (radius 12, opacity 0.22) so the FAB
    // reads as floating rather than glowing. With the FAB fully above the
    // bar, the halo has empty space to bleed into instead of obscuring
    // the labels behind it.
    shadowColor: Glow.palette.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  gradientClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CAMERA_SIZE / 2,
    overflow: 'hidden',
  },

  iconWrap: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    position: 'relative',
  },
  tabIcon: {
    // Feather icons have inconsistent optical weight — nudge down 0.5px
    // so icons like 'sun' (top-heavy) look centered with 'user' (bottom-heavy)
    marginTop: 0.5,
  },
  iconBgPill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glowPrimary,
    borderRadius: BorderRadius.full,
  },
  tabLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    letterSpacing: 0.2,
  },
});
