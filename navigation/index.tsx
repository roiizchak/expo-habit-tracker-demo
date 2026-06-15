import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useStore } from '../store/HabitStore';
import { useAuth } from '../store/AuthProvider';
import { AuthScreen } from '../screens/AuthScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddEditHabitScreen } from '../screens/AddEditHabitScreen';
import { HabitDetailScreen } from '../screens/HabitDetailScreen';
import { ChallengeRewardScreen } from '../screens/ChallengeRewardScreen';
import { colors, font } from '../theme/tokens';
import type { RootStackParamList, TabsParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.ink,
    border: colors.hairline,
    primary: colors.amber,
    notification: colors.amber,
  },
};

const TAB_EMOJI: Record<keyof TabsParamList, string> = {
  Home: '🏠',
  Insights: '📊',
  Settings: '⚙️',
};

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.hairline,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 18, opacity: color === colors.amber ? 1 : 0.6 }}>
            {TAB_EMOJI[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { sessionReady, session } = useAuth();
  const { ready, onboarded } = useStore();
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;
  // Habit id from a notification tap that arrived before the navigator (or
  // onboarding) was ready; flushed in NavigationContainer.onReady.
  const pendingHabit = useRef<string | null>(null);

  const routeToHabit = (habitId: string) => {
    if (!onboardedRef.current) return; // HabitDetail only exists post-onboarding
    if (navigationRef.isReady()) navigationRef.navigate('HabitDetail', { habitId });
    else pendingHabit.current = habitId;
  };

  // Route a tapped reminder to that habit's detail screen — including a tap
  // that cold-started the app (getLastNotificationResponseAsync).
  useEffect(() => {
    let mounted = true;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const habitId = response?.notification.request.content.data?.habitId as string | undefined;
      if (mounted && habitId) routeToHabit(habitId);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const habitId = response.notification.request.content.data?.habitId as string | undefined;
      if (habitId) routeToHabit(habitId);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const flushPending = () => {
    const id = pendingHabit.current;
    if (id && onboardedRef.current && navigationRef.isReady()) {
      pendingHabit.current = null;
      navigationRef.navigate('HabitDetail', { habitId: id });
    }
  };

  // A tap that arrived during onboarding routes once the user finishes it.
  useEffect(() => {
    if (onboarded) flushPending();
  }, [onboarded]);

  // Splash while auth resolves, or while the signed-in user's store hydrates.
  if (!sessionReady || (session && !ready)) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={flushPending}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : !onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen
              name="HabitDetail"
              component={HabitDetailScreen}
              options={{
                headerShown: true,
                title: '',
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.ink,
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="AddEditHabit"
              component={AddEditHabitScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ChallengeReward"
              component={ChallengeRewardScreen}
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
