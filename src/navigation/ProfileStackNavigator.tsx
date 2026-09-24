import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MyVideosScreen } from '../screens/MyVideosScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ReferralWalletScreen } from '../screens/ReferralWalletScreen';
import { HelpSupportScreen } from '../screens/HelpSupportScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

// Every screen here (real or placeholder) draws its own header row, matching the
// web app's original ProfileStackNavigator — the native header stays off for all
// of them. MyVideosScreen and ReferralWalletScreen are still placeholders; real
// ports land Phase 3 and Phase 5 respectively (PROJECT_PLAN.md §9).
export function ProfileStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="MyVideos" component={MyVideosScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ReferralWallet" component={ReferralWalletScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
}
