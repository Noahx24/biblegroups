/**
 * AdminScreen — accessible to admins from ProfileScreen.
 *
 * CSV Import format (one row per user–group assignment):
 *   email,group_name,role
 *   john@example.com,Tuesday Class,leader
 *   jane@example.com,Tuesday Class,member
 *
 * The importer:
 *  1. Parses the CSV in-app (no server round-trip for parsing).
 *  2. Looks up each email in auth.users via the profiles table (display_name / email match).
 *  3. Finds or creates the target group by name.
 *  4. Upserts the group_member row with the given role.
 *  5. Shows a per-row result summary.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

type CsvRow = { email: string; group_name: string; role: 'member' | 'leader' };
type ImportResult = { row: CsvRow; status: 'ok' | 'error'; message: string };

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  // Skip header row
  return lines.slice(1).flatMap(line => {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) return [];
    const [email, group_name, roleRaw] = parts;
    const role = (roleRaw?.toLowerCase() === 'leader' ? 'leader' : 'member') as 'member' | 'leader';
    if (!email || !group_name) return [];
    return [{ email, group_name, role }];
  });
}

async function importRows(rows: CsvRow[]): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  // Cache group lookups to avoid duplicate queries
  const groupCache: Record<string, string> = {};

  for (const row of rows) {
    try {
      // 1. Find user by email via profiles (email stored in auth but we match display_name or via admin API)
      //    Since profiles don't store email directly, we use the admin route via supabase.auth.admin
      //    or match on a denormalised email column. As a workaround we use service-role from the
      //    client if available, otherwise surface a clear message.
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', row.email)
        .maybeSingle();

      if (profileErr) throw new Error(profileErr.message);

      if (!profileData) {
        results.push({ row, status: 'error', message: `No user found with email ${row.email}` });
        continue;
      }

      const userId = profileData.id;

      // 2. Find or create group
      if (!groupCache[row.group_name]) {
        const { data: existing } = await supabase
          .from('groups')
          .select('id')
          .ilike('name', row.group_name)
          .maybeSingle();

        if (existing) {
          groupCache[row.group_name] = existing.id;
        } else {
          const { data: created, error: createErr } = await supabase
            .from('groups')
            .insert({ name: row.group_name, type: 'class' })
            .select('id')
            .single();
          if (createErr || !created) throw new Error(createErr?.message ?? 'Could not create group');
          groupCache[row.group_name] = created.id;
        }
      }

      const groupId = groupCache[row.group_name];

      // 3. Upsert membership
      const { error: memberErr } = await supabase
        .from('group_members')
        .upsert(
          { group_id: groupId, user_id: userId, role: row.role },
          { onConflict: 'group_id,user_id' },
        );

      if (memberErr) {
        const msg = memberErr.message.includes('one class group')
          ? `${row.email} is already in a different class group — a user can only belong to one class group`
          : memberErr.message;
        throw new Error(msg);
      }

      results.push({ row, status: 'ok', message: `Added as ${row.role} in "${row.group_name}"` });
    } catch (e) {
      results.push({ row, status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return results;
}

export function AdminScreen() {
  const navigation = useNavigation();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', '*/*'] });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    setResults([]);

    try {
      const response = await fetch(asset.uri);
      const text = await response.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        Alert.alert('Empty or invalid CSV', 'Expected columns: email, group_name, role\nAt least one data row required.');
        return;
      }
      setRows(parsed);
    } catch (e) {
      Alert.alert('Read error', e instanceof Error ? e.message : String(e));
    }
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setResults([]);
    const res = await importRows(rows);
    setResults(res);
    setImporting(false);
  };

  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* CSV Import */}
        <Text style={styles.sectionLabel}>CSV Member Import</Text>
        <View style={styles.card}>
          <Text style={styles.instructions}>
            Upload a CSV with columns:{'\n'}
            <Text style={styles.mono}>email, group_name, role</Text>
            {'\n\n'}Role must be <Text style={styles.mono}>leader</Text> or <Text style={styles.mono}>member</Text>.
            Groups are created automatically if they don't exist.
            {'\n\n'}Users must already have a ChurchFlow account — they are matched by their profile email column.
          </Text>

          <Pressable style={styles.pickBtn} onPress={pickFile}>
            <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
            <Text style={styles.pickBtnText}>{fileName ?? 'Choose CSV file'}</Text>
          </Pressable>

          {rows.length > 0 && results.length === 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import</Text>
              {rows.slice(0, 5).map((r, i) => (
                <Text key={i} style={styles.previewRow}>
                  {r.email} → {r.group_name} ({r.role})
                </Text>
              ))}
              {rows.length > 5 && <Text style={styles.previewMore}>…and {rows.length - 5} more</Text>}
            </View>
          )}

          <Pressable
            style={[styles.importBtn, (rows.length === 0 || importing) && styles.importBtnDisabled]}
            onPress={runImport}
            disabled={rows.length === 0 || importing}
          >
            {importing
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <Text style={styles.importBtnText}>Run Import ({rows.length} rows)</Text>}
          </Pressable>
        </View>

        {/* Results */}
        {results.length > 0 && (
          <>
            <View style={styles.resultSummary}>
              <View style={[styles.resultPill, { backgroundColor: colors.success + '22' }]}>
                <Text style={[styles.resultPillText, { color: colors.success }]}>✓ {ok} OK</Text>
              </View>
              {errors > 0 && (
                <View style={[styles.resultPill, { backgroundColor: colors.danger + '22' }]}>
                  <Text style={[styles.resultPillText, { color: colors.danger }]}>✗ {errors} failed</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              {results.map((r, i) => (
                <View key={i} style={[styles.resultRow, i < results.length - 1 && styles.resultRowDivider]}>
                  <Ionicons
                    name={r.status === 'ok' ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={r.status === 'ok' ? colors.success : colors.danger}
                  />
                  <View style={styles.resultText}>
                    <Text style={styles.resultEmail}>{r.row.email}</Text>
                    <Text style={styles.resultMsg}>{r.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card, gap: spacing.md },
  instructions: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12.5, color: colors.primary },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  pickBtnText: { fontSize: 14, color: colors.primary, fontWeight: '600', flex: 1 },
  previewBox: { backgroundColor: colors.backgroundSoft, borderRadius: radius.sm, padding: spacing.md, gap: 4 },
  previewLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  previewRow: { fontSize: 12, color: colors.textSoft, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  previewMore: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  importBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  importBtnDisabled: { opacity: 0.4 },
  importBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultSummary: { flexDirection: 'row', gap: spacing.sm },
  resultPill: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  resultPillText: { fontSize: 13, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 8 },
  resultRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  resultText: { flex: 1 },
  resultEmail: { fontSize: 13, fontWeight: '600', color: colors.text },
  resultMsg: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

