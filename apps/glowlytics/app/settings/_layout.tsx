import { Stack } from 'expo-router';
import { Glow } from '../../src/constants/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Glow.palette.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="delete-account" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
