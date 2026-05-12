export type VerseFetch = {
  reference: string;
  text: string;
  translation: string;
};

export async function fetchVerse(reference: string, translation = 'web'): Promise<VerseFetch> {
  const encoded = encodeURIComponent(reference.trim());
  const res = await fetch(`https://bible-api.com/${encoded}?translation=${translation}`);
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
