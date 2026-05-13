import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SignInScreen } from '@/screens/SignInScreen';
import { PasswordResetScreen } from '@/screens/PasswordResetScreen';
import { ThisWeekScreen } from '@/screens/ThisWeekScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { ChurchNewsScreen } from '@/screens/ChurchNewsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { colors } from '@/theme';
import { TabBarIcon } from '@/components/TabBarIcon';

const Tabs = createBottomTabNavigator();

export function RootNavigator() {
  const { session, loading, recoveryMode } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Recovery takes precedence over a normal session: the user clicked a
  // password-reset link and MUST set a new password before doing anything else.
  if (recoveryMode) {
    return <PasswordResetScreen />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: 'rgba(247,241,229,0.96)',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1 },
        tabBarIcon: ({ focused }) => <TabBarIcon name={route.name} focused={focused} />,
      })}
    >
      <Tabs.Screen name="This Week" component={ThisWeekScreen} />
      <Tabs.Screen name="Events" component={EventsScreen} />
      <Tabs.Screen name="Schedule" component={ScheduleScreen} />
      <Tabs.Screen name="Church News" component={ChurchNewsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
