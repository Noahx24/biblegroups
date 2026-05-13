import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors, spacing } from '@/theme';

const HOME_URL = 'https://bmc.org.za/';

export function AnnouncementsScreen() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNavChange = (nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  };

  const reload = () => {
    setError(null);
    webRef.current?.reload();
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => webRef.current?.goBack()}
          disabled={!canGoBack}
          style={({ pressed }) => [styles.tbtn, !canGoBack && styles.tbtnDisabled, pressed && styles.pressed]}
        >
          <Text style={[styles.tbtnText, !canGoBack && styles.tbtnTextDisabled]}>‹ Back</Text>
        </Pressable>
        <Text style={styles.toolbarTitle}>BMC Announcements</Text>
        <Pressable
          onPress={reload}
          style={({ pressed }) => [styles.tbtn, pressed && styles.pressed]}
        >
          <Text style={styles.tbtnText}>↻</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn't load announcements</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Pressable
            onPress={reload}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.flex}>
          <WebView
            ref={webRef}
            source={{ uri: HOME_URL }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={onNavChange}
            onError={(e) => {
              setLoading(false);
              setError(e.nativeEvent.description ?? 'Network error');
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          />
          {loading && (
            <View pointerEvents="none" style={styles.loaderOverlay}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toolbarTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  tbtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minWidth: 64 },
  tbtnDisabled: { opacity: 0.3 },
  tbtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  tbtnTextDisabled: { color: colors.textMuted },
  pressed: { opacity: 0.6 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderOverlay: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  errorMsg: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
