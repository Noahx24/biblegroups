/**
 * Fire-and-forget trigger for the `notify-assignment` edge function.
 *
 * Called right after a slot is assigned to someone *other* than the current
 * user. The edge function (service role) looks up the assignee's push tokens and
 * email and sends an Expo push + an SMTP email. Failures are swallowed — a
 * missing notification must never block the assignment UI, and the daily
 * reminder + in-app banner act as backstops.
 */

import { supabase } from '@/lib/supabase';

export function notifyAssignment(slotId: string): void {
  supabase.functions
    .invoke('notify-assignment', { body: { slot_id: slotId } })
    .catch((e) => console.warn('notifyAssignment failed', e));
}
