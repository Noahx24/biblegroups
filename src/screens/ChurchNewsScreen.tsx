import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { format, isValid } from 'date-fns';
import { fetchNewsletters, type NewsletterItem } from '@/lib/newsletter';
import { colors, radius, spacing } from '@/theme';

export function ChurchNewsScreen() {
  const [items, setItems] = useState<NewsletterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NewsletterItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchNewsletters();
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {error && !items.length ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn't load newsletters</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No newsletters yet. Pull down to refresh after the next In Touch is sent.
            </Text>
          }
          ListHeaderComponent={
            <Text style={styles.lead}>BMC In Touch — Methodist Church of Southern Africa</Text>
          }
          renderItem={({ item, index }) => {
            const dateLabel = isValid(item.pubDate)
              ? format(item.pubDate, 'EEE, MMM d, yyyy')
              : 'Undated';
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                {index === 0 && <Text style={styles.latestPill}>Latest</Text>}
                <Text style={styles.cardDate}>{dateLabel}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.snippet ? (
                  <Text style={styles.cardSnippet} numberOfLines={3}>
                    {item.snippet}
                  </Text>
                ) : null}
                <Text style={styles.cardCta}>Read newsletter →</Text>
              </Pressable>
            );
          }}
        />
      )}

      <NewsletterReader item={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

function NewsletterReader({
  item,
  onClose,
}: {
  item: NewsletterItem | null;
  onClose: () => void;
}) {
  const webRef = useRef<WebView>(null);
  const [readerLoading, setReaderLoading] = useState(true);

  return (
    <Modal
      visible={!!item}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => setReaderLoading(true)}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.toolbar}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.tbtn, pressed && styles.pressed]}
          >
            <Text style={styles.tbtnText}>Done</Text>
          </Pressable>
          <Text style={styles.toolbarTitle} numberOfLines={1}>
            {item?.title ?? ''}
          </Text>
          <Pressable
            onPress={() => webRef.current?.reload()}
            style={({ pressed }) => [styles.tbtn, pressed && styles.pressed]}
          >
            <Text style={styles.tbtnText}>↻</Text>
          </Pressable>
        </View>
        {item && (
          <View style={styles.flex}>
            <WebView
              ref={webRef}
              source={{ uri: item.link }}
              onLoadEnd={() => setReaderLoading(false)}
            />
            {readerLoading && (
              <View pointerEvents="none" style={styles.loaderOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  lead: {
    fontSize: 12,
    color: colors.accentDark,
    textAlign: 'center',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  latestPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cardDate: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardSnippet: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
  cardCta: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  pressed: { opacity: 0.7 },
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
  toolbarTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.text, paddingHorizontal: spacing.sm },
  tbtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minWidth: 56 },
  tbtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  loaderOverlay: { position: 'absolute', top: spacing.md, right: spacing.md },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  errorMsg: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
