/**
 * notify-assignment
 *
 * Invoked from the app right after a schedule slot is assigned to someone
 * (other than the person doing the assigning). Sends that assignee:
 *   1. an Expo push notification (to every registered device), and
 *   2. an email via SMTP.
 *
 * Request body: { "slot_id": "<uuid>" }
 *
 * Deployment
 *   supabase functions deploy notify-assignment
 *
 * Required secrets (Project Settings → Edge Functions → Secrets):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
 *
 * Email is best-effort: if SMTP isn't configured the push is still sent and the
 * function returns 200 with emailed:false. Push tokens are read with the service
 * role so RLS doesn't hide them.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Resolve a service-role-equivalent key. Prefers the new JSON `SUPABASE_SECRET_KEYS`
// dictionary (keyed by name — "default" is the standard one), falling back to the
// deprecated single `SUPABASE_SERVICE_ROLE_KEY` so this works on both old and
// new-API-key projects. Both bypass RLS.
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

// "2026-06-15" -> "Mon, 15 Jun" (UTC, date-only — matches how slots are stored).
function formatSlotDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = resolveServiceKey();
  if (!url || !serviceKey) return json({ error: "missing supabase env" }, 500);

  let slotId: string | undefined;
  try {
    const body = await req.json();
    slotId = body?.slot_id;
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!slotId) return json({ error: "slot_id required" }, 400);

  const supabase = createClient(url, serviceKey);

  const { data: slot, error } = await supabase
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
    .eq("id", slotId)
    .single();

  if (error || !slot) return json({ error: "slot not found" }, 404);
  if (!slot.assignee_id) return json({ skipped: "slot has no assignee" });

  // deno-lint-ignore no-explicit-any
  const group = slot.groups as any;
  // deno-lint-ignore no-explicit-any
  const programme = slot.volunteer_programmes as any;
  const groupName: string = group?.name ?? "your group";
  const groupType: string = group?.type ?? "volunteer";
  const programmeName: string | null = programme?.name ?? null;
  const timeShort = slot.slot_time ? String(slot.slot_time).slice(0, 5) : null;

  const what =
    groupType === "class"
      ? `leading ${groupName}`
      : programmeName
      ? `volunteering for ${programmeName}`
      : `volunteering for ${groupName}`;
  const when = `${formatSlotDate(slot.slot_date)}${timeShort ? ` at ${timeShort}` : ""}`;

  // ── Assignee contact details ────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name")
    .eq("id", slot.assignee_id)
    .single();

  const { data: tokens } = await supabase
    .from("device_push_tokens")
    .select("expo_push_token")
    .eq("user_id", slot.assignee_id);

  // ── Push ────────────────────────────────────────────────────────────────────
  let pushed = 0;
  const messages = (tokens ?? []).map((t) => ({
    to: t.expo_push_token,
    title: "ChurchFlow — New assignment",
    body: `You're ${what} on ${when}.`,
    data: { slot_id: slot.id, slot_date: slot.slot_date },
  }));
  if (messages.length > 0) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (res.ok) pushed = messages.length;
    else console.warn("expo push failed", res.status, await res.text());
  }

  // ── Email (SMTP) ────────────────────────────────────────────────────────────
  let emailed = false;
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "587");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const from = Deno.env.get("SMTP_FROM");

  if (host && user && pass && from && profile?.email) {
    try {
      const client = new SMTPClient({
        connection: {
          hostname: host,
          port,
          tls: port === 465,
          auth: { username: user, password: pass },
        },
      });
      const name = profile.display_name ?? "there";
      await client.send({
        from,
        to: profile.email,
        subject: "ChurchFlow — You've been assigned",
        content: `Hi ${name},\n\nYou've been assigned to ${what} on ${when}.\n\nOpen ChurchFlow to view the details or respond.\n\n— ChurchFlow`,
        html:
          `<p>Hi ${name},</p>` +
          `<p>You've been assigned to <strong>${what}</strong> on <strong>${when}</strong>.</p>` +
          `<p>Open ChurchFlow to view the details or respond.</p>` +
          `<p>— ChurchFlow</p>`,
      });
      await client.close();
      emailed = true;
    } catch (e) {
      console.warn("smtp send failed", e);
    }
  }

  return json({ slot_id: slot.id, pushed, emailed });
});
