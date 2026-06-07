import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SignInScreen } from '@/screens/SignInScreen';
import { PasswordResetScreen } from '@/screens/PasswordResetScreen';
import { SelectChurchScreen } from '@/screens/SelectChurchScreen';
import { GroupsListScreen } from '@/screens/GroupsListScreen';
import { ChurchNewsScreen } from '@/screens/ChurchNewsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { GroupNavigator } from '@/navigation/GroupNavigator';
import { AdminScreen } from '@/screens/AdminScreen';
import { AdminGroupMembersScreen } from '@/screens/AdminGroupMembersScreen';
import { FamilyScreen } from '@/screens/FamilyScreen';
import { MyWeekScreen } from '@/screens/MyWeekScreen';
import { AssignmentBanner } from '@/components/AssignmentBanner';
import { colors, typography } from '@/theme';
import { TabBarIcon } from '@/components/TabBarIcon';
import type { Group, MemberRole } from '@/types';

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  GroupDetail: { group: Group; myRole: MemberRole };
  Admin: undefined;
  AdminGroupMembers: { group: Group };
};

export type MainTabsParamList = {
  Groups: undefined;
  'My Week': undefined;
  News: undefined;
  Family: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

function MainTabs() {
  return (
    <View style={styles.tabsWrap}>
      {/* Renders nothing (zero height) unless the user has a pending assignment,
          so normal screens keep their own safe-area spacing. */}
      <AssignmentBanner />
      <View style={styles.tabsFill}>
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
              paddingTop: 6,
            },
            tabBarLabelStyle: typography.navLabel,
            tabBarIconStyle: { marginBottom: -2 },
            tabBarIcon: ({ focused }) => <TabBarIcon name={route.name} focused={focused} />,
          })}
        >
          <Tabs.Screen name="Groups" component={GroupsListScreen} />
          <Tabs.Screen name="My Week" component={MyWeekScreen} />
          <Tabs.Screen name="News" component={ChurchNewsScreen} />
          <Tabs.Screen name="Family" component={FamilyScreen} />
          <Tabs.Screen name="Profile" component={ProfileScreen} />
        </Tabs.Navigator>
      </View>
    </View>
  );
}

export function RootNavigator() {
  const { session, loading, recoveryMode, churchId, profileLoaded } = useAuth();

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

  // Wait for the profile before deciding whether to show the church gate, so a
  // user with a church set doesn't briefly flash the selection screen.
  if (!profileLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Onboarding gate: every user must belong to a church.
  if (!churchId) {
    return <SelectChurchScreen />;
  }

  return (
    <Stack.Navigator id="AppStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="GroupDetail"
        component={GroupNavigator}
        options={({ route }) => ({
          headerShown: true,
          title: route.params.group.name,
          headerBackTitle: 'Groups',
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontSize: 18, fontWeight: '600' },
          animation: 'slide_from_right',
        })}
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
  tabsWrap: { flex: 1, backgroundColor: colors.background },
  tabsFill: { flex: 1 },
});
