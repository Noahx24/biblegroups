import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { format, isValid } from 'date-fns';
import { fetchNewsletters, type NewsletterItem } from '@/lib/newsletter';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Group newsletters by liturgical season; sort sections newest-first.
  const sections = useMemo(() => {
    const byTheme = new Map<string, { theme: string; sortKey: number; data: NewsletterItem[] }>();
    for (const item of items) {
      const existing = byTheme.get(item.theme);
      if (existing) existing.data.push(item);
      else byTheme.set(item.theme, { theme: item.theme, sortKey: item.themeSortKey, data: [item] });
    }
    return Array.from(byTheme.values())
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(s => ({ title: s.theme, data: s.data }));
  }, [items]);

  const latestId = items[0]?.id;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {error && !items.length ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn't load newsletters</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text style={styles.pageTitle}>Church News</Text>
              <Text style={styles.pageSubtitle}>BMC News & Newsletters</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No newsletters yet. Pull down to refresh after the next In Touch is sent.
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.themeHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const dateLabel = isValid(item.pubDate)
              ? format(item.pubDate, 'EEE, MMM d, yyyy')
              : 'Undated';
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                {item.id === latestId && (
                  <View style={styles.latestPill}>
                    <Text style={styles.latestPillText}>Latest</Text>
                  </View>
                )}
                <Text style={styles.cardDate}>{dateLabel}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <NewsletterReader item={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

// CSS + DOM scrub that strips Mailchimp's Subscribe / Past Issues bar and
// the "View this email in your browser" preheader so the in-app reader shows
// just the newsletter body. Runs on every load and after a short delay in
// case Mailchimp adds the chrome with a script tag.
const HIDE_MAILCHIMP_CHROME = `
  (function () {
    var css = \`
      #awesomebar-sandbox,
      #awesomebar,
      div[id^="awesomebar"],
      .campaign-info,
      .preheader,
      #templatePreheader {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    \`;
    var style = document.getElementById('cf-hide-mc');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cf-hide-mc';
      style.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(style);
    }
    function scrubViewInBrowser() {
      var nodes = document.querySelectorAll('a, span, td, p, div');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (text === 'view this email in your browser' ||
            text.indexOf('view this email in your browser') !== -1 && text.length < 80) {
          var target = el;
          for (var j = 0; j < 5 && target.parentElement; j++) {
            if (target.tagName === 'TR') break;
            target = target.parentElement;
          }
          target.style.display = 'none';
        }
      }
    }
    scrubViewInBrowser();
    setTimeout(scrubViewInBrowser, 300);
    setTimeout(scrubViewInBrowser, 1000);
    true;
  })();
`;

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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Toolbar — matches design: ← Back | title+domain | ↻ */}
        <View style={styles.toolbar}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.tbtn, pressed && styles.pressed]}
            accessibilityLabel="Back"
          >
            <Text style={styles.tbtnBack}>‹ Back</Text>
          </Pressable>

          <View style={styles.toolbarCenter}>
            <Text style={styles.toolbarTitle} numberOfLines={1}>
              BMC Announcements
            </Text>
          </View>

          <Pressable
            onPress={() => webRef.current?.reload()}
            style={({ pressed }) => [styles.tbtn, styles.tbtnRight, pressed && styles.pressed]}
            accessibilityLabel="Reload"
          >
            <Text style={styles.tbtnReload}>↻</Text>
          </Pressable>
        </View>

        {item && (
          <View style={styles.flex1}>
            <WebView
              ref={webRef}
              source={{ uri: item.link }}
              onLoadEnd={() => setReaderLoading(false)}
              injectedJavaScript={HIDE_MAILCHIMP_CHROME}
              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress > 0.4) {
                  webRef.current?.injectJavaScript(HIDE_MAILCHIMP_CHROME);
                }
              }}
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
  flex1: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxl },

  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  pageSubtitle: {
    fontSize: 13.5,
    color: colors.textMuted,
    marginTop: 4,
  },
  themeHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.primary,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  latestPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  latestPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDate: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 19,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.1,
    marginBottom: 6,
  },
  cardSnippet: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  cardCta: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },

  pressed: { opacity: 0.75 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tbtn: { minWidth: 70 },
  tbtnRight: { alignItems: 'flex-end' },
  tbtnBack: { color: colors.primary, fontSize: 15, fontWeight: '500' },
  tbtnReload: { color: colors.primary, fontSize: 20 },
  toolbarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  toolbarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  loaderOverlay: { position: 'absolute', top: spacing.md, right: spacing.md },

  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  errorMsg: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: { color: '#fff', fontWeight: '600' },

  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
});
