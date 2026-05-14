import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];
import { colors } from '@/theme';

interface Props {
  name: string;
  focused: boolean;
}

const ICON_MAP: Record<string, { outline: IoniconsName; filled: IoniconsName }> = {
  'Groups':        { outline: 'people-outline',    filled: 'people' },
  'News':          { outline: 'newspaper-outline', filled: 'newspaper' },
  'Profile':       { outline: 'person-outline',    filled: 'person' },
  'Family':        { outline: 'heart-outline',     filled: 'heart' },
  'This Week':     { outline: 'book-outline',      filled: 'book' },
  'Events':        { outline: 'calendar-outline',  filled: 'calendar' },
  'Schedule':      { outline: 'time-outline',      filled: 'time' },
  'Announcements': { outline: 'megaphone-outline', filled: 'megaphone' },
};

export function TabBarIcon({ name, focused }: Props) {
  const map = ICON_MAP[name];
  if (!map) return null;
  return (
    <Ionicons
      name={focused ? map.filled : map.outline}
      size={22}
      color={focused ? colors.primary : colors.textMuted}
    />
  );
}
