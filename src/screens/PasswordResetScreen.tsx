import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing } from '@/theme';

export function PasswordResetScreen() {
  const { updatePassword, exitRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      Alert.alert('Password updated', 'You are now signed in.');
    } catch (e) {
      Alert.alert('Could not update password', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    Alert.alert(
      'Cancel password reset?',
      'You will need to request a new reset link to try again.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Cancel reset',
          style: 'destructive',
          onPress: async () => {
            await exitRecovery();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.title}>Set new password</Text>
            <Text style={styles.tagline}>ChurchFlow</Text>
          </View>
          <Text style={styles.subtitle}>
            Choose a new password for your account. You're signed in for this reset only.
          </Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoFocus
            style={styles.input}
          />

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
          />

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{busy ? 'Updating…' : 'Update password'}</Text>
          </Pressable>

          <Pressable onPress={cancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  inner: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.sm + 2 },
  brand: { alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: colors.primary },
  tagline: { fontSize: 12, color: colors.accentDark, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 14, textAlign: 'center', color: colors.textMuted, marginBottom: spacing.lg },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  cancelBtn: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14 },
});
