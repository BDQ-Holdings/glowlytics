import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../../src/store/useStore';
import { CoachingTooltip } from '../../src/components/CoachingTooltip';
import { NotchedTabBar } from '../../src/components/navigation/NotchedTabBar';
import { gateWithPaywall } from '../../src/services/subscription';
import { trackEvent } from '../../src/services/analytics';

export default function TabsLayout() {
  const router = useRouter();
  const dailyRecords = useStore((s) => s.dailyRecords);
  const isFirstScan = dailyRecords.length === 0;

  const handleCameraPress = async (activeRouteName: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Shelf tab → add a product (the camera fronts the AddProductSheet's
    // OCR/barcode flow). No paywall — the scanner is free.
    if (activeRouteName === 'products') {
      trackEvent('camera_fab_route', { route: activeRouteName, target: 'add_product' });
      useStore.getState().requestAddProduct();
      return;
    }

    // Today (and any other route that exposes the FAB) → facial-scan camera.
    if (!useStore.getState().canPerformScan()) {
      trackEvent('paywall_shown', { trigger: 'camera_tab' });
    }
    if (!(await gateWithPaywall())) return;
    trackEvent('camera_fab_route', { route: activeRouteName, target: 'scan' });
    router.push('/scan/camera');
  };

  return (
    <>
      <CoachingTooltip visible={isFirstScan} />
      <Tabs
        tabBar={(props) => (
          <NotchedTabBar {...props} onCameraPress={handleCameraPress} pulseCamera={isFirstScan} />
        )}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="today"
          options={{ title: 'Today' }}
        />
        {/* Story merged into Today (the day-story pager). Keep the route
            registered so deep-links still resolve, but hide it from the bar. */}
        <Tabs.Screen
          name="reports"
          options={{ title: 'Story', href: null }}
        />
        <Tabs.Screen
          name="camera"
          options={{ title: 'Camera' }}
        />
        <Tabs.Screen
          name="products"
          options={{ title: 'Shelf' }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Me' }}
        />
      </Tabs>
    </>
  );
}
