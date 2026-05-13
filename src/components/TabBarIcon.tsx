import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface Props {
  name: string;
  focused: boolean;
}

const ICON_MAP: Record<string, { outline: string; filled: string }> = {
  'Groups':        { outline: 'people-outline',    filled: 'people' },
  'News':          { outline: 'newspaper-outline', filled: 'newspaper' },
  'Profile':       { outline: 'person-outline',    filled: 'person' },
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
      name={(focused ? map.filled : map.outline) as any}
      size={22}
      color={focused ? colors.primary : colors.textMuted}
    />
  );
}
