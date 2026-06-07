/**
 * DeleteAccountScreen — reached from ProfileScreen via the "Delete account"
 * row. Account deletion lives on its own screen (rather than inline on the
 * profile) so it can't be tapped by accident: the user must deliberately
 * navigate here, then pass the existing two-step confirmation.
 *
 * POPIA right to erasure. The deletion is immediate and irreversible — it
 * erases the account and all cascading personal data (profile, group
 * memberships, family records, push tokens).
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius, spacing } from '@/theme';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'DeleteAccount'>;

export function DeleteAccountScreen() {
  const { deleteAccount } = useAuth();
  const navigation = useNavigation<Nav>();
  const [deleting, setDeleting] = useState(false);

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // Session is now gone; AuthProvider routes back to the sign-in screen.
    } catch (e) {
      setDeleting(false);
      Alert.alert('Could not delete account', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This action cannot be undone. All your personal data will be permanently erased from ChurchFlow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you absolutely sure?',
              'Your profile, group memberships and family records will be erased immediately.',
              [
                { text: 'Keep my account', style: 'cancel' },
                { text: 'Delete permanently', style: 'destructive', onPress: runDelete },
              ],
            ),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Delete account</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={22} color={colors.danger} />
          <Text style={styles.warningTitle}>This cannot be undone</Text>
          <Text style={styles.warningBody}>
            Deleting your account permanently erases your profile, group
            memberships, family records and push notification tokens. This
            satisfies your POPIA right to erasure and takes effect immediately.
          </Text>
        </View>

        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          style={({ pressed }) => [styles.deleteBtn, deleting && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityState={{ busy: deleting, disabled: deleting }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View style={styles.deleteBtnContent}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.deleteText}>Delete my account</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontFamily: fonts.sans, fontSize: 18, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  content: { padding: spacing.lg, gap: spacing.lg },
  warningCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.danger, gap: spacing.sm, alignItems: 'center' },
  warningTitle: { fontFamily: fonts.sans, fontSize: 17, fontWeight: '700', color: colors.danger, textAlign: 'center' },
  warningBody: { fontSize: 14, color: colors.textSoft, lineHeight: 21, textAlign: 'center' },
  deleteBtn: { backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  deleteBtnContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2 },
  deleteText: { color: '#fff', fontWeight: '600', fontSize: 16, letterSpacing: 0.1 },
  cancelBtn: { padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.primary, fontWeight: '600', fontSize: 15, letterSpacing: 0.1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
