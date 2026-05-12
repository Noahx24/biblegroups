import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SignInScreen } from '@/screens/SignInScreen';
import { ThisWeekScreen } from '@/screens/ThisWeekScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

const Tabs = createBottomTabNavigator();

export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Tabs.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="This Week" component={ThisWeekScreen} />
      <Tabs.Screen name="Events" component={EventsScreen} />
      <Tabs.Screen name="Schedule" component={ScheduleScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}
