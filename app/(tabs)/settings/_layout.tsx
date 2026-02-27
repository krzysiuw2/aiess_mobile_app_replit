import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="site" />
      <Stack.Screen name="system" />
      <Stack.Screen name="account" />
      <Stack.Screen name="app-settings" />
    </Stack>
  );
}
