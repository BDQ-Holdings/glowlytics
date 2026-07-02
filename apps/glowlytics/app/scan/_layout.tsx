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
      <Stack.Screen name="ai-consent" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="analyzing" options={{ gestureEnabled: false, animation: 'fade' }} />
      {/* results is a terminal flow screen: locking the swipe-back gesture stops
          a swipe from stranding the user on the half-torn-down analyzing screen
          (results -> analyzing -> ...). camera is intentionally NOT locked — users
          must be able to swipe back to cancel the scan; the brief capture window
          is guarded in-component (capturing flag + on-focus reset). */}
      <Stack.Screen name="results" options={{ gestureEnabled: false }} />
      <Stack.Screen name="face-map" options={{ animation: 'fade' }} />
      <Stack.Screen name="zone-detail" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="method" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
