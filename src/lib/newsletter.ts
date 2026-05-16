import { XMLParser } from 'fast-xml-parser';

// BMC In Touch newsletter - Mailchimp public RSS feed.
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
};

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
      return {
        id,
        title,
        link,
        pubDate,
        snippet: stripHtml(description).slice(0, 200),
      };
    })
    .filter((x): x is NewsletterItem => x !== null)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}
