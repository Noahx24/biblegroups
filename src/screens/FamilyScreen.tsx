import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isAfter } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { FamilyMember, ProgramRegistration, YouthProgram } from '@/types';

const PROGRAM_TYPE_LABEL: Record<string, string> = {
  youth: 'Youth Group',
  childrens: "Children's Church",
  holiday_club: 'Holiday Club',
};

const PROGRAM_TYPE_COLOR: Record<string, string> = {
  youth: colors.primary,
  childrens: colors.accent,
  holiday_club: '#4A7C59',
};

export function FamilyScreen() {
  const { session, isAdmin } = useAuth();
  const userId = session?.user.id ?? '';

  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [programs, setPrograms] = useState<YouthProgram[]>([]);
  const [registrations, setRegistrations] = useState<ProgramRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddChild, setShowAddChild] = useState(false);
  const [showRegister, setShowRegister] = useState<FamilyMember | null>(null);
  const [showCreateProgram, setShowCreateProgram] = useState(false);

  const load = useCallback(async () => {
    const [familyRes, programsRes, regsRes] = await Promise.all([
      supabase.from('family_members').select('*').eq('parent_user_id', userId).order('name'),
      supabase.from('youth_programs').select('*').eq('is_active', true).order('name'),
      supabase
        .from('program_registrations')
        .select('*, program:youth_programs(*), family_member:family_members(*)')
        .eq('registered_by', userId),
    ]);
    setFamily((familyRes.data as FamilyMember[]) ?? []);
    setPrograms((programsRes.data as YouthProgram[]) ?? []);
    setRegistrations((regsRes.data as ProgramRegistration[]) ?? []);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const deregister = (reg: ProgramRegistration) => {
    Alert.alert('Remove registration?', `${reg.family_member?.name ?? 'Child'} from ${reg.program?.name ?? 'program'}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('program_registrations').delete().eq('id', reg.id);
          if (error) Alert.alert('Error', error.message);
          else load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const regsByChild: Record<string, ProgramRegistration[]> = {};
  for (const r of registrations) {
    (regsByChild[r.family_member_id] ??= []).push(r);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Family</Text>
            <Text style={styles.subtitle}>Children's programs & registration</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddChild(true)}>
            <Ionicons name="add" size={20} color={colors.surface} />
          </TouchableOpacity>
        </View>

        {/* Children list */}
        <Text style={styles.sectionLabel}>My Children</Text>
        {family.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={36} color={colors.border} />
            <Text style={styles.emptyText}>No children added yet.</Text>
            <TouchableOpacity onPress={() => setShowAddChild(true)}>
              <Text style={styles.emptyAction}>Add a child →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          family.map(child => (
            <View key={child.id} style={styles.childCard}>
              <View style={styles.childAvatar}>
                <Text style={styles.childAvatarText}>{child.name[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={styles.childInfo}>
                <Text style={styles.childName}>{child.name}</Text>
                {child.birth_year && (
                  <Text style={styles.childSub}>Born {child.birth_year} · Age {new Date().getFullYear() - child.birth_year}</Text>
                )}
                <View style={styles.childRegs}>
                  {(regsByChild[child.id] ?? []).map(r => (
                    <Pressable key={r.id} onPress={() => deregister(r)}>
                      <View style={[styles.regPill, { backgroundColor: PROGRAM_TYPE_COLOR[r.program?.type ?? 'youth'] + '22' }]}>
                        <Text style={[styles.regPillText, { color: PROGRAM_TYPE_COLOR[r.program?.type ?? 'youth'] }]}>
                          {r.program?.name ?? 'Program'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TouchableOpacity style={styles.registerBtn} onPress={() => setShowRegister(child)}>
                <Text style={styles.registerBtnText}>Register</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Programs */}
        <View style={styles.programsHeader}>
          <Text style={styles.sectionLabel}>Available Programs</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => setShowCreateProgram(true)}>
              <Text style={styles.addProgramLink}>+ Add program</Text>
            </TouchableOpacity>
          )}
        </View>

        {programs.length === 0 ? (
          <Text style={styles.noProgramsText}>No active programs at this time.</Text>
        ) : (
          programs.map(p => {
            const dateRange = p.start_date && p.end_date
              ? `${format(new Date(p.start_date), 'MMM d')} – ${format(new Date(p.end_date), 'MMM d, yyyy')}`
              : p.start_date ? `From ${format(new Date(p.start_date), 'MMM d, yyyy')}` : null;
            const ageRange = p.age_min != null && p.age_max != null
              ? `Ages ${p.age_min}–${p.age_max}`
              : p.age_min != null ? `Ages ${p.age_min}+` : null;

            return (
              <View key={p.id} style={styles.programCard}>
                <View style={[styles.programAccent, { backgroundColor: PROGRAM_TYPE_COLOR[p.type] }]} />
                <View style={styles.programBody}>
                  <View style={styles.programTop}>
                    <Text style={styles.programName}>{p.name}</Text>
                    <View style={[styles.typePill, { backgroundColor: PROGRAM_TYPE_COLOR[p.type] + '22' }]}>
                      <Text style={[styles.typePillText, { color: PROGRAM_TYPE_COLOR[p.type] }]}>
                        {PROGRAM_TYPE_LABEL[p.type]}
                      </Text>
                    </View>
                  </View>
                  {!!p.description && <Text style={styles.programDesc}>{p.description}</Text>}
                  <View style={styles.programMeta}>
                    {!!ageRange && (
                      <View style={styles.metaChip}>
                        <Ionicons name="people-outline" size={11} color={colors.textMuted} />
                        <Text style={styles.metaChipText}>{ageRange}</Text>
                      </View>
                    )}
                    {!!dateRange && (
                      <View style={styles.metaChip}>
                        <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                        <Text style={styles.metaChipText}>{dateRange}</Text>
                      </View>
                    )}
                    {!!p.location && (
                      <View style={styles.metaChip}>
                        <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                        <Text style={styles.metaChipText}>{p.location}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <AddChildModal
        visible={showAddChild}
        userId={userId}
        onClose={() => setShowAddChild(false)}
        onSaved={() => { setShowAddChild(false); load(); }}
      />

      <RegisterModal
        visible={!!showRegister}
        child={showRegister}
        programs={programs}
        existingRegs={showRegister ? (regsByChild[showRegister.id] ?? []) : []}
        userId={userId}
        onClose={() => setShowRegister(null)}
        onSaved={() => { setShowRegister(null); load(); }}
      />

      {isAdmin && (
        <CreateProgramModal
          visible={showCreateProgram}
          userId={userId}
          onClose={() => setShowCreateProgram(false)}
          onSaved={() => { setShowCreateProgram(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Add Child Modal ──────────────────────────────────────────────────────────

function AddChildModal({ visible, userId, onClose, onSaved }: {
  visible: boolean; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const yearNum = birthYear.trim() ? parseInt(birthYear.trim(), 10) : null;
    const currentYear = new Date().getFullYear();
    if (birthYear.trim() && (isNaN(yearNum!) || yearNum! < currentYear - 18 || yearNum! > currentYear)) {
      Alert.alert('Invalid birth year', `Please enter a birth year for a child under 18 (${currentYear - 18}–${currentYear}).`); return;
    }
    setSaving(true);
    const { error } = await supabase.from('family_members').insert({ parent_user_id: userId, name: name.trim(), birth_year: yearNum });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setName(''); setBirthYear('');
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Add Child</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.modalAction, saving && { opacity: 0.5 }]}>{saving ? '…' : 'Add'}</Text>
          </Pressable>
        </View>
        <View style={styles.modalBody}>
          <Text style={styles.fieldLabel}>Child's name *</Text>
          <TextInput style={styles.textInput} value={name} onChangeText={setName}
            placeholder="e.g. Emma" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
          <Text style={styles.fieldLabel}>Birth year</Text>
          <TextInput style={styles.textInput} value={birthYear} onChangeText={setBirthYear}
            placeholder="e.g. 2015" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Register Modal ───────────────────────────────────────────────────────────

function ageEligible(child: FamilyMember, program: YouthProgram): boolean {
  if (!child.birth_year) return true; // no age on file — allow
  const age = new Date().getFullYear() - child.birth_year;
  if (program.age_min != null && age < program.age_min) return false;
  if (program.age_max != null && age > program.age_max) return false;
  return true;
}

function RegisterModal({ visible, child, programs, existingRegs, userId, onClose, onSaved }: {
  visible: boolean; child: FamilyMember | null; programs: YouthProgram[];
  existingRegs: ProgramRegistration[]; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const registeredIds = new Set(existingRegs.map(r => r.program_id));

  const register = async (program: YouthProgram) => {
    if (!child) return;
    setSaving(true);
    const { error } = await supabase.from('program_registrations').insert({
      family_member_id: child.id,
      program_id: program.id,
      registered_by: userId,
      status: 'active',
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    onSaved();
  };

  const childAge = child?.birth_year ? new Date().getFullYear() - child.birth_year : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Close</Text></Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.modalTitle}>Register {child?.name ?? ''}</Text>
            {childAge != null && (
              <Text style={styles.modalSubtitle}>Age {childAge}</Text>
            )}
          </View>
          <View style={{ width: 50 }} />
        </View>
        {programs.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No active programs available.</Text>
          </View>
        ) : (
          <FlatList
            data={programs}
            keyExtractor={p => p.id}
            contentContainerStyle={styles.modalBody}
            renderItem={({ item: p }) => {
              const already = registeredIds.has(p.id);
              const eligible = child ? ageEligible(child, p) : true;
              const ageLabel = p.age_min != null && p.age_max != null
                ? `Ages ${p.age_min}–${p.age_max}`
                : p.age_min != null ? `Ages ${p.age_min}+`
                : p.age_max != null ? `Up to age ${p.age_max}` : null;
              return (
                <View style={[styles.programRow, !eligible && styles.programRowIneligible]}>
                  <View style={[styles.programRowAccent, { backgroundColor: PROGRAM_TYPE_COLOR[p.type] }]} />
                  <View style={styles.flex1}>
                    <Text style={[styles.programRowName, !eligible && styles.textMuted]}>{p.name}</Text>
                    <Text style={styles.programRowType}>
                      {PROGRAM_TYPE_LABEL[p.type]}{ageLabel ? ` · ${ageLabel}` : ''}
                    </Text>
                    {!eligible && (
                      <Text style={styles.ineligibleText}>
                        Not age-eligible{childAge != null ? ` (age ${childAge})` : ''}
                      </Text>
                    )}
                  </View>
                  {eligible && (
                    <TouchableOpacity
                      style={[styles.registerRowBtn, already && styles.registerRowBtnDone]}
                      onPress={() => !already && register(p)}
                      disabled={already || saving}
                    >
                      <Text style={styles.registerRowBtnText}>
                        {already ? 'Registered ✓' : 'Register'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Create Program Modal (admin only) ───────────────────────────────────────

// UI-only preset key. "other" is a free-form programme that internally stores
// as the `holiday_club` enum value (the only enum option without a fixed age
// constraint) so we don't need a DB migration. The name field is what carries
// the programme's real identity for display.
type ProgramPreset = 'youth' | 'childrens' | 'holiday_club' | 'other';

const PRESET_LABEL: Record<ProgramPreset, string> = {
  youth: 'Youth Group',
  childrens: "Children's Church",
  holiday_club: 'Holiday Club',
  other: 'Other',
};

function CreateProgramModal({ visible, userId, onClose, onSaved }: {
  visible: boolean; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const [preset, setPreset] = useState<ProgramPreset>('youth');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [ageMin, setAgeMin] = useState('13');
  const [ageMax, setAgeMax] = useState('18');

  // Each preset prefills the name (only when the admin hasn't typed one yet)
  // plus a sensible default age range.
  const PRESET_DEFAULTS: Record<ProgramPreset, { name: string; ageMin: string; ageMax: string }> = {
    youth: { name: 'Youth Group', ageMin: '13', ageMax: '18' },
    childrens: { name: "Children's Church", ageMin: '4', ageMax: '12' },
    holiday_club: { name: 'Holiday Club', ageMin: '', ageMax: '' },
    other: { name: '', ageMin: '', ageMax: '' },
  };

  const handlePresetChange = (p: ProgramPreset) => {
    const previous = PRESET_DEFAULTS[preset];
    setPreset(p);
    const next = PRESET_DEFAULTS[p];
    // Only auto-fill name if the admin hasn't typed something custom
    if (!name.trim() || name.trim() === previous.name) setName(next.name);
    setAgeMin(next.ageMin);
    setAgeMax(next.ageMax);
  };
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const parsedMin = ageMin.trim() ? parseInt(ageMin, 10) : null;
    const parsedMax = ageMax.trim() ? parseInt(ageMax, 10) : null;
    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      Alert.alert('Invalid age range', 'Minimum age cannot exceed maximum age.'); return;
    }
    setSaving(true);
    // "other" is UI-only — store as holiday_club (the open-age enum value)
    const dbType = preset === 'other' ? 'holiday_club' : preset;
    const { error } = await supabase.from('youth_programs').insert({
      name: name.trim(), type: dbType,
      description: desc.trim() || null,
      age_min: parsedMin,
      age_max: parsedMax,
      location: location.trim() || null,
      start_date: startDate.trim() || null,
      end_date: endDate.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setName(''); setPreset('youth'); setDesc(''); setAgeMin('13'); setAgeMax('18');
    setLocation(''); setStartDate(''); setEndDate('');
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>New Program</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.modalAction, saving && { opacity: 0.5 }]}>{saving ? '…' : 'Create'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.fieldLabel}>Program name *</Text>
          <TextInput style={styles.textInput} value={name} onChangeText={setName}
            placeholder="e.g. Sunday School" placeholderTextColor={colors.textMuted} />

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.typeRow}>
            {(['youth', 'childrens', 'holiday_club', 'other'] as const).map(p => (
              <Pressable key={p} style={[styles.typeOption, preset === p && styles.typeOptionActive]} onPress={() => handlePresetChange(p)}>
                <Text style={[styles.typeOptionText, preset === p && styles.typeOptionTextActive]}>
                  {PRESET_LABEL[p]}
                </Text>
              </Pressable>
            ))}
          </View>
          {preset === 'other' && (
            <Text style={styles.presetHint}>
              Enter any programme name above (e.g. Sunday School, Bible Study).
            </Text>
          )}

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput style={[styles.textInput, { minHeight: 70, textAlignVertical: 'top' }]}
            value={desc} onChangeText={setDesc} multiline
            placeholder="Brief description" placeholderTextColor={colors.textMuted} />

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Min age</Text>
              <TextInput style={styles.textInput} value={ageMin} onChangeText={setAgeMin}
                keyboardType="number-pad" placeholder="e.g. 5" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Max age</Text>
              <TextInput style={styles.textInput} value={ageMax} onChangeText={setAgeMax}
                keyboardType="number-pad" placeholder="e.g. 12" placeholderTextColor={colors.textMuted} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput style={styles.textInput} value={location} onChangeText={setLocation}
            placeholder="e.g. Church Hall" placeholderTextColor={colors.textMuted} />

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Start date</Text>
              <TextInput style={styles.textInput} value={startDate} onChangeText={setStartDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>End date</Text>
              <TextInput style={styles.textInput} value={endDate} onChangeText={setEndDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  content: { paddingBottom: spacing.xxl },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted, textTransform: 'uppercase', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: 8 },
  emptyCard: { margin: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm, ...shadow.card },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyAction: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  noProgramsText: { paddingHorizontal: spacing.lg, fontSize: 14, color: colors.textMuted },
  childCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadow.card },
  childAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: '#fff' },
  childInfo: { flex: 1 },
  childName: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '700', color: colors.text },
  childSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  childRegs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  regPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  regPillText: { fontSize: 11, fontWeight: '600' },
  registerBtn: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  registerBtnText: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  programsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  addProgramLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  programCard: { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  programAccent: { width: 4, alignSelf: 'stretch' },
  programBody: { flex: 1, padding: spacing.md },
  programTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  programName: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  typePillText: { fontSize: 11, fontWeight: '600' },
  programDesc: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  programMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaChipText: { fontSize: 11.5, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.md },
  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  modalTitle: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: colors.text },
  modalCancel: { fontSize: 16, color: colors.textMuted, width: 60 },
  modalAction: { fontSize: 16, color: colors.primary, fontWeight: '700', width: 60, textAlign: 'right' },
  modalBody: { padding: spacing.lg, gap: spacing.sm },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm },
  textInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm, fontSize: 15, color: colors.text },
  typeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  typeOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeOptionText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  typeOptionTextActive: { color: colors.primary },
  presetHint: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', paddingHorizontal: 2, marginTop: -spacing.xs },
  modalSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  programRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md, overflow: 'hidden' },
  programRowIneligible: { opacity: 0.45 },
  programRowAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  programRowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  textMuted: { color: colors.textMuted },
  programRowType: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ineligibleText: { fontSize: 11, color: colors.danger, marginTop: 2, fontStyle: 'italic' },
  registerRowBtn: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.primary },
  registerRowBtnDone: { backgroundColor: colors.success },
  registerRowBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
