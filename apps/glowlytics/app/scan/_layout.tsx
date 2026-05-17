import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';

export default function ScanLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="analyzing" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="face-map" options={{ animation: 'fade' }} />
      <Stack.Screen name="zone-detail" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="method" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
