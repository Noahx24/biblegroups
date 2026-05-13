import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface Props {
  name: string;
  focused: boolean;
}

const ICON_MAP: Record<string, { outline: string; filled: string }> = {
  'This Week':   { outline: 'book-outline',          filled: 'book' },
  'Events':      { outline: 'calendar-outline',      filled: 'calendar' },
  'Schedule':    { outline: 'time-outline',           filled: 'time' },
  'Church News': { outline: 'notifications-outline', filled: 'notifications' },
  'Profile':     { outline: 'person-outline',        filled: 'person' },
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
