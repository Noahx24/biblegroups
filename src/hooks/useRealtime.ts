import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export type RealtimeTable =
  | 'schedule'
  | 'weekly_verses'
  | 'events'
  | 'event_rsvps'
  | 'profiles'
  | 'announcements'
  | 'groups'
  | 'group_members'
  | 'youth_programs'
  | 'program_registrations';

// Subscribe to all writes on a Postgres table and call onChange.
//
// The callback is stored in a ref so a new function reference (e.g. from a
// parent re-render) never tears down and rebuilds the channel - only changes
// to `table` or `filter` do that.
//
// Rapid bursts of DB events (e.g. a bulk import writing 50 rows) are collapsed
// into a single callback via the `debounceMs` window (default 300 ms).
export function useRealtime(
  table: RealtimeTable,
  onChange: () => void,
  filter?: string,
  debounceMs = 300,
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        filter
          ? { event: '*', schema: 'public', table, filter }
          : { event: '*', schema: 'public', table },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => onChangeRef.current(), debounceMs);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [table, filter, debounceMs]); // onChange intentionally excluded - handled via ref
}
