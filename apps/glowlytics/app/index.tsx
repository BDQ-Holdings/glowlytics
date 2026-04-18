import React from 'react';
import { View } from 'react-native';
import { Colors } from '../src/constants/theme';

/**
 * Bridge screen — shown for a single frame while AuthRedirector
 * navigates to auth/onboarding/tabs. Matches the splash background
 * for a seamless transition.
 */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
