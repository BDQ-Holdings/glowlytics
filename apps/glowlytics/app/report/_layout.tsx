import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';

export default function ReportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
