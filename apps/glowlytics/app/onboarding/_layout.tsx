import { Stack } from 'expo-router';
import { Glow } from '../../src/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Glow.palette.bg },
        animation: 'fade',
      }}
    />
  );
}
