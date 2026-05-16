/**
 * Bible provider abstraction.
 *
 * Public API
 *   fetchVerse(reference, translation) - cache → YouVersion API → bible-api.com → offline
 *
 * Backends
 *   YouVersionBibleBackend - api.scripture.api.bible (requires EXPO_PUBLIC_BIBLE_API_KEY)
 *   OnlineBibleBackend    - bible-api.com (free, KJV public-domain, no key needed)
 *   OfflineBibleBackend   - hardcoded KJV seed for zero-network fallback
 *
 * Environment variables (add to .env):
 *   EXPO_PUBLIC_BIBLE_API_KEY      - API key from your YouVersion / api.bible developer portal
 *   EXPO_PUBLIC_BIBLE_ID_KJV       - api.bible Bible ID for KJV  (default: de4e12af7f28f599-01)
 *   EXPO_PUBLIC_BIBLE_ID_ESV       - api.bible Bible ID for ESV
 *   EXPO_PUBLIC_BIBLE_ID_NIV       - api.bible Bible ID for NIV
 *   EXPO_PUBLIC_BIBLE_ID_NLT       - api.bible Bible ID for NLT
 *
 * Cache
 *   AsyncStorage key: @churchflow/bible_cache_v1
 *   Up to CACHE_MAX_SIZE entries; oldest entries are evicted first.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  key: string;
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
  return `${translation.toLowerCase()}:${reference.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

async function cacheGet(reference: string, translation: string): Promise<CacheEntry | null> {
  const k = cacheKey(reference, translation);
  const entries = await readCache();
  return entries.find(e => e.key === k) ?? null;
}

async function cachePut(verse: VerseFetch): Promise<void> {
  const k = cacheKey(verse.reference, verse.translation);
  const entries = await readCache();
  const filtered = entries.filter(e => e.key !== k);
  const updated: CacheEntry[] = [
    { key: k, reference: verse.reference, text: verse.text, translation: verse.translation },
    ...filtered,
  ].slice(0, CACHE_MAX_SIZE);
  await writeCache(updated);
}

// ─── OSIS reference converter ─────────────────────────────────────────────────
// Converts human references like "John 3:16" → api.bible passage IDs like "JHN.3.16"

const OSIS_BOOKS: Record<string, string> = {
  // Old Testament
  'genesis': 'GEN', 'gen': 'GEN',
  'exodus': 'EXO', 'exod': 'EXO', 'ex': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV',
  'numbers': 'NUM', 'num': 'NUM',
  'deuteronomy': 'DEU', 'deut': 'DEU', 'dt': 'DEU',
  'joshua': 'JOS', 'josh': 'JOS',
  'judges': 'JDG', 'judg': 'JDG',
  'ruth': 'RUT',
  '1samuel': '1SA', '1sam': '1SA', '1sa': '1SA',
  '2samuel': '2SA', '2sam': '2SA', '2sa': '2SA',
  '1kings': '1KI', '1kgs': '1KI', '1ki': '1KI',
  '2kings': '2KI', '2kgs': '2KI', '2ki': '2KI',
  '1chronicles': '1CH', '1chr': '1CH', '1ch': '1CH',
  '2chronicles': '2CH', '2chr': '2CH', '2ch': '2CH',
  'ezra': 'EZR', 'ezr': 'EZR',
  'nehemiah': 'NEH', 'neh': 'NEH',
  'esther': 'EST', 'est': 'EST',
  'job': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'pr': 'PRO', 'pro': 'PRO',
  'ecclesiastes': 'ECC', 'eccl': 'ECC', 'eccles': 'ECC', 'ec': 'ECC',
  'songofsolomon': 'SNG', 'song': 'SNG', 'sos': 'SNG', 'songofsongs': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA',
  'jeremiah': 'JER', 'jer': 'JER',
  'lamentations': 'LAM', 'lam': 'LAM',
  'ezekiel': 'EZK', 'ezek': 'EZK', 'ezk': 'EZK',
  'daniel': 'DAN', 'dan': 'DAN',
  'hosea': 'HOS', 'hos': 'HOS',
  'joel': 'JOL', 'jl': 'JOL',
  'amos': 'AMO', 'am': 'AMO',
  'obadiah': 'OBA', 'ob': 'OBA',
  'jonah': 'JNA', 'jon': 'JNA',
  'micah': 'MIC', 'mic': 'MIC',
  'nahum': 'NAM', 'nah': 'NAM',
  'habakkuk': 'HAB', 'hab': 'HAB',
  'zephaniah': 'ZEP', 'zeph': 'ZEP',
  'haggai': 'HAG', 'hag': 'HAG',
  'zechariah': 'ZEC', 'zech': 'ZEC', 'zec': 'ZEC',
  'malachi': 'MAL', 'mal': 'MAL',
  // New Testament
  'matthew': 'MAT', 'matt': 'MAT', 'mt': 'MAT',
  'mark': 'MRK', 'mrk': 'MRK', 'mk': 'MRK',
  'luke': 'LUK', 'lk': 'LUK',
  'john': 'JHN', 'jn': 'JHN',
  'acts': 'ACT', 'act': 'ACT',
  'romans': 'ROM', 'rom': 'ROM',
  '1corinthians': '1CO', '1cor': '1CO', '1co': '1CO',
  '2corinthians': '2CO', '2cor': '2CO', '2co': '2CO',
  'galatians': 'GAL', 'gal': 'GAL',
  'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'php': 'PHP',
  'colossians': 'COL', 'col': 'COL',
  '1thessalonians': '1TH', '1thess': '1TH', '1th': '1TH',
  '2thessalonians': '2TH', '2thess': '2TH', '2th': '2TH',
  '1timothy': '1TI', '1tim': '1TI', '1ti': '1TI',
  '2timothy': '2TI', '2tim': '2TI', '2ti': '2TI',
  'titus': 'TIT', 'tit': 'TIT',
  'philemon': 'PHM', 'phlm': 'PHM', 'phm': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB',
  'james': 'JAS', 'jas': 'JAS',
  '1peter': '1PE', '1pet': '1PE', '1pe': '1PE',
  '2peter': '2PE', '2pet': '2PE', '2pe': '2PE',
  '1john': '1JN', '1jn': '1JN',
  '2john': '2JN', '2jn': '2JN',
  '3john': '3JN', '3jn': '3JN',
  'jude': 'JDE', 'jde': 'JDE',
  'revelation': 'REV', 'rev': 'REV',
};

function toOsisId(reference: string): string | null {
  const ref = reference.trim();
  // Match: [digit prefix] [book words] [chapter] [optional :verseStart[-verseEnd]]
  const m = ref.match(/^(\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  const [, numPrefix, bookName, chapter, verseStart, verseEnd] = m;
  const rawBook = ((numPrefix ?? '').trim() + bookName).toLowerCase().replace(/\s+/g, '');
  const bookId = OSIS_BOOKS[rawBook];
  if (!bookId) return null;
  if (parseInt(chapter, 10) < 1) return null;
  if (verseStart && parseInt(verseStart, 10) < 1) return null;
  if (!verseStart) return `${bookId}.${chapter}`;
  if (!verseEnd) return `${bookId}.${chapter}.${verseStart}`;
  return `${bookId}.${chapter}.${verseStart}-${bookId}.${chapter}.${verseEnd}`;
}

// ─── env / configuration ──────────────────────────────────────────────────────

const BIBLE_API_KEY = process.env.EXPO_PUBLIC_BIBLE_API_KEY ?? '';
const BIBLE_API_BASE = 'https://api.scripture.api.bible/v1';

// Bible IDs from your api.bible portal. Default KJV ID is the public ABS edition.
const BIBLE_IDS: Record<string, string> = {
  kjv: process.env.EXPO_PUBLIC_BIBLE_ID_KJV ?? 'de4e12af7f28f599-01',
  esv: process.env.EXPO_PUBLIC_BIBLE_ID_ESV ?? '',
  niv: process.env.EXPO_PUBLIC_BIBLE_ID_NIV ?? '',
  nlt: process.env.EXPO_PUBLIC_BIBLE_ID_NLT ?? '',
};

const TRANSLATION_NAMES: Record<string, string> = {
  kjv: 'King James Version',
  esv: 'English Standard Version',
  niv: 'New International Version',
  nlt: 'New Living Translation',
};

// ─── timeout ──────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

// ─── YouVersion / api.bible backend ──────────────────────────────────────────

const YouVersionBibleBackend: BibleProvider = {
  async fetch(reference, translation) {
    const bibleId = BIBLE_IDS[translation.toLowerCase()];
    if (!bibleId) {
      throw new Error(
        `No Bible ID configured for "${translation}". ` +
        `Add EXPO_PUBLIC_BIBLE_ID_${translation.toUpperCase()} to your .env.`,
      );
    }

    const passageId = toOsisId(reference);
    if (!passageId) {
      throw new Error(`Could not parse reference "${reference}". Try "John 3:16" or "Psalm 23".`);
    }

    const params = new URLSearchParams({
      'content-type': 'text',
      'include-notes': 'false',
      'include-titles': 'false',
      'include-chapter-numbers': 'false',
      'include-verse-numbers': 'false',
      'include-verse-spans': 'false',
    });
    const url = `${BIBLE_API_BASE}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?${params}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'api-key': BIBLE_API_KEY },
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
      throw new Error(`Could not find passage "${reference}" (HTTP ${res.status})`);
    }

    const json = (await res.json()) as {
      data: { reference: string; content: string };
    };

    const rawText = json.data?.content ?? '';
    if (!rawText) {
      throw new Error(`Could not find passage "${reference}" - empty response from API.`);
    }
    // Strip any residual markup and collapse whitespace
    const cleanText = rawText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    return {
      reference: json.data.reference,
      text: cleanText,
      translation: TRANSLATION_NAMES[translation.toLowerCase()] ?? translation.toUpperCase(),
    };
  },
};

// ─── free online backend (KJV fallback, no API key required) ─────────────────

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

type OfflineVerse = { text: string; fullRef: string; translationName: string };

const OFFLINE_KJV: Record<string, OfflineVerse> = {
  'john 3:16': {
    fullRef: 'John 3:16',
    translationName: 'King James Version',
    text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  },
  'psalm 23:1': {
    fullRef: 'Psalm 23:1',
    translationName: 'King James Version',
    text: 'The LORD is my shepherd; I shall not want.',
  },
  'psalm 23': {
    fullRef: 'Psalm 23',
    translationName: 'King James Version',
    text: "The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me. Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.",
  },
  'romans 8:28': {
    fullRef: 'Romans 8:28',
    translationName: 'King James Version',
    text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
  },
  'philippians 4:13': {
    fullRef: 'Philippians 4:13',
    translationName: 'King James Version',
    text: 'I can do all things through Christ which strengtheneth me.',
  },
  'proverbs 3:5': {
    fullRef: 'Proverbs 3:5',
    translationName: 'King James Version',
    text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.',
  },
  'jeremiah 29:11': {
    fullRef: 'Jeremiah 29:11',
    translationName: 'King James Version',
    text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
  },
  'isaiah 40:31': {
    fullRef: 'Isaiah 40:31',
    translationName: 'King James Version',
    text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
  },
};

const OFFLINE_BY_TRANSLATION: Record<string, Record<string, OfflineVerse>> = {
  kjv: OFFLINE_KJV,
};

const OfflineBibleBackend: BibleProvider = {
  async fetch(reference, translation) {
    const key = reference.trim().toLowerCase();
    const lookup = OFFLINE_BY_TRANSLATION[translation.toLowerCase()] ?? OFFLINE_KJV;
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
 * Fetch a Bible verse: cache → YouVersion API (if key set) → bible-api.com → offline fallback.
 */
export async function fetchVerse(
  reference: string,
  translation = 'kjv',
): Promise<VerseFetch> {
  const cached = await cacheGet(reference, translation);
  if (cached) {
    return { reference: cached.reference, text: cached.text, translation: cached.translation };
  }

  const backend = BIBLE_API_KEY ? YouVersionBibleBackend : OnlineBibleBackend;
  try {
    const verse = await backend.fetch(reference, translation);
    await cachePut(verse);
    return verse;
  } catch (onlineErr) {
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
