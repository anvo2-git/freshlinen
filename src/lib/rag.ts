import fs from "fs";
import path from "path";

export interface RagDocument {
  doc_id: string;
  source_type: string;
  brand: string;
  name: string;
  url: string;
  official_url?: string;
  rating_value?: string;
  rating_count?: string;
  accords?: string[];
  notes?: string[];
  release_signal?: string;
  text: string;
}

export interface RagResult {
  doc_id: string;
  source_type: string;
  brand: string;
  name: string;
  url: string;
  official_url: string;
  rating_value: string;
  rating_count: string;
  accords: string[];
  notes: string[];
  release_signal: string;
  text: string;
  score: number;
  matched_terms: string[];
  snippet: string;
  quality_score: number;
}

export interface RagQueryResponse {
  query: string;
  limit: number;
  corpus_size: number;
  indexed_size: number;
  results: RagResult[];
}

interface IndexedDocument {
  doc: RagDocument;
  searchText: string;
  titleText: string;
  noteText: string;
  qualityScore: number;
}

interface QueryIntent {
  isComparison: boolean;
  isAlternative: boolean;
  isExactLookup: boolean;
  isNegative: boolean;
  parts: string[];
}

type RankingPreference = "balanced" | "popular" | "niche";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "best",
  "but",
  "for",
  "from",
  "give",
  "how",
  "i",
  "is",
  "it",
  "like",
  "more",
  "new",
  "of",
  "on",
  "or",
  "show",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "which",
  "with",
  "want",
  "wanting",
]);

let cache: {
  docs: RagDocument[];
  indexed: IndexedDocument[];
  corpusMtimeMs: number;
} | null = null;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function qualityScore(doc: RagDocument): number {
  let score = 0;
  if (doc.source_type === "official_enrichment") score += 6;
  if (doc.official_url) score += 2;
  if (doc.rating_value) score += 1;
  if (doc.rating_count) score += 1;
  if ((doc.accords?.length ?? 0) > 0) score += 2;
  if ((doc.notes?.length ?? 0) > 0) score += 2;
  if (doc.release_signal) score += 1;
  if (doc.text.length > 500) score += 1;
  return score;
}

function popularityScore(doc: RagDocument): number {
  const ratingValue = Number.parseFloat(doc.rating_value ?? "");
  const ratingCount = Number.parseFloat(doc.rating_count ?? "");
  const rating = Number.isFinite(ratingValue) ? Math.max(0, Math.min(ratingValue, 5)) / 5 : 0;
  const count = Number.isFinite(ratingCount) ? Math.min(1, Math.log1p(Math.max(0, ratingCount)) / 10) : 0;
  return rating * 0.6 + count * 0.4;
}

function buildIndexedDocument(doc: RagDocument): IndexedDocument {
  const accords = parseList(doc.accords);
  const notes = parseList(doc.notes);
  const searchText = normalize(
    [
      doc.brand,
      doc.name,
      doc.official_url ?? "",
      doc.source_type,
      doc.rating_value ?? "",
      doc.rating_count ?? "",
      doc.release_signal ?? "",
      accords.join(" "),
      notes.join(" "),
      doc.text,
    ].join(" ")
  );
  const titleText = normalize([doc.brand, doc.name].join(" "));
  const noteText = normalize([...accords, ...notes].join(" "));
  return {
    doc,
    searchText,
    titleText,
    noteText,
    qualityScore: qualityScore(doc),
  };
}

function loadCorpus(): { docs: RagDocument[]; indexed: IndexedDocument[] } {
  const corpusPath = path.join(process.cwd(), "data", "rag", "perfume-documents.jsonl");
  if (!fs.existsSync(corpusPath)) {
    cache = { docs: [], indexed: [], corpusMtimeMs: 0 };
    return cache;
  }

  const corpusMtimeMs = fs.statSync(corpusPath).mtimeMs;
  if (cache && cache.corpusMtimeMs === corpusMtimeMs) {
    return cache;
  }

  const docs: RagDocument[] = [];
  const indexed: IndexedDocument[] = [];
  const lines = fs.readFileSync(corpusPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<RagDocument>;
      if (!parsed.doc_id || !parsed.brand || !parsed.name || !parsed.url || !parsed.text) continue;
      const doc: RagDocument = {
        doc_id: String(parsed.doc_id),
        source_type: String(parsed.source_type ?? ""),
        brand: String(parsed.brand),
        name: String(parsed.name),
        url: String(parsed.url),
        official_url: parsed.official_url ? String(parsed.official_url) : "",
        rating_value: parsed.rating_value ? String(parsed.rating_value) : "",
        rating_count: parsed.rating_count ? String(parsed.rating_count) : "",
        accords: parseList(parsed.accords),
        notes: parseList(parsed.notes),
        release_signal: parsed.release_signal ? String(parsed.release_signal) : "",
        text: String(parsed.text),
      };
      docs.push(doc);
      indexed.push(buildIndexedDocument(doc));
    } catch {
      // Skip malformed rows and keep the first-pass index resilient.
    }
  }

  cache = { docs, indexed, corpusMtimeMs };
  return cache;
}

function buildSnippet(text: string, terms: string[], fallback: string): string {
  if (!text.trim()) return fallback;
  const lower = text.toLowerCase();
  let hitIndex = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (hitIndex < 0 || idx < hitIndex)) {
      hitIndex = idx;
    }
  }
  if (hitIndex < 0) {
    return text.length > 220 ? `${text.slice(0, 220).trim()}…` : text.trim();
  }
  const start = Math.max(0, hitIndex - 90);
  const end = Math.min(text.length, hitIndex + 170);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function parseQueryIntent(query: string): QueryIntent {
  const normalized = normalize(query);
  const isComparison =
    /\bvs\b/.test(normalized) ||
    /\bversus\b/.test(normalized) ||
    /\bcompare\b/.test(normalized);
  const isAlternative =
    /\balternatives?\b/.test(normalized) ||
    /\bsimilar to\b/.test(normalized) ||
    /\blike\b/.test(normalized);
  const isNegative =
    /\bbest perfume ever\b/.test(normalized) ||
    /\bimpossible\b/.test(normalized) ||
    /\bconflicting\b/.test(normalized);
  const isExactLookup = !isComparison && !isAlternative && tokenize(query).length <= 3;
  const parts = isComparison
    ? normalized
        .split(/\b(?:vs|versus|compare)\b/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [normalized];

  return {
    isComparison,
    isAlternative,
    isExactLookup,
    isNegative,
    parts,
  };
}

function splitQueryParts(query: string): string[] {
  return normalize(query)
    .split(/\b(?:vs|versus|compare)\b/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function queryRag(
  query: string,
  limit = 5,
  options: { rankingPreference?: RankingPreference } = {}
): RagQueryResponse {
  const { docs, indexed } = loadCorpus();
  const normalizedQuery = normalize(query);
  const terms = uniq(tokenize(query));
  const intent = parseQueryIntent(query);
  const rankingPreference = options.rankingPreference ?? "balanced";
  const maxResults = Math.max(1, Math.min(limit, 20));

  if (!normalizedQuery || terms.length === 0) {
    return {
      query,
      limit: maxResults,
      corpus_size: docs.length,
      indexed_size: indexed.length,
      results: [],
    };
  }

  const scoredResults = indexed
    .map((entry) => {
      let score = 0;
      const matchedTerms: string[] = [];
      const comparisonPartHits: number[] = [];

      for (const term of terms) {
        let hit = false;

        if (entry.titleText.includes(term)) {
          score += 12;
          hit = true;
        }
        if ((entry.doc.brand || "").toLowerCase().includes(term)) {
          score += 8;
          hit = true;
        }
        if ((entry.doc.name || "").toLowerCase().includes(term)) {
          score += 12;
          hit = true;
        }
        if (entry.noteText.includes(term)) {
          score += 6;
          hit = true;
        }
        if (entry.searchText.includes(term)) {
          score += 3;
          hit = true;
        }
        if ((entry.doc.release_signal || "").toLowerCase().includes(term)) {
          score += 1;
          hit = true;
        }

        if (hit) matchedTerms.push(term);
      }

      if (entry.titleText.includes(normalizedQuery)) {
        score += 20;
      }
      if (entry.searchText.includes(normalizedQuery)) {
        score += 10;
      }

      if (intent.isComparison) {
        const queryParts = splitQueryParts(query);
        queryParts.forEach((part, partIndex) => {
          const partTerms = uniq(tokenize(part));
          if (part && entry.searchText.includes(part)) {
            score += 28;
            comparisonPartHits.push(partIndex);
          }
          if (partTerms.every((term) => entry.searchText.includes(term))) {
            score += 10;
            matchedTerms.push(...partTerms);
            comparisonPartHits.push(partIndex);
          }
          if (normalize(entry.titleText).includes(part)) {
            score += 18;
            comparisonPartHits.push(partIndex);
          }
          if (partTerms.some((term) => entry.titleText.includes(term))) {
            score += 6;
          }
        });

        const lowerName = entry.titleText;
        const strongBrandNameHit =
          queryParts.some((part) => lowerName.includes(normalize(part))) ||
          queryParts.some((part) => entry.searchText.includes(normalize(part)));
        if (strongBrandNameHit) {
          score += 12;
        }
      }

      if (intent.isAlternative) {
        score += 4;
      }
      if (intent.isExactLookup) {
        score += 2;
      }
      if (intent.isNegative) {
        score -= 2;
      }

      const coverage = matchedTerms.length / terms.length;
      score += coverage * 20;
      score += entry.qualityScore * 0.75;

      const popularity = popularityScore(entry.doc);
      if (rankingPreference === "popular") {
        score += popularity * 16;
      } else if (rankingPreference === "niche") {
        score += (1 - popularity) * 12;
      }

      return {
        doc: entry.doc,
        score,
        matchedTerms: uniq(matchedTerms),
        qualityScore: entry.qualityScore,
        comparisonPartHits: uniq(comparisonPartHits),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedTerms.length !== a.matchedTerms.length) {
        return b.matchedTerms.length - a.matchedTerms.length;
      }
      return b.qualityScore - a.qualityScore;
    })
    .map(({ doc, score, matchedTerms, qualityScore, comparisonPartHits }) => ({
      doc_id: doc.doc_id,
      source_type: doc.source_type,
      brand: doc.brand,
      name: doc.name,
      url: doc.url,
      official_url: doc.official_url ?? "",
      rating_value: doc.rating_value ?? "",
      rating_count: doc.rating_count ?? "",
      accords: doc.accords ?? [],
      notes: doc.notes ?? [],
      release_signal: doc.release_signal ?? "",
      text: doc.text,
      score: Number(score.toFixed(2)),
      matched_terms: matchedTerms,
      snippet: buildSnippet(
        doc.text,
        matchedTerms.length > 0 ? matchedTerms : terms,
        `${doc.brand} - ${doc.name}`
      ),
      quality_score: qualityScore,
      comparison_part_hits: comparisonPartHits,
    }));

  let results = scoredResults;
  if (intent.isComparison && intent.parts.length > 1) {
    const prioritized: typeof scoredResults = [];
    const used = new Set<string>();

    for (let partIndex = 0; partIndex < intent.parts.length; partIndex += 1) {
      const candidate = scoredResults.find(
        (row) => row.comparison_part_hits.includes(partIndex) && !used.has(row.doc_id)
      );
      if (candidate) {
        prioritized.push(candidate);
        used.add(candidate.doc_id);
      }
    }

    prioritized.push(...scoredResults.filter((row) => !used.has(row.doc_id)));
    results = prioritized;
  }

  results = results.slice(0, maxResults);

  return {
    query,
    limit: maxResults,
    corpus_size: docs.length,
    indexed_size: indexed.length,
    results,
  };
}
