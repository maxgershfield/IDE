import type { StarHolonRecord } from './starApiService';
import { CATALOG_SOURCE_OAPP_TEMPLATE } from './starApiService';
import { holonTypeNameFromEnum } from './holonTypeLabels';

const STOPWORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'are',
  'was',
  'were',
  'will',
  'can',
  'use',
  'using',
  'into',
  'your',
  'their',
  'they',
  'them',
  'our',
  'you',
  'but',
  'not',
  'all',
  'any',
  'app',
  'new',
  'want',
  'need',
  'like',
  'just',
  'one',
  'make',
  'build',
  'create'
]);

export interface HolonSuggestion {
  holon: StarHolonRecord;
  score: number;
  matchedTerms: string[];
}

function tokenize(idea: string): string[] {
  const raw = idea.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return [...new Set(out)];
}

function corpusForHolon(h: StarHolonRecord): string {
  const typeLabel = holonTypeNameFromEnum(h.holonType).toLowerCase();
  const bits = [h.name, h.description, typeLabel];
  if (typeof h.metaData?.catalogSource === 'string') bits.push(h.metaData.catalogSource);
  return bits.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Rank holons by simple token overlap with the user's idea (no network).
 * When nothing matches, returns library templates (or any rows) so the UI still offers picks.
 */
export function suggestHolonsForIdea(
  idea: string,
  holons: StarHolonRecord[],
  options?: { max?: number }
): HolonSuggestion[] {
  const max = options?.max ?? 15;
  if (holons.length === 0) return [];

  const terms = tokenize(idea);
  const scored: HolonSuggestion[] = [];

  if (terms.length > 0) {
    for (const holon of holons) {
      const corpus = corpusForHolon(holon);
      const matchedTerms: string[] = [];
      let score = 0;
      for (const t of terms) {
        if (corpus.includes(t)) {
          score += t.length >= 5 ? 4 : t.length >= 4 ? 3 : 2;
          if (matchedTerms.length < 6) matchedTerms.push(t);
        }
      }
      if (score > 0) scored.push({ holon, score, matchedTerms });
    }
  }

  if (scored.length === 0) {
    const templates = holons.filter(
      (h) => h.metaData?.catalogSource === CATALOG_SOURCE_OAPP_TEMPLATE
    );
    const pool = templates.length > 0 ? templates : holons;
    const slice = pool.slice(0, Math.min(max, pool.length));
    return slice.map((holon) => ({ holon, score: 0, matchedTerms: [] as string[] }));
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const an = a.holon.name ?? '';
    const bn = b.holon.name ?? '';
    return bn.localeCompare(an);
  });

  return scored.slice(0, max);
}
