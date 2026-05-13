import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Subscribe to all writes on a Postgres table and call onChange.
// The callback is stored in a ref so a new function reference (e.g. from a
// parent re-render) never tears down and rebuilds the channel — only changes
// to table or filter do that.
export function useRealtime(
  table: 'schedule' | 'weekly_verses' | 'events' | 'event_rsvps' | 'profiles' | 'announcements',
  onChange: () => void,
  filter?: string,
) {
  const idRef = useRef<string | null>(null);
  if (!idRef.current) {
    idRef.current = Math.random().toString(36).slice(2, 8);
  }

  // Always keep the latest callback without re-subscribing
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const channelName = `realtime:${table}:${filter ?? 'all'}:${idRef.current}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        filter
          ? { event: '*', schema: 'public', table, filter }
          : { event: '*', schema: 'public', table },
        () => onChangeRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, filter]); // onChange intentionally excluded — handled via ref
}
