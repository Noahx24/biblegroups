import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { GroupProvider } from '@/context/GroupContext';
import { ThisWeekScreen } from '@/screens/ThisWeekScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { AnnouncementsScreen } from '@/screens/AnnouncementsScreen';
import { TabBarIcon } from '@/components/TabBarIcon';
import { colors } from '@/theme';
import type { AppStackParamList } from '@/navigation/RootNavigator';

export type ClassTabsParamList = {
  'This Week': undefined;
  Events: undefined;
  Schedule: undefined;
  Announcements: undefined;
};

export type VolunteerTabsParamList = {
  Schedule: undefined;
  Announcements: undefined;
};

const ClassTabs = createBottomTabNavigator<ClassTabsParamList>();
const VolunteerTabs = createBottomTabNavigator<VolunteerTabsParamList>();

const sharedTabOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: 'rgba(247,241,229,0.96)',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' as const, letterSpacing: 0.1 },
};

type Props = NativeStackScreenProps<AppStackParamList, 'GroupDetail'>;

export function GroupNavigator({ route }: Props) {
  const { group, myRole } = route.params;

  return (
    <GroupProvider group={group} myRole={myRole}>
      {group.type === 'class' ? (
        <ClassTabs.Navigator
          screenOptions={({ route: r }) => ({
            ...sharedTabOptions,
            tabBarIcon: ({ focused }) => <TabBarIcon name={r.name} focused={focused} />,
          })}
        >
          <ClassTabs.Screen name="This Week" component={ThisWeekScreen} />
          <ClassTabs.Screen name="Events" component={EventsScreen} />
          <ClassTabs.Screen name="Schedule" component={ScheduleScreen} />
          <ClassTabs.Screen name="Announcements" component={AnnouncementsScreen} />
        </ClassTabs.Navigator>
      ) : (
        <VolunteerTabs.Navigator
          screenOptions={({ route: r }) => ({
            ...sharedTabOptions,
            tabBarIcon: ({ focused }) => <TabBarIcon name={r.name} focused={focused} />,
          })}
        >
          <VolunteerTabs.Screen name="Schedule" component={ScheduleScreen} />
          <VolunteerTabs.Screen name="Announcements" component={AnnouncementsScreen} />
        </VolunteerTabs.Navigator>
      )}
    </GroupProvider>
  );
}
