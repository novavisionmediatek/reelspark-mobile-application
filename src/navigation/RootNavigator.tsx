import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import { FeedScreen } from '../screens/FeedScreen';
import { SubmitScreen } from '../screens/SubmitScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { VideoPlayerScreen } from '../screens/VideoPlayerScreen';
import { ProfileStackNavigator } from './ProfileStackNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Tab-bar-free by design — see PROJECT_PLAN.md §3a. Feed is the always-underneath
// root screen; Submit opens as a modal off its floating "+"; Profile (which now
// owns My Videos too) pushes as a full stack off Feed's corner avatar. AuthStack
// (App.tsx) sits in front of all of this.
export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="Submit" component={SubmitScreen} options={{ presentation: 'modal', headerShown: true, title: 'Submit a link' }} />
      <Stack.Screen name="Profile" component={ProfileStackNavigator} options={{ presentation: 'card' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ presentation: 'modal', headerShown: true, title: 'Membership' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ presentation: 'card' }} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} options={{ presentation: 'fullScreenModal', headerShown: false }} />
    </Stack.Navigator>
  );
}
