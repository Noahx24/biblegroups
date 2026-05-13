import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Subscribe to all writes (insert/update/delete) on a Postgres table and
// invoke `onChange` for any of them. The callback should be wrapped in
// useCallback so the subscription isn't torn down + recreated on every
// render.
//
// The Realtime publication must include the table — see migration 0004.
// Without that, postgres_changes events never fire and onChange never runs.
export function useRealtime(
  table: 'schedule' | 'weekly_verses' | 'events' | 'event_rsvps' | 'profiles' | 'announcements',
  onChange: () => void,
  filter?: string,
) {
  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        filter
          ? { event: '*', schema: 'public', table, filter }
          : { event: '*', schema: 'public', table },
        () => onChange(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, onChange]);
}
