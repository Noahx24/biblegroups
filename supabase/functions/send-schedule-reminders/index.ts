/**
 * send-schedule-reminders
 *
 * Daily reminder push. Picks every schedule slot whose slot_date is tomorrow
 * and which has an assignee, fetches all Expo push tokens for those assignees,
 * and sends an Expo push notification per token.
 *
 * Deployment
 *   supabase functions deploy send-schedule-reminders --no-verify-jwt
 *   (--no-verify-jwt makes this cron-only function invokable WITHOUT any auth
 *   header, which is why the cron call below needs no key.)
 *
 * Schedule (Supabase Dashboard → Database → Cron, requires pg_cron + pg_net):
 *   select cron.schedule(
 *     'send-schedule-reminders',
 *     '0 18 * * *',           -- 18:00 UTC daily (20:00 SAST)
 *     $$select net.http_post(
 *        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-schedule-reminders',
 *        headers := jsonb_build_object('Content-Type', 'application/json'),
 *        body    := '{}'::jsonb
 *     )$$
 *   );
 *
 *   If you instead deploy WITH JWT verification (no --no-verify-jwt), the caller
 *   must authenticate: on the new API keys, add a SECRET key in the apikey header
 *   ('apikey', '<sb_secret_…>') — secret keys must NOT be sent as
 *   'Authorization: Bearer'. Prefer reading it from Vault over inlining.
 *
 * Either way, the function authenticates to Postgres itself using the
 * service-role-equivalent key auto-injected by Supabase — it reads
 * SUPABASE_SECRET_KEYS (new) and falls back to SUPABASE_SERVICE_ROLE_KEY
 * (deprecated) via resolveServiceKey(), so it bypasses RLS when reading slots /
 * tokens. That key is never passed by the caller.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// deno-lint-ignore no-explicit-any
type ExpoMessage = { to: string; title: string; body: string; data?: any };

// Resolve a service-role-equivalent key. Prefers the new JSON `SUPABASE_SECRET_KEYS`
// dictionary (keyed by name — "default" is the standard one), falling back to the
// deprecated single `SUPABASE_SERVICE_ROLE_KEY`. Both bypass RLS.
function resolveServiceKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const dict = JSON.parse(raw) as Record<string, unknown>;
      if (typeof dict.default === "string" && dict.default) return dict.default;
      for (const v of Object.values(dict)) {
        if (typeof v === "string" && v) return v;
      }
    } catch (e) {
      console.warn("failed to parse SUPABASE_SECRET_KEYS", e);
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

Deno.serve(async (_req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = resolveServiceKey();
  if (!url || !serviceKey) {
    return new Response("missing supabase env", { status: 500 });
  }
  const supabase = createClient(url, serviceKey);

  // Tomorrow in UTC. Slot dates are stored as date (no time zone), so this is
  // close enough for a daily reminder — a slot dated 2026-05-15 in any zone
  // becomes "tomorrow" once UTC clock crosses midnight before May 15.
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  const tomorrow = now.toISOString().slice(0, 10);

  const { data: slots, error } = await supabase
    .from("schedule")
    .select(`
      id,
      slot_date,
      slot_time,
      status,
      assignee_id,
      groups ( name, type ),
      volunteer_programmes ( name )
    `)
    .eq("slot_date", tomorrow)
    .not("assignee_id", "is", null)
    .in("status", ["accepted", "pending"]);

  if (error) {
    console.error("slot fetch failed", error);
    return new Response("slot fetch failed", { status: 500 });
  }

  const messages: ExpoMessage[] = [];

  for (const slot of slots ?? []) {
    if (!slot.assignee_id) continue;

    // deno-lint-ignore no-explicit-any
    const groups = slot.groups as any;
    // deno-lint-ignore no-explicit-any
    const programme = slot.volunteer_programmes as any;
    const groupName = groups?.name ?? "your group";
    const groupType = groups?.type ?? "volunteer";
    const programmeName: string | null = programme?.name ?? null;
    const timeShort = slot.slot_time ? String(slot.slot_time).slice(0, 5) : null;

    let what: string;
    if (groupType === "class") {
      what = `leading ${groupName}`;
    } else if (programmeName) {
      what = `volunteering for ${programmeName}`;
    } else {
      what = `volunteering for ${groupName}`;
    }
    const timeBit = timeShort ? ` at ${timeShort}` : "";

    const { data: tokens, error: tokensErr } = await supabase
      .from("device_push_tokens")
      .select("expo_push_token")
      .eq("user_id", slot.assignee_id);
    if (tokensErr) {
      console.warn("tokens fetch failed for", slot.assignee_id, tokensErr);
      continue;
    }

    for (const row of tokens ?? []) {
      messages.push({
        to: row.expo_push_token,
        title: "ChurchFlow — Tomorrow's schedule",
        body: `You're ${what}${timeBit} tomorrow.`,
        data: {
          slot_id: slot.id,
          slot_date: slot.slot_date,
        },
      });
    }
  }

  // Send to Expo in batches of 100 (Expo accepts up to that per request).
  let sent = 0;
  const failed: unknown[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      failed.push({ status: res.status, body: await res.text() });
      continue;
    }
    sent += batch.length;
  }

  return new Response(
    JSON.stringify({ tomorrow, slots: slots?.length ?? 0, sent, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
