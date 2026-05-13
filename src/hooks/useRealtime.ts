import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Subscribe to all writes (insert/update/delete) on a Postgres table and
// invoke `onChange` for any of them. The callback should be wrapped in
// useCallback so the subscription isn't torn down + recreated on every
// render.
//
// Each call gets a stable random ID (via useRef) so that multiple components
// subscribing to the same table don't create conflicting Supabase channels.
export function useRealtime(
  table: 'schedule' | 'weekly_verses' | 'events' | 'event_rsvps' | 'profiles' | 'announcements',
  onChange: () => void,
  filter?: string,
) {
  const idRef = useRef<string | null>(null);
  if (!idRef.current) {
    idRef.current = Math.random().toString(36).slice(2, 8);
  }

  useEffect(() => {
    const channelName = `realtime:${table}:${filter ?? 'all'}:${idRef.current}`;
    const channel = supabase
      .channel(channelName)
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
