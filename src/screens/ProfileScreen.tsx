import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function ProfileScreen() {
  const { session, signOut, isAdmin, isSuperAdmin } = useAuth();
  const navigation = useNavigation<Nav>();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  const [favoriteVerse, setFavoriteVerse] = useState('');
  const [favoriteHymn, setFavoriteHymn] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, favorite_verse, favorite_hymn, birthday, avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setDisplayName(data?.display_name ?? '');
        setFavoriteVerse(data?.favorite_verse ?? '');
        setFavoriteHymn(data?.favorite_hymn ?? '');
        setBirthday(data?.birthday ?? '');
        setAvatarUrl(data?.avatar_url ?? null);
        setLoading(false);
      });
  }, [userId]);

  const pickAvatar = async () => {
    if (!userId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings to change your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const path = `${userId}/avatar.${ext}`;

      // Fetch blob from local URI
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId!);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingAvatar(false);
    }
  };

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.sectionHeader}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>

          {/* Avatar + identity */}
          <View style={styles.identityRow}>
            <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar} activeOpacity={0.8}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <ProfileAvatar name={displayName || session?.user.email || '?'} size={72} />
              )}
              <View style={styles.avatarEditBadge}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={13} color="#fff" />}
              </View>
            </TouchableOpacity>
            <View style={styles.flex1}>
              <Text style={styles.identityName}>{displayName || 'Set your name'}</Text>
              <Text style={styles.identitySub}>{session?.user.email}</Text>
              <Text style={styles.avatarHint}>Tap photo to change</Text>
            </View>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <ProfileField label="Display name">
              <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name"
                placeholderTextColor={colors.textMuted} style={styles.fieldInput} />
            </ProfileField>
            <FieldDivider />
            <ProfileField label="Birthday">
              <TextInput value={birthday} onChangeText={setBirthday} placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted} autoCapitalize="none"
                keyboardType="numbers-and-punctuation" style={styles.fieldInput} />
            </ProfileField>
            <FieldDivider />
            <ProfileField label="Favourite verse">
              <TextInput value={favoriteVerse} onChangeText={setFavoriteVerse} placeholder="e.g. Philippians 4:13"
                placeholderTextColor={colors.textMuted} multiline style={[styles.fieldInput, styles.fieldTextarea]} />
            </ProfileField>
            <FieldDivider />
            <ProfileField label="Favourite hymn">
              <TextInput value={favoriteHymn} onChangeText={setFavoriteHymn} placeholder="e.g. How Great Thou Art"
                placeholderTextColor={colors.textMuted} style={styles.fieldInput} />
            </ProfileField>

            <Pressable onPress={save} disabled={saving || uploadingAvatar}
              style={({ pressed }) => [styles.saveBtn, (saving || uploadingAvatar) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>

          {isAdmin && (
            <View style={styles.badgeRow}>
              {isSuperAdmin
                ? <RoleBadge label="Super Admin" tone="gold" />
                : <RoleBadge label="Admin" tone="gold" />}
            </View>
          )}

          {/* Super admin link */}
          {isAdmin && (
            <TouchableOpacity style={styles.adminLink} onPress={() => (navigation as any).navigate('Admin')}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
              <Text style={styles.adminLinkText}>Admin Panel</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          <Pressable onPress={signOut} style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Text style={styles.versionText}>ChurchFlow · v0.2.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProfileAvatar({ name, size = 48, tone = 'scarlet' }: { name: string; size?: number; tone?: 'scarlet' | 'gold' }) {
  const initials = name.split(' ').map(s => s[0] ?? '').join('').slice(0, 2).toUpperCase();
  const bg = tone === 'gold' ? colors.accent : colors.primary;
  return (
    <View style={[styles.initialsAvatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initialsAvatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
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
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'gold' ? colors.accent : colors.primary }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  sectionHeader: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  pageTitle: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.4, lineHeight: 34 },
  identityRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarContainer: { position: 'relative' },
  avatarImage: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.border },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  avatarHint: { fontSize: 11, color: colors.textMutedSoft, marginTop: 4, fontStyle: 'italic' },
  initialsAvatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  initialsAvatarText: { color: '#fff', fontFamily: fonts.serif, fontWeight: '600', letterSpacing: 0.5 },
  identityName: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  identitySub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card },
  fieldGroup: { paddingVertical: 4, gap: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' },
  fieldInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, paddingHorizontal: 13, fontSize: 15.5, color: colors.text, fontWeight: '500' },
  fieldTextarea: { minHeight: 80, textAlignVertical: 'top', fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: colors.textSoft },
  fieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft, marginVertical: 6 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', marginTop: 14, shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16, letterSpacing: 0.1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  badgeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.xs },
  badge: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill },
  badgeText: { color: '#fff', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  adminLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  adminLinkText: { flex: 1, fontSize: 15, color: colors.primary, fontWeight: '600' },
  signOutBtn: { marginTop: spacing.xl, padding: spacing.md, alignItems: 'center' },
  signOutText: { color: colors.primary, fontWeight: '600', fontSize: 15, letterSpacing: 0.1 },
  versionText: { textAlign: 'center', fontSize: 11, color: colors.textMutedSoft, paddingBottom: 4 },
});
