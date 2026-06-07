/**
 * Bible provider abstraction.
 *
 * Backed solely by the YouVersion Platform API (https://api.youversion.com).
 * Your single App Key is the only secret required; translations are selected by
 * YouVersion's public numeric version IDs (KJV = 1, NIV = 111, …), not per-key.
 *
 * Public API
 *   fetchVerse(reference, translation) — cache → YouVersion API
 *
 * Environment variables (add to .env):
 *   EXPO_PUBLIC_BIBLE_API_KEY — YouVersion Platform App Key (developers.youversion.com)
 *
 * Note: each App Key only has the translations you enabled in the YouVersion
 * Platform dashboard. Enable the versions you query (e.g. KJV) there first.
 *
 * Cache
 *   AsyncStorage key: @churchflow/bible_cache_v2
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

// v2: verse-number parsing was fixed (see htmlToTextWithVerseNumbers); bumping
// the key discards entries cached with the old parser (e.g. "16For God…").
const CACHE_KEY = '@churchflow/bible_cache_v2';
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
  // YouVersion USFM uses the short range form "GEN.3.1-3" (not the api.bible
  // "GEN.3.1-GEN.3.3" form) — the long form 404s on the platform API.
  return `${bookId}.${chapter}.${verseStart}-${verseEnd}`;
}

// ─── env / configuration ──────────────────────────────────────────────────────

// YouVersion Platform App Key — the only secret required.
const BIBLE_API_KEY = process.env.EXPO_PUBLIC_BIBLE_API_KEY ?? '';
const BIBLE_API_BASE = 'https://api.youversion.com/v1';

// YouVersion public numeric version IDs (bible.com). These are not secret —
// they only select the translation. Enable the ones you use in your Platform
// dashboard, or your App Key will not be authorised to read them.
const BIBLE_IDS: Record<string, string> = {
  kjv: '1',
  esv: '59',
  niv: '111',
  nlt: '116',
  nkjv: '114',
  nasb: '100',
  amp: '1588',
  msg: '97',
};

const TRANSLATION_NAMES: Record<string, string> = {
  kjv: 'King James Version',
  esv: 'English Standard Version',
  niv: 'New International Version',
  nlt: 'New Living Translation',
  nkjv: 'New King James Version',
  nasb: 'New American Standard Bible',
  amp: 'Amplified Bible',
  msg: 'The Message',
};

// ─── timeout ──────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

// ─── html → text with verse numbers ───────────────────────────────────────────
// YouVersion's `format=text` strips verse numbers; `format=html` keeps them in
// markup. We pull the verse-number labels out as inline superscripts, then strip
// the remaining tags so the stored text reads e.g. "¹ For the director… ² …".

const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export function toSuperscript(num: string): string {
  return num.replace(/\d/g, d => SUPERSCRIPTS[Number(d)]);
}

function htmlToTextWithVerseNumbers(html: string): string {
  // Non-breaking space keeps a verse-number superscript glued to its word.
  const nbsp = ' ';
  return html
    // Verse-number labels. YouVersion marks these with a class like "label" or
    // "vn"/"verse-num"; match any small inline element carrying such a class,
    // tolerating single/double quotes and nested markup inside the label. We
    // only superscript when the label resolves to a bare number, so the outer
    // verse wrapper (e.g. class="verse v16") is left untouched.
    .replace(
      /<(span|sup|b|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:label|vn|verse-?num(?:ber)?)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
      (_match, _tag: string, inner: string) => {
        const n = inner.replace(/<[^>]+>/g, '').trim();
        return /^\d+$/.test(n) ? ` ${toSuperscript(n)}${nbsp}` : '';
      },
    )
    // Plain <sup>12</sup> verse numbers without a recognised class.
    .replace(/<sup\b[^>]*>\s*(\d+)\s*<\/sup>/gi, (_m, n: string) => ` ${toSuperscript(n)}${nbsp}`)
    // Drop footnote / cross-reference content so it doesn't bleed into the text.
    .replace(/<span[^>]*class=["'][^"']*\b(?:note|cross|fr|ft)\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
    // Strip remaining tags and collapse whitespace.
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    // Safety net: a leading verse number left stuck to the first word, e.g.
    // "16For God…" on a single-verse passage. Pull it off as a superscript.
    .replace(/^(\d{1,3})(?=["'“”]?[A-Za-z])/, (_m, n: string) => `${toSuperscript(n)}${nbsp}`)
    .trim();
}

// ─── YouVersion / api.bible backend ──────────────────────────────────────────

const YouVersionBibleBackend: BibleProvider = {
  async fetch(reference, translation) {
    if (!BIBLE_API_KEY) {
      throw new Error(
        'No YouVersion App Key configured. Set EXPO_PUBLIC_BIBLE_API_KEY in your .env ' +
        '(get one at developers.youversion.com).',
      );
    }

    const bibleId = BIBLE_IDS[translation.toLowerCase()];
    if (!bibleId) {
      throw new Error(
        `No YouVersion version ID configured for "${translation}". ` +
        `Add it to BIBLE_IDS in bible.ts.`,
      );
    }

    const passageId = toOsisId(reference);
    if (!passageId) {
      throw new Error(`Could not parse reference "${reference}". Try "John 3:16" or "Psalm 23".`);
    }

    // format=html keeps verse-number markup, which we convert to inline
    // superscripts (format=text would drop the numbers entirely).
    const params = new URLSearchParams({ format: 'html' });
    const url = `${BIBLE_API_BASE}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?${params}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'X-YVP-App-Key': BIBLE_API_KEY },
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
      // 401/403 mean the request reached the API but the key isn't allowed to
      // read this version — almost always the App Key doesn't have this
      // translation enabled, rather than the passage being missing.
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Your Bible API key isn't authorised for ${translation.toUpperCase()} (HTTP ${res.status}). ` +
          `Enable that translation for your key, or pick one your licence covers.`,
        );
      }
      if (res.status === 404) {
        throw new Error(`Couldn't find "${reference}". Check the book, chapter, and verse.`);
      }
      throw new Error(`Couldn't fetch "${reference}" right now (HTTP ${res.status}). Please try again.`);
    }

    // YouVersion returns the passage fields at the top level (no `data` wrapper).
    const json = (await res.json()) as { reference: string; content: string };

    const rawText = json.content ?? '';
    if (!rawText) {
      throw new Error(`Could not find passage "${reference}" — empty response from API.`);
    }
    // Convert verse-number markup to inline superscripts, then strip the rest.
    const cleanText = htmlToTextWithVerseNumbers(rawText);

    return {
      reference: json.reference,
      text: cleanText,
      translation: TRANSLATION_NAMES[translation.toLowerCase()] ?? translation.toUpperCase(),
    };
  },
};

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a Bible verse: cache → YouVersion Platform API.
 * Throws if the App Key is missing, the reference is unparseable, or the network fails.
 */
export async function fetchVerse(
  reference: string,
  translation = 'niv',
): Promise<VerseFetch> {
  const cached = await cacheGet(reference, translation);
  if (cached) {
    return { reference: cached.reference, text: cached.text, translation: cached.translation };
  }

  const verse = await YouVersionBibleBackend.fetch(reference, translation);
  await cachePut(verse);
  return verse;
}
