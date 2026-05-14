import { Stack } from 'expo-router';

export default function ArchitectureLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
