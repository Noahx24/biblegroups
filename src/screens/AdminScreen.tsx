/**
 * AdminScreen — accessible to admins from ProfileScreen.
 *
 * Two ways to manage group membership:
 *
 *  1. Manual assignment — browse all groups, tap one to open the
 *     AdminGroupMembersScreen where you can search registered users by name
 *     or email and add / remove / change roles.
 *
 *  2. CSV bulk import — one row per user-group assignment:
 *       email,group_name,role
 *       john@example.com,Tuesday Class,leader
 *       jane@example.com,Tuesday Class,member
 *     The importer parses in-app, matches each email against profiles,
 *     creates groups that don't yet exist, and upserts the group_member row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Group } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Admin'>;
type GroupSummary = Group & { member_count: number };

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
      // ilike makes the match case-insensitive — emails like "John@…" and
      // "john@…" both point at the same auth account.
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', row.email)
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
          const inferredType = /^class\s+\d+$/i.test(row.group_name.trim()) ? 'class' : 'volunteer';
          const { data: created, error: createErr } = await supabase
            .from('groups')
            .insert({ name: row.group_name, type: inferredType })
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
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Group browser state
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupQuery, setGroupQuery] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadGroups = useCallback(async () => {
    const [groupsRes, countsRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('group_members').select('group_id'),
    ]);
    if (!mountedRef.current) return;

    if (groupsRes.error) console.warn('groups load failed', groupsRes.error);
    if (countsRes.error) console.warn('group_member count load failed', countsRes.error);

    const counts: Record<string, number> = {};
    for (const row of (countsRes.data ?? []) as { group_id: string }[]) {
      counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
    }

    setGroups(((groupsRes.data ?? []) as Group[]).map(g => ({
      ...g,
      member_count: counts[g.id] ?? 0,
    })));
    setGroupsLoading(false);
  }, []);

  // Reload on focus so changes made in AdminGroupMembersScreen show up here too.
  useFocusEffect(useCallback(() => { loadGroups(); }, [loadGroups]));

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, groupQuery]);

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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Group membership browser */}
        <Text style={styles.sectionLabel}>Group Membership</Text>
        <View style={styles.card}>
          <Text style={styles.instructions}>
            Browse a group to add or remove leaders and members. You can search
            registered users by name or email and assign them directly.
          </Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={groupQuery}
              onChangeText={setGroupQuery}
              placeholder="Filter groups…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {groupQuery.length > 0 && (
              <Pressable onPress={() => setGroupQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {groupsLoading ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filteredGroups.length === 0 ? (
            <Text style={styles.emptyText}>
              {groups.length === 0 ? 'No groups exist yet.' : `No groups match "${groupQuery.trim()}".`}
            </Text>
          ) : (
            <View style={styles.groupList}>
              {filteredGroups.map((g, i) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupRow, i < filteredGroups.length - 1 && styles.groupRowDivider]}
                  onPress={() => navigation.navigate('AdminGroupMembers', { group: g })}
                >
                  <View style={[styles.groupTypeDot, { backgroundColor: g.type === 'class' ? colors.primary : colors.accent }]} />
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupMeta}>
                      {g.type === 'class' ? 'Class' : 'Volunteer'} · {g.member_count} member{g.member_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

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

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm - 2,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  groupList: { backgroundColor: colors.backgroundSoft, borderRadius: radius.md, overflow: 'hidden' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  groupRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  groupTypeDot: { width: 9, height: 9, borderRadius: 5 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  groupMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

