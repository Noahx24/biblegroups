import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Church } from '@/types';

/**
 * Onboarding gate shown after sign-in when the user has no church set. Also
 * surfaced for existing users whose church_id is still null. Churches are
 * admin-managed — if a user's church isn't listed they're told to ask their
 * church to be added (they can't add it themselves).
 */
export function SelectChurchScreen() {
  const { setChurch, signOut } = useAuth();
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('churches').select('*').order('name');
      if (cancelled) return;
      if (error) console.warn('churches load failed', error);
      setChurches((data as Church[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await setChurch(selected);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select your church</Text>
        <Text style={styles.subtitle}>
          Choose the church you belong to. This helps us show you the right groups.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={churches}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = selected === item.id;
            return (
              <Pressable
                style={[styles.row, active && styles.rowActive]}
                onPress={() => setSelected(item.id)}
                accessibilityRole="button"
              >
                <Text style={[styles.rowText, active && styles.rowTextActive]}>{item.name}</Text>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </Pressable>
            );
          }}
          ListFooterComponent={
            <View style={styles.notListed}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              <Text style={styles.notListedText}>
                Don't see your church? Ask your church to get in touch so we can add them.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No churches are listed yet. Please contact your church.</Text>
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={save}
          disabled={!selected || saving}
          style={({ pressed }) => [styles.primary, (!selected || saving) && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
        <Pressable onPress={() => signOut()} hitSlop={8} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  rowTextActive: { color: colors.primaryDark },
  notListed: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.lg,
  },
  notListedText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  empty: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  primary: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  signOut: { alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
});
