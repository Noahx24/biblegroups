export type VerseFetch = {
  reference: string;
  text: string;
  translation: string;
};

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchVerse(reference: string, translation = 'web'): Promise<VerseFetch> {
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
}
