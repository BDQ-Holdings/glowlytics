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

  const handleCameraPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!useStore.getState().canPerformScan()) {
      trackEvent('paywall_shown', { trigger: 'camera_tab' });
    }
    if (!(await gateWithPaywall())) return;
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
        <Tabs.Screen
          name="products"
          options={{ title: 'Products' }}
        />
        <Tabs.Screen
          name="camera"
          options={{ title: 'Camera' }}
        />
        <Tabs.Screen
          name="reports"
          options={{ title: 'Reports' }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile' }}
        />
      </Tabs>
    </>
  );
}
