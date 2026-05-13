import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SignInScreen } from '@/screens/SignInScreen';
import { ThisWeekScreen } from '@/screens/ThisWeekScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { AnnouncementsScreen } from '@/screens/AnnouncementsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { colors } from '@/theme';

const Tabs = createBottomTabNavigator();

// Simple emoji-style icons keep us off any extra icon-font dependency.
const TAB_ICONS: Record<string, string> = {
  'This Week': '✝',
  Events: '✦',
  Schedule: '◷',
  Announcements: '✉',
  Profile: '○',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={[styles.tabIcon, { color: focused ? colors.primary : colors.textMuted }]}>
      {TAB_ICONS[name] ?? '•'}
    </Text>
  );
}

export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerStyle: {
          backgroundColor: colors.primary,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tabs.Screen name="This Week" component={ThisWeekScreen} />
      <Tabs.Screen name="Events" component={EventsScreen} />
      <Tabs.Screen name="Schedule" component={ScheduleScreen} />
      <Tabs.Screen name="Announcements" component={AnnouncementsScreen} />
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
  tabIcon: { fontSize: 18, lineHeight: 22 },
});
