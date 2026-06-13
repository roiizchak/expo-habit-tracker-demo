import React from 'react';
import { LogBox, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// expo-notifications logs (loudly) that REMOTE push is unavailable in Expo Go
// (SDK 53+). We only use LOCAL scheduled notifications, which work fine — so
// hide the expected dev-only warning/error overlay.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { HabitProvider } from './store/HabitStore';
import { FeedbackProvider } from './store/FeedbackProvider';
import { RootNavigator } from './navigation';
import { colors } from './theme/tokens';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <HabitProvider>
        <FeedbackProvider>
          <RootNavigator />
        </FeedbackProvider>
      </HabitProvider>
    </SafeAreaProvider>
  );
}
