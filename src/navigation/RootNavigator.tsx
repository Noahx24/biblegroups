import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SignInScreen } from '@/screens/SignInScreen';
import { PasswordResetScreen } from '@/screens/PasswordResetScreen';
import { GroupsListScreen } from '@/screens/GroupsListScreen';
import { ChurchNewsScreen } from '@/screens/ChurchNewsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { GroupNavigator } from '@/navigation/GroupNavigator';
import { AdminScreen } from '@/screens/AdminScreen';
import { AdminGroupMembersScreen } from '@/screens/AdminGroupMembersScreen';
import { FamilyScreen } from '@/screens/FamilyScreen';
import { colors } from '@/theme';
import { TabBarIcon } from '@/components/TabBarIcon';
import type { Group, MemberRole } from '@/types';

export type AppStackParamList = {
  MainTabs: undefined;
  GroupDetail: { group: Group; myRole: MemberRole };
  Admin: undefined;
  AdminGroupMembers: { group: Group };
};

export type MainTabsParamList = {
  Groups: undefined;
  News: undefined;
  Family: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

function MainTabs() {
  return (
    <Tabs.Navigator
      id="MainTabs"
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
      <Tabs.Screen name="Groups" component={GroupsListScreen} />
      <Tabs.Screen name="News" component={ChurchNewsScreen} />
      <Tabs.Screen name="Family" component={FamilyScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { session, loading, recoveryMode } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (recoveryMode) {
    return <PasswordResetScreen />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <Stack.Navigator id="AppStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="GroupDetail"
        component={GroupNavigator}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AdminGroupMembers"
        component={AdminGroupMembersScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
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
