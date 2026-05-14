import { XMLParser } from 'fast-xml-parser';

// BMC In Touch newsletter — Mailchimp public RSS feed.
// The mailchi.mp/{slug} archive page exposes this feed at:
// https://us17.campaign-archive.com/feed?u={USER_ID}&id={LIST_ID}
const FEED_URL =
  'https://us17.campaign-archive.com/feed?u=5bd0a73f0cb33097d64355c16&id=4a7f533b2d';
const FETCH_TIMEOUT_MS = 15_000;

export type NewsletterItem = {
  id: string;
  title: string;
  link: string;
  pubDate: Date;
  snippet: string;
  theme: string;
  // First moment of the liturgical season — used to sort sections.
  themeSortKey: number;
};

// ─── Liturgical season classifier ────────────────────────────────────────────
// Western liturgical calendar. Easter is the moveable feast that anchors most
// seasons; Advent is computed from Christmas Eve.

function easterSunday(year: number): Date {
  // Meeus / Jones / Butcher Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

function firstSundayOfAdvent(year: number): Date {
  // Advent IV is the Sunday on or before Christmas Eve; Advent I is 3 Sundays earlier.
  const dec24 = new Date(year, 11, 24);
  const adventIV = addDays(dec24, -dec24.getDay());
  return addDays(adventIV, -21);
}

export function classifyLiturgicalSeason(date: Date): { theme: string; themeSortKey: number } {
  if (Number.isNaN(date.getTime())) {
    return { theme: 'Other', themeSortKey: 0 };
  }
  const t = date.getTime();
  const year = date.getFullYear();

  const easter = easterSunday(year);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const trinitySunday = addDays(easter, 56);
  const adventI = firstSundayOfAdvent(year);

  // Christmas / Christmas-tide spans the calendar year boundary.
  if (date.getMonth() === 11 && date.getDate() >= 25) {
    return { theme: `Christmas ${year}`, themeSortKey: new Date(year, 11, 25).getTime() };
  }
  if (date.getMonth() === 0 && date.getDate() <= 5) {
    // Jan 1-5 is still Christmas season of the previous year.
    return { theme: `Christmas ${year - 1}`, themeSortKey: new Date(year - 1, 11, 25).getTime() };
  }

  if (t < ashWednesday.getTime()) {
    // Jan 6 - day before Ash Wednesday
    return { theme: `Epiphany ${year}`, themeSortKey: new Date(year, 0, 6).getTime() };
  }
  if (t < palmSunday.getTime()) {
    return { theme: `Lent ${year}`, themeSortKey: ashWednesday.getTime() };
  }
  if (t < easter.getTime()) {
    return { theme: `Holy Week ${year}`, themeSortKey: palmSunday.getTime() };
  }
  if (t <= trinitySunday.getTime()) {
    return { theme: `Easter to Trinity Sunday ${year}`, themeSortKey: easter.getTime() };
  }
  if (t < adventI.getTime()) {
    return { theme: `Ordinary Time ${year}`, themeSortKey: trinitySunday.getTime() };
  }
  return { theme: `Advent ${year}`, themeSortKey: adventI.getTime() };
}

type RawItem = {
  title?: string | { '#text'?: string };
  link?: string;
  pubDate?: string;
  description?: string;
  guid?: string | { '#text'?: string };
};

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
});

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '#text' in v) {
    const t = (v as { '#text'?: unknown })['#text'];
    return typeof t === 'string' ? t : '';
  }
  return '';
}

// Strip HTML tags + collapse whitespace so the list-row snippet stays readable
// even when the description embeds tracking pixels and inline styles.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchNewsletters(): Promise<NewsletterItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(FEED_URL, { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Newsletter feed timed out. Check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Newsletter feed returned ${res.status}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: RawItem | RawItem[] } };
  };

  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  return list
    .map<NewsletterItem | null>((it) => {
      const title = textOf(it.title);
      const link = typeof it.link === 'string' ? it.link.trim() : '';
      const dateStr = it.pubDate ?? '';
      const pubDate = dateStr ? new Date(dateStr) : new Date(NaN);
      const description = typeof it.description === 'string' ? it.description : '';
      const id = textOf(it.guid) || link || title;
      if (!title || !link) return null;
      const season = classifyLiturgicalSeason(pubDate);
      return {
        id,
        title,
        link,
        pubDate,
        snippet: stripHtml(description).slice(0, 200),
        theme: season.theme,
        themeSortKey: season.themeSortKey,
      };
    })
    .filter((x): x is NewsletterItem => x !== null)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}
