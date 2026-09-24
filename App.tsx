import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Unbounded_500Medium, Unbounded_600SemiBold, Unbounded_700Bold } from '@expo-google-fonts/unbounded';
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from './src/lib/AuthProvider';
import { initReferralCapture } from './src/lib/referral';
import { registerForPushNotifications } from './src/lib/pushNotifications';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { CompleteProfileScreen } from './src/screens/auth/CompleteProfileScreen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/tokens';

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator();

// Without this the navigator's scene/card background is React Navigation's default
// light grey, which shows around max-width screens on wide viewports.
const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.indigo,
    notification: colors.indigo,
  },
};

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.indigo} />
    </View>
  );
}

// Three-way switch ported from the web app's RootNavigator: signed out → AuthStack,
// signed in but no display_name yet → CompleteProfile, otherwise → the real app
// (this app's own tab-bar-free RootNavigator, §3a — not a straight port of web's).
function AppGate() {
  const { session, profile, loading } = useAuth();

  // Registered on login (§7) — re-runs if the signed-in user changes (e.g. a
  // shared device), harmless to re-run on the same user since the backend
  // RPC upserts by token.
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) registerForPushNotifications();
  }, [userId]);

  if (loading) return <LoadingScreen />;

  const needsProfile = session && (!profile || !profile.display_name);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : needsProfile ? (
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      ) : (
        <Stack.Screen name="Root" component={RootNavigator} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Unbounded_500Medium,
    Unbounded_600SemiBold,
    Unbounded_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    initReferralCapture();
  }, []);

  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <AppGate />
          </NavigationContainer>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
