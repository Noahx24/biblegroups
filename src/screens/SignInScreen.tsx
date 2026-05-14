import { useRef, useState } from 'react';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const trimEmail = email.trim();
    setEmailError(null);
    setPasswordError(null);
    setInfo(null);

    let invalid = false;
    if (!trimEmail) {
      setEmailError('Enter your email address.');
      invalid = true;
    } else if (!EMAIL_RE.test(trimEmail)) {
      setEmailError("That email doesn't look right.");
      invalid = true;
    }
    if (mode !== 'reset') {
      if (!password) {
        setPasswordError('Enter your password.');
        invalid = true;
      } else if (mode === 'signUp' && password.length < 6) {
        setPasswordError('At least 6 characters.');
        invalid = true;
      }
    }
    if (invalid) return;

    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(trimEmail, password);
      } else if (mode === 'signUp') {
        await signUp(trimEmail, password, displayName);
        setInfo('Check your email for a confirmation link to activate your account.');
      } else {
        await requestPasswordReset(trimEmail);
        setInfo('Check your inbox for a password reset link.');
      }
    } catch (e) {
      // Server errors are unpredictable — keep the modal alert here.
      Alert.alert('Sign-in error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setEmailError(null);
    setPasswordError(null);
    setInfo(null);
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

          {info && (
            <View style={styles.infoBox} accessibilityLiveRegion="polite">
              <Text style={styles.infoText}>{info}</Text>
            </View>
          )}

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
                returnKeyType="next"
                style={styles.input}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(null); }}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType={mode === 'reset' ? 'send' : 'next'}
            onSubmitEditing={() => {
              if (mode === 'reset') submit();
              else passwordRef.current?.focus();
            }}
            style={[styles.input, !!emailError && styles.inputError]}
            accessibilityLabel="Email address"
          />
          {emailError && <Text style={styles.fieldError}>{emailError}</Text>}

          {mode !== 'reset' && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => { setPassword(t); if (passwordError) setPasswordError(null); }}
                placeholder={mode === 'signUp' ? 'At least 6 characters' : '••••••••'}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'signUp' ? 'password-new' : 'password'}
                textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                returnKeyType="send"
                onSubmitEditing={submit}
                style={[styles.input, !!passwordError && styles.inputError]}
                accessibilityLabel="Password"
              />
              {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
            </>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            accessibilityState={{ busy, disabled: busy }}
          >
            <Text style={styles.primaryText}>{buttonLabel}</Text>
          </Pressable>

          <View style={styles.links}>
            {mode === 'signIn' && (
              <>
                <Pressable onPress={() => switchMode('signUp')} hitSlop={8}>
                  <Text style={styles.link}>New here? Create account</Text>
                </Pressable>
                <Pressable onPress={() => switchMode('reset')} hitSlop={8}>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              </>
            )}
            {mode === 'signUp' && (
              <Pressable onPress={() => switchMode('signIn')} hitSlop={8}>
                <Text style={styles.link}>Already have an account? Sign in</Text>
              </Pressable>
            )}
            {mode === 'reset' && (
              <Pressable onPress={() => switchMode('signIn')} hitSlop={8}>
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
  infoBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  infoText: { color: colors.primaryDark, fontSize: 14, lineHeight: 20 },
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
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 12.5, marginTop: -spacing.xs, fontWeight: '500' },
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
