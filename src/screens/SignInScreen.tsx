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

type Mode = 'signIn' | 'signUp' | 'reset';

export function SignInScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimEmail = email.trim();
    if (!trimEmail) {
      Alert.alert('Email required');
      return;
    }
    if (mode !== 'reset' && !password) {
      Alert.alert('Password required');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(trimEmail, password);
      } else if (mode === 'signUp') {
        await signUp(trimEmail, password, displayName);
        Alert.alert(
          'Check your email',
          'We sent you a confirmation link. Open it to activate your account.',
        );
      } else {
        await requestPasswordReset(trimEmail);
        Alert.alert('Email sent', 'Check your inbox for a password reset link.');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
  };

  const buttonLabel =
    mode === 'signIn' ? (busy ? 'Signing in…' : 'Sign in') :
    mode === 'signUp' ? (busy ? 'Creating account…' : 'Create account') :
    (busy ? 'Sending…' : 'Send reset link');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Text style={styles.title}>ChurchFlow</Text>
            <Text style={styles.tagline}>Church Community Platform</Text>
          </View>
          <Text style={styles.subtitle}>
            {mode === 'signIn' && 'Sign in to your community.'}
            {mode === 'signUp' && 'Create an account to get started.'}
            {mode === 'reset' && 'Enter your email to reset your password.'}
          </Text>

          {mode === 'signUp' && (
            <>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.input}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          {mode !== 'reset' && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'signUp' ? 'At least 6 characters' : '••••••••'}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />
            </>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{buttonLabel}</Text>
          </Pressable>

          <View style={styles.links}>
            {mode === 'signIn' && (
              <>
                <Pressable onPress={() => switchMode('signUp')}>
                  <Text style={styles.link}>New here? Create account</Text>
                </Pressable>
                <Pressable onPress={() => switchMode('reset')}>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              </>
            )}
            {mode === 'signUp' && (
              <Pressable onPress={() => switchMode('signIn')}>
                <Text style={styles.link}>Already have an account? Sign in</Text>
              </Pressable>
            )}
            {mode === 'reset' && (
              <Pressable onPress={() => switchMode('signIn')}>
                <Text style={styles.link}>Back to sign in</Text>
              </Pressable>
            )}
          </View>
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
  title: { fontSize: 34, fontWeight: '800', textAlign: 'center', color: colors.primary, letterSpacing: 0.5 },
  tagline: { fontSize: 12, color: colors.accentDark, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 15, textAlign: 'center', color: colors.textMuted, marginBottom: spacing.lg },
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
    marginTop: spacing.sm,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  links: { gap: spacing.md, alignItems: 'center', marginTop: spacing.md },
  link: { color: colors.primary, fontSize: 14, fontWeight: '500' },
});
