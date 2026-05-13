import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Profile } from '@/types';

export function ProfileScreen() {
  const { session, signOut, isLeader, isAdmin } = useAuth();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  const [favoriteVerse, setFavoriteVerse] = useState('');
  const [favoriteHymn, setFavoriteHymn] = useState('');
  const [birthday, setBirthday] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<Profile[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, favorite_verse, favorite_hymn, is_leader, is_admin')
      .order('display_name', { ascending: true });
    setMembers((data as Profile[] | null) ?? []);
  }, [isAdmin]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, favorite_verse, favorite_hymn, birthday')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setDisplayName(data?.display_name ?? '');
        setFavoriteVerse(data?.favorite_verse ?? '');
        setFavoriteHymn(data?.favorite_hymn ?? '');
        setBirthday(data?.birthday ?? '');
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useRealtime('profiles', loadMembers);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  const save = async () => {
    if (!userId) return;
    const trimmedBirthday = birthday.trim();
    let birthdayValue: string | null = null;
    if (trimmedBirthday) {
      const parsed = parse(trimmedBirthday, 'yyyy-MM-dd', new Date());
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Bad birthday', 'Use format YYYY-MM-DD (e.g. 1990-04-15)');
        return;
      }
      birthdayValue = trimmedBirthday;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        favorite_verse: favoriteVerse.trim() || null,
        favorite_hymn: favoriteHymn.trim() || null,
        birthday: birthdayValue,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Saved');
  };

  const toggleLeader = async (memberId: string, next: boolean) => {
    setTogglingId(memberId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_leader: next })
      .eq('id', memberId);
    setTogglingId(null);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await loadMembers();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>

          {/* Identity strip */}
          <View style={styles.identityRow}>
            <ProfileAvatar name={displayName || session?.user.email || '?'} size={64} />
            <View style={styles.flex1}>
              <Text style={styles.identityName}>{displayName || 'Set your name'}</Text>
              <Text style={styles.identitySub}>{session?.user.email}</Text>
            </View>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <ProfileField label="Display name">
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                style={styles.fieldInput}
              />
            </ProfileField>

            <FieldDivider />

            <ProfileField label="Birthday">
              <TextInput
                value={birthday}
                onChangeText={setBirthday}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={styles.fieldInput}
              />
            </ProfileField>

            <FieldDivider />

            <ProfileField label="Favourite verse">
              <TextInput
                value={favoriteVerse}
                onChangeText={setFavoriteVerse}
                placeholder="e.g. Philippians 4:13"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.fieldInput, styles.fieldTextarea]}
              />
            </ProfileField>

            <FieldDivider />

            <ProfileField label="Favourite hymn">
              <TextInput
                value={favoriteHymn}
                onChangeText={setFavoriteHymn}
                placeholder="e.g. How Great Thou Art"
                placeholderTextColor={colors.textMuted}
                style={styles.fieldInput}
              />
            </ProfileField>

            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [styles.saveBtn, saving && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>

          {/* Email + badges */}
          <View style={styles.badgeRow}>
            {isLeader && <RoleBadge label="Class Leader" tone="scarlet" />}
            {isAdmin && <RoleBadge label="Admin" tone="gold" />}
          </View>

          {/* Admin: manage leaders */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.cardLabelRow}>
                <Text style={styles.cardLabel}>Manage Leaders</Text>
                <Text style={styles.cardLabelRight}>Admin only</Text>
              </View>
              {members.map((m, i) => {
                const initials = (m.display_name ?? 'U')
                  .split(' ')
                  .map((s) => s[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <View
                    key={m.id}
                    style={[styles.leaderRow, i < members.length - 1 && styles.leaderRowDivider]}
                  >
                    <ProfileAvatar name={m.display_name ?? 'U'} size={36} tone={m.is_leader ? 'scarlet' : 'gold'} />
                    <View style={styles.flex1}>
                      <Text style={styles.leaderName}>
                        {m.display_name ?? 'Unnamed'}
                        {m.is_admin ? ' (admin)' : ''}
                      </Text>
                      <Text style={styles.leaderRole}>
                        {m.is_leader ? 'Class leader' : 'Member'}
                      </Text>
                    </View>
                    <Switch
                      value={m.is_leader}
                      disabled={togglingId === m.id}
                      onValueChange={(v) => toggleLeader(m.id, v)}
                      trackColor={{ false: '#D9CFBC', true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                );
              })}
            </View>
          )}

          {/* Sign out */}
          <Pressable
            onPress={signOut}
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Text style={styles.versionText}>Class Meeting · v1.2.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Shared atoms ─────────────────────────────────────────────

function ProfileAvatar({
  name,
  size = 48,
  tone = 'scarlet',
}: {
  name: string;
  size?: number;
  tone?: 'scarlet' | 'gold';
}) {
  const initials = name
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const bg = tone === 'gold' ? colors.accent : colors.primary;

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function FieldDivider() {
  return <View style={styles.fieldDivider} />;
}

function RoleBadge({ label, tone }: { label: string; tone: 'scarlet' | 'gold' }) {
  const bg = tone === 'gold' ? colors.accent : colors.primary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },

  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 34,
  },

  identityRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityName: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  identitySub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Avatar
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: {
    color: '#fff',
    fontFamily: fonts.serif,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  cardLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  cardLabelRight: {
    fontSize: 12,
    color: colors.textMutedSoft,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  // Form fields
  fieldGroup: { paddingVertical: 4, gap: 6 },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 11,
    paddingHorizontal: 13,
    fontSize: 15.5,
    color: colors.text,
    fontWeight: '500',
  },
  fieldTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSoft,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
    marginVertical: 6,
  },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16, letterSpacing: 0.1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Leader management
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  leaderRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  leaderName: { fontSize: 15, fontWeight: '600', color: colors.text },
  leaderRole: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Sign out
  signOutBtn: {
    marginTop: spacing.xl,
    padding: spacing.md,
    alignItems: 'center',
  },
  signOutText: { color: colors.primary, fontWeight: '600', fontSize: 15, letterSpacing: 0.1 },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMutedSoft,
    paddingBottom: 4,
  },
});
