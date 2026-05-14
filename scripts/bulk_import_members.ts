/**
 * bulk_import_members.ts — backend bulk import of group memberships.
 *
 * Usage:
 *   SUPABASE_URL=https://… \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   npx tsx scripts/bulk_import_members.ts path/to/file.csv
 *
 * The CSV must have a header row and the columns email, group_name, role.
 * Example:
 *   email,group_name,role
 *   john@example.com,Tuesday Class,leader
 *   jane@example.com,Sunday Volunteers,member
 *
 * The script reads the file locally, validates the rows, then invokes the
 * admin_bulk_assign_members RPC with the service role key. The RPC runs the
 * whole batch server-side in a single transaction and returns per-row results.
 *
 * Never commit your service role key. Run this from a trusted machine.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type Role = 'member' | 'leader';
type Entry = { email: string; group_name: string; role: Role };
type RpcRow = {
  row_index: number;
  email: string | null;
  group_name: string | null;
  role: string;
  status: 'ok' | 'error';
  message: string;
};

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseCsv(text: string): Entry[] {
  // Strip UTF-8 BOM if present — Excel and some editors add it.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) die('CSV must have a header row and at least one data row.');

  const header = lines[0].split(',').map(s => s.trim().toLowerCase());
  const emailIdx = header.indexOf('email');
  const groupIdx = header.indexOf('group_name');
  const roleIdx = header.indexOf('role');
  if (emailIdx < 0 || groupIdx < 0) {
    die('CSV header must include "email" and "group_name" (role optional, defaults to member).');
  }

  return lines.slice(1).flatMap<Entry>((line, i) => {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    const email = parts[emailIdx];
    const group_name = parts[groupIdx];
    const roleRaw = roleIdx >= 0 ? parts[roleIdx]?.toLowerCase() : 'member';
    if (!email || !group_name) {
      console.warn(`skipping row ${i + 2}: missing email or group_name`);
      return [];
    }
    const role: Role = roleRaw === 'leader' ? 'leader' : 'member';
    return [{ email, group_name, role }];
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) die('Usage: tsx scripts/bulk_import_members.ts <path-to-csv>');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.');

  const csv = readFileSync(resolve(file), 'utf-8');
  const entries = parseCsv(csv);
  if (entries.length === 0) die('No valid rows in CSV.');

  console.log(`Importing ${entries.length} row${entries.length === 1 ? '' : 's'}…`);

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc('admin_bulk_assign_members', {
    payload: entries,
  });

  if (error) die(`RPC failed: ${error.message}`);

  const rows = (data ?? []) as RpcRow[];
  const ok = rows.filter(r => r.status === 'ok').length;
  const failed = rows.filter(r => r.status === 'error').length;

  for (const r of rows) {
    const tag = r.status === 'ok' ? '✓' : '✗';
    console.log(`${tag} row ${r.row_index}: ${r.email ?? '?'} → ${r.group_name ?? '?'} (${r.role}) — ${r.message}`);
  }
  console.log(`\nDone: ${ok} ok, ${failed} failed.`);
  if (failed > 0) process.exit(2);
}

main().catch(e => die(e instanceof Error ? e.message : String(e)));
