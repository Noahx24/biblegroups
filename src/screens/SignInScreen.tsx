import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';

export function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>BibleGroups</Text>
        <Text style={styles.subtitle}>Sign in to join your small group.</Text>

        <Pressable
          onPress={() => run(signInWithGoogle)}
          disabled={busy}
          style={({ pressed }) => [styles.button, styles.google, pressed && styles.pressed]}
        >
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555', marginBottom: 24 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  google: { backgroundColor: '#4285F4' },
  googleText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
