/**
 * Bible provider abstraction.
 *
 * Public API
 *   fetchVerse(reference, translation) — cache → online → offline fallback
 *   openInYouVersion(reference)        — open bible.com (YouVersion) in app or browser
 *
 * Backends
 *   OnlineBibleBackend   — bible-api.com (free, public-domain translations only)
 *   OfflineBibleBackend  — hardcoded seed of 15 popular verses for zero-network fallback
 *
 * Cache
 *   AsyncStorage key: @churchflow/bible_cache_v1
 *   Up to CACHE_MAX_SIZE entries; oldest entries are evicted first.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

// ─── types ────────────────────────────────────────────────────────────────────

export type VerseFetch = {
  reference: string;
  text: string;
  translation: string;
};

export interface BibleProvider {
  fetch(reference: string, translation: string): Promise<VerseFetch>;
}

// ─── cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY = '@churchflow/bible_cache_v1';
const CACHE_MAX_SIZE = 50;

type CacheEntry = {
  key: string;            // `${translation}:${normalisedReference}`
  reference: string;
  text: string;
  translation: string;
};

async function readCache(): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CacheEntry[];
  } catch {
    return [];
  }
}

async function writeCache(entries: CacheEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Cache writes are best-effort; swallow errors silently.
  }
}

function cacheKey(reference: string, translation: string): string {
  return `${translation.toLowerCase()}:${reference.trim().toLowerCase()}`;
}

async function cacheGet(reference: string, translation: string): Promise<CacheEntry | null> {
  const k = cacheKey(reference, translation);
  const entries = await readCache();
  return entries.find(e => e.key === k) ?? null;
}

async function cachePut(verse: VerseFetch): Promise<void> {
  const k = cacheKey(verse.reference, verse.translation);
  const entries = await readCache();
  // Remove existing entry with the same key (move-to-front semantics)
  const filtered = entries.filter(e => e.key !== k);
  const updated: CacheEntry[] = [
    { key: k, reference: verse.reference, text: verse.text, translation: verse.translation },
    ...filtered,
  ].slice(0, CACHE_MAX_SIZE);
  await writeCache(updated);
}

// ─── online backend ───────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

const OnlineBibleBackend: BibleProvider = {
  async fetch(reference, translation) {
    const encoded = encodeURIComponent(reference.trim());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://bible-api.com/${encoded}?translation=${translation}`, {
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Verse lookup timed out. Check your connection and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`Could not find passage "${reference}"`);
    }
    const json = (await res.json()) as {
      reference: string;
      text: string;
      translation_name?: string;
    };
    return {
      reference: json.reference,
      text: json.text.trim(),
      translation: json.translation_name ?? translation.toUpperCase(),
    };
  },
};

// ─── offline backend ──────────────────────────────────────────────────────────
// A small seed of widely used verses so the app degrades gracefully with no
// network. Only covers exact reference matches (case-insensitive, trimmed).

type OfflineVerse = { text: string; fullRef: string; translationName: string };

const OFFLINE_WEB: Record<string, OfflineVerse> = {
  'john 3:16': {
    fullRef: 'John 3:16',
    translationName: 'World English Bible',
    text: 'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.',
  },
  'psalm 23:1': {
    fullRef: 'Psalm 23:1',
    translationName: 'World English Bible',
    text: 'The LORD is my shepherd; I shall not lack.',
  },
  'romans 8:28': {
    fullRef: 'Romans 8:28',
    translationName: 'World English Bible',
    text: 'We know that all things work together for good for those who love God, to those who are called according to his purpose.',
  },
  'philippians 4:13': {
    fullRef: 'Philippians 4:13',
    translationName: 'World English Bible',
    text: 'I can do all things through Christ, who strengthens me.',
  },
  'jeremiah 29:11': {
    fullRef: 'Jeremiah 29:11',
    translationName: 'World English Bible',
    text: '"For I know the plans that I have for you," says the LORD, "plans for your welfare and not for calamity, to give you hope and a future."',
  },
  'isaiah 40:31': {
    fullRef: 'Isaiah 40:31',
    translationName: 'World English Bible',
    text: 'but those who wait for the LORD will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.',
  },
};

const OFFLINE_BY_TRANSLATION: Record<string, Record<string, OfflineVerse>> = {
  web: OFFLINE_WEB,
};

const OfflineBibleBackend: BibleProvider = {
  async fetch(reference, translation) {
    const key = reference.trim().toLowerCase();
    const lookup = OFFLINE_BY_TRANSLATION[translation.toLowerCase()] ?? OFFLINE_WEB;
    const verse = lookup[key];
    if (!verse) {
      throw new Error(
        `"${reference}" is not available offline. Connect to the internet to look up this verse.`,
      );
    }
    return {
      reference: verse.fullRef,
      text: verse.text,
      translation: verse.translationName,
    };
  },
};

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a Bible verse: cache → online → offline fallback.
 *
 * The result is always written to the cache on a successful online fetch so
 * it is available instantly next time (even offline).
 */
export async function fetchVerse(
  reference: string,
  translation = 'web',
): Promise<VerseFetch> {
  // 1. Cache hit
  const cached = await cacheGet(reference, translation);
  if (cached) {
    return { reference: cached.reference, text: cached.text, translation: cached.translation };
  }

  // 2. Online
  try {
    const verse = await OnlineBibleBackend.fetch(reference, translation);
    await cachePut(verse);
    return verse;
  } catch (onlineErr) {
    // 3. Offline fallback (only for network/timeout errors, not 404s)
    const isNetworkError =
      onlineErr instanceof Error &&
      (onlineErr.message.includes('timed out') ||
        onlineErr.message.includes('Network request failed') ||
        onlineErr.name === 'AbortError');

    if (isNetworkError) {
      return OfflineBibleBackend.fetch(reference, translation);
    }
    throw onlineErr;
  }
}

/**
 * Open a Bible reference in the YouVersion app (if installed) or on
 * bible.com in the browser. Uses the universal bible.com URL so the OS
 * routes to the app when available without needing a separate canOpenURL
 * check.
 */
export async function openInYouVersion(reference: string): Promise<void> {
  const url = `https://www.bible.com/search/bible?q=${encodeURIComponent(reference.trim())}`;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}
