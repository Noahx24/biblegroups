import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { authErrorTitle, friendlyAuthError } from '@/lib/authErrors';
import { colors, radius, spacing } from '@/theme';
import type { Church } from '@/types';

type Mode = 'signIn' | 'signUp' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Contact address shown when a church isn't listed yet.
const SUPPORT_EMAIL = 'noahxm24@gmail.com';

export function SignInScreen() {
  const { signIn, signInWithGoogle, signUp, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [churchError, setChurchError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [churchId, setChurchId] = useState<string | null>(null);
  const [churchPickerOpen, setChurchPickerOpen] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const selectedChurch = churches.find((c) => c.id === churchId) ?? null;

  // Load the church list once — needed for the sign-up picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('churches').select('*').order('name');
      if (cancelled) return;
      if (error) { console.warn('churches load failed', error); return; }
      setChurches((data as Church[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    const trimEmail = email.trim();
    const trimName = displayName.trim();
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setChurchError(null);
    setInfo(null);

    let invalid = false;
    if (mode === 'signUp' && !trimName) {
      setNameError('Enter your name.');
      invalid = true;
    }
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
    if (mode === 'signUp' && !churchId) {
      setChurchError('Select your church to continue.');
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(trimEmail, password);
      } else if (mode === 'signUp') {
        await signUp(trimEmail, password, trimName, churchId ?? undefined);
        setInfo('Check your email for a confirmation link to activate your account.');
      } else {
        await requestPasswordReset(trimEmail);
        setInfo('Check your inbox for a password reset link.');
      }
    } catch (e) {
      // Map raw Supabase / network errors to friendly, action-specific copy.
      Alert.alert(authErrorTitle(mode), friendlyAuthError(e, mode));
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      // Session arrives via the auth deep-link handler; the navigator routes in.
    } catch (e) {
      Alert.alert('Google sign-in failed', friendlyAuthError(e, 'signIn'));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setChurchError(null);
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
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); if (nameError) setNameError(null); }}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                style={[styles.input, !!nameError && styles.inputError]}
                accessibilityLabel="Name"
              />
              {nameError && <Text style={styles.fieldError}>{nameError}</Text>}

              <Text style={styles.label}>Church</Text>
              {churches.length === 0 ? (
                <Text style={styles.churchHint}>
                  No churches are listed yet. Please ask your church to get in touch at {SUPPORT_EMAIL} so we can add them.
                </Text>
              ) : (
                <Pressable
                  onPress={() => setChurchPickerOpen(true)}
                  style={[styles.input, styles.churchField, !!churchError && styles.inputError]}
                  accessibilityRole="button"
                  accessibilityLabel="Select your church"
                >
                  <Text style={selectedChurch ? styles.churchFieldText : styles.churchFieldPlaceholder}>
                    {selectedChurch ? selectedChurch.name : 'Select your church'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
                </Pressable>
              )}
              {churchError && <Text style={styles.fieldError}>{churchError}</Text>}
              <Text style={styles.churchHint}>
                Don't see your church? Ask your church to get in touch at {SUPPORT_EMAIL} so we can add them.
              </Text>

              <Modal
                visible={churchPickerOpen}
                animationType="slide"
                transparent
                onRequestClose={() => setChurchPickerOpen(false)}
              >
                <Pressable style={styles.modalBackdrop} onPress={() => setChurchPickerOpen(false)}>
                  <Pressable style={styles.modalSheet} onPress={() => {}}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Select your church</Text>
                      <Pressable
                        onPress={() => setChurchPickerOpen(false)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <Ionicons name="close" size={24} color={colors.textMuted} />
                      </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
                      {churches.map((c) => {
                        const active = churchId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => {
                              // Tapping the selected church again clears it.
                              setChurchId(active ? null : c.id);
                              if (churchError) setChurchError(null);
                              setChurchPickerOpen(false);
                            }}
                            style={[styles.churchRow, active && styles.churchRowActive]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text style={[styles.churchRowText, active && styles.churchRowTextActive]}>
                              {c.name}
                            </Text>
                            {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>
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
              <View style={[styles.passwordWrap, !!passwordError && styles.inputError]}>
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={(t) => { setPassword(t); if (passwordError) setPasswordError(null); }}
                  placeholder={mode === 'signUp' ? 'At least 6 characters' : '••••••••'}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'signUp' ? 'password-new' : 'password'}
                  textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                  style={styles.passwordInput}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
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

          {mode !== 'reset' && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                onPress={googleSignIn}
                disabled={busy}
                style={({ pressed }) => [styles.googleBtn, busy && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                <Ionicons name="logo-google" size={18} color={colors.text} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </Pressable>
            </>
          )}

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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  passwordInput: { flex: 1, padding: spacing.md, fontSize: 16, color: colors.text },
  eyeBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fieldError: { color: colors.danger, fontSize: 12.5, marginTop: -spacing.xs, fontWeight: '500' },
  churchField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  churchFieldText: { fontSize: 16, color: colors.text },
  churchFieldPlaceholder: { fontSize: 16, color: colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalList: { gap: spacing.xs },
  churchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  churchRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  churchRowText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  churchRowTextActive: { color: colors.primaryDark },
  churchHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.md + 2, backgroundColor: colors.surface, marginTop: spacing.md,
  },
  googleBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  links: { gap: spacing.md, alignItems: 'center', marginTop: spacing.md },
  link: { color: colors.primary, fontSize: 14, fontWeight: '500' },
});
