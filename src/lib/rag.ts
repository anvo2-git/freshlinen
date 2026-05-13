import fs from "fs";
import path from "path";
import Fuse from "fuse.js";

const GENDER_SUFFIXES = ["for women and men", "for women", "for men"];

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
  rationale: string;
  comparison_part_hits?: number[];
}

export interface RagQueryResponse {
  query: string;
  limit: number;
  corpus_size: number;
  indexed_size: number;
  intent: string;
  answer: string;
  results: RagResult[];
}

interface IndexedDocument {
  doc: RagDocument;
  searchText: string;
  searchTokens: string[];
  titleText: string;
  titleTokens: string[];
  noteText: string;
  noteTokens: string[];
  brandTokens: string[];
  canonicalNameText: string;
  canonicalNameTokens: string[];
  qualityScore: number;
}

interface QueryIntent {
  isComparison: boolean;
  isAlternative: boolean;
  isExactLookup: boolean;
  isNegative: boolean;
  parts: string[];
}

interface ScoredCandidate {
  doc: RagDocument;
  score: number;
  tokenScore: number;
  fuzzyScore: number;
  matchedTerms: string[];
  qualityScore: number;
  comparisonPartHits: number[];
}

function buildRationale(doc: RagDocument, matchedTerms: string[], fuzzyScore: number, query: string, intent: QueryIntent): string {
  const reasons: string[] = [];
  if (matchedTerms.length > 0) {
    reasons.push(`matched: ${matchedTerms.slice(0, 4).join(", ")}`);
  }
  if (doc.source_type === "official_enrichment") {
    reasons.push("official product record");
  }
  if ((doc.accords?.length ?? 0) > 0) {
    reasons.push(`accords: ${(doc.accords || []).slice(0, 3).join(", ")}`);
  }
  if ((doc.notes?.length ?? 0) > 0) {
    reasons.push(`notes: ${(doc.notes || []).slice(0, 4).join(", ")}`);
  }
  if (fuzzyScore > 0) {
    reasons.push(`semantic boost for "${query.trim()}"`);
  }
  if (intent.isComparison) {
    reasons.push("comparison target");
  }
  return reasons.length > 0 ? reasons.join(" · ") : "corpus-backed match";
}

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
  fuse: Fuse<IndexedDocument>;
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

function canonicalizeBrand(value: string): string {
  return normalize(value);
}

function canonicalizeName(name: string, brand = ""): string {
  let value = normalize(name);
  for (const suffix of GENDER_SUFFIXES) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length).trim();
    }
  }

  const normalizedBrand = canonicalizeBrand(brand);
  if (normalizedBrand) {
    if (value.endsWith(normalizedBrand)) {
      value = value.slice(0, -normalizedBrand.length).trim();
    }
    if (value.startsWith(`${normalizedBrand} `)) {
      value = value.slice(normalizedBrand.length).trim();
    }
  }

  return value.trim();
}

function tokenContains(tokens: string[], term: string): boolean {
  return tokens.includes(term);
}

function tokenSuffixMatch(tokens: string[], suffixTokens: string[]): boolean {
  if (suffixTokens.length === 0 || suffixTokens.length > tokens.length) return false;
  const offset = tokens.length - suffixTokens.length;
  for (let i = 0; i < suffixTokens.length; i += 1) {
    if (tokens[offset + i] !== suffixTokens[i]) return false;
  }
  return true;
}

function canonicalOverlapScore(sourceTokens: string[], queryTokens: string[]): { score: number; overlap: number } {
  const overlap = queryTokens.reduce((count, token) => count + (tokenContains(sourceTokens, token) ? 1 : 0), 0);
  let score = overlap * 18;
  if (overlap > 0) {
    if (overlap === queryTokens.length) {
      score += 28;
    }
    if (queryTokens.length <= sourceTokens.length && tokenSuffixMatch(sourceTokens, queryTokens)) {
      score += 24;
    }
    if (queryTokens.length < sourceTokens.length && overlap === queryTokens.length) {
      score -= 8;
    }
  }
  return { score, overlap };
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

function buildFuseIndex(indexed: IndexedDocument[]): Fuse<IndexedDocument> {
  return new Fuse(indexed, {
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
    threshold: 0.38,
    keys: [
      { name: "canonicalNameText", weight: 0.38 },
      { name: "titleText", weight: 0.24 },
      { name: "noteText", weight: 0.2 },
      { name: "searchText", weight: 0.18 },
    ],
  });
}

function buildIndexedDocument(doc: RagDocument): IndexedDocument {
  const accords = parseList(doc.accords);
  const notes = parseList(doc.notes);
  const canonicalNameText = canonicalizeName(doc.name, doc.brand);
  const brandTokens = tokenize(doc.brand);
  const canonicalNameTokens = tokenize(canonicalNameText);
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
  const searchTokens = tokenize(searchText);
  const titleText = normalize([doc.brand, canonicalNameText].join(" "));
  const titleTokens = tokenize(titleText);
  const noteText = normalize([...accords, ...notes].join(" "));
  const noteTokens = tokenize(noteText);
  return {
    doc,
    searchText,
    searchTokens,
    titleText,
    titleTokens,
    noteText,
    noteTokens,
    brandTokens,
    canonicalNameText,
    canonicalNameTokens,
    qualityScore: qualityScore(doc),
  };
}

function loadCorpus(): { docs: RagDocument[]; indexed: IndexedDocument[]; fuse: Fuse<IndexedDocument> } {
  const corpusPath = path.join(process.cwd(), "data", "rag", "perfume-documents.jsonl");
  if (!fs.existsSync(corpusPath)) {
    cache = { docs: [], indexed: [], fuse: buildFuseIndex([]), corpusMtimeMs: 0 };
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

  cache = { docs, indexed, fuse: buildFuseIndex(indexed), corpusMtimeMs };
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

function summarizeAccords(result: RagResult): string[] {
  return (result.accords || []).slice(0, 3);
}

function summarizeNotes(result: RagResult): string[] {
  return (result.notes || []).slice(0, 4);
}

function describeTopResult(result: RagResult): string {
  const parts: string[] = [];
  const accords = summarizeAccords(result);
  const notes = summarizeNotes(result);
  if (accords.length > 0) {
    parts.push(`accords: ${accords.join(", ")}`);
  }
  if (notes.length > 0) {
    parts.push(`notes: ${notes.join(", ")}`);
  }
  if (result.release_signal) {
    parts.push(result.release_signal);
  }
  return parts.join(" · ");
}

function buildAnswer(query: string, intent: QueryIntent, results: RagResult[]): string {
  if (results.length === 0) {
    return "No strong matches surfaced. Try a perfume name, a few notes, or a narrower vibe.";
  }

  const top = results.slice(0, 3);
  const topNames = top.map((item) => `${item.brand} ${item.name}`.trim());

  if (intent.isComparison && top.length >= 2) {
    const [left, right] = top;
    const leftSummary = describeTopResult(left) || "a canonical match";
    const rightSummary = describeTopResult(right) || "a nearby alternative";
    return `${left.brand} ${left.name} and ${right.brand} ${right.name} are the clearest comparison anchors here. ${leftSummary}. ${rightSummary}.`;
  }

  if (intent.isExactLookup) {
    const topResult = top[0];
    return `Best match: ${topResult.brand} ${topResult.name}. ${describeTopResult(topResult) || "This looks like the canonical perfume record."}`;
  }

  if (intent.isAlternative) {
    return `Closest alternatives: ${topNames.join("; ")}. These are the nearest corpus-backed matches to the seed perfume or vibe.`;
  }

  const names = top.map((item) => `${item.brand} ${item.name}`.trim());
  return `Top matches: ${names.join("; ")}. The ranking favors perfumes whose notes, accords, and product names overlap the query.`;
}

export function queryRag(query: string, limit = 5): RagQueryResponse {
  const { docs, indexed, fuse } = loadCorpus();
  const normalizedQuery = normalize(query);
  const terms = uniq(tokenize(query));
  const intent = parseQueryIntent(query);
  const queryTokens = tokenize(query);
  const maxResults = Math.max(1, Math.min(limit, 20));

  if (!normalizedQuery || terms.length === 0) {
    return {
      query,
      limit: maxResults,
      corpus_size: docs.length,
      indexed_size: indexed.length,
      intent: "unknown",
      answer: "No strong matches surfaced. Try a perfume name, a few notes, or a narrower vibe.",
      results: [],
    };
  }

  const fuzzyBoosts = new Map<string, { score: number; rank: number }>();
  const fuseMatches = fuse.search(query).slice(0, 160);
  for (let i = 0; i < fuseMatches.length; i += 1) {
    const hit = fuseMatches[i];
    const score = typeof hit.score === "number" ? Math.max(0, 1 - hit.score) * 35 : 0;
    const key = hit.item.doc.doc_id;
    const current = fuzzyBoosts.get(key);
    const rankBoost = Math.max(0, 16 - i * 0.09);
    const combined = score + rankBoost;
    if (!current || combined > current.score) {
      fuzzyBoosts.set(key, { score: combined, rank: i + 1 });
    }
  }

  for (const part of intent.parts) {
    const partHits = fuse.search(part).slice(0, 80);
    for (let i = 0; i < partHits.length; i += 1) {
      const hit = partHits[i];
      const score = typeof hit.score === "number" ? Math.max(0, 1 - hit.score) * 20 : 0;
      const key = hit.item.doc.doc_id;
      const current = fuzzyBoosts.get(key);
      const rankBoost = Math.max(0, 10 - i * 0.08);
      const combined = score + rankBoost;
      if (!current || combined > current.score) {
        fuzzyBoosts.set(key, { score: combined, rank: i + 1 });
      }
    }
  }

  const scoredResults: ScoredCandidate[] = indexed
    .map((entry) => {
      let score = 0;
      const fuzzyScore = fuzzyBoosts.get(entry.doc.doc_id)?.score ?? 0;
      const matchedTerms: string[] = [];
      const comparisonPartHits: number[] = [];

      for (const term of terms) {
        let hit = false;

        if (tokenContains(entry.titleTokens, term) || tokenContains(entry.canonicalNameTokens, term)) {
          score += 12;
          hit = true;
        }
        if (tokenContains(entry.brandTokens, term)) {
          score += 8;
          hit = true;
        }
        if (tokenContains(entry.canonicalNameTokens, term) || tokenContains(entry.searchTokens, term)) {
          score += 12;
          hit = true;
        }
        if (tokenContains(entry.noteTokens, term)) {
          score += 6;
          hit = true;
        }
        if (tokenContains(entry.searchTokens, term)) {
          score += 3;
          hit = true;
        }
        if (tokenize(entry.doc.release_signal || "").includes(term)) {
          score += 1;
          hit = true;
        }

        if (hit) matchedTerms.push(term);
      }

      if (queryTokens.length > 0 && tokenSuffixMatch(queryTokens, entry.canonicalNameTokens)) {
        score += queryTokens.length === entry.canonicalNameTokens.length ? 120 : 90;
      } else if (queryTokens.length > 0 && tokenSuffixMatch(queryTokens, entry.titleTokens)) {
        score += 60;
      }

      if (intent.isExactLookup && tokenSuffixMatch(queryTokens, entry.canonicalNameTokens)) {
        score += 80;
      }
      if (intent.isExactLookup && queryTokens.length < entry.canonicalNameTokens.length) {
        score -= 12;
      }

      if (normalizedQuery && entry.titleText === normalizedQuery) {
        score += 20;
      }
      if (normalizedQuery && entry.searchText.includes(normalizedQuery)) {
        score += 10;
      }

      if (intent.isExactLookup) {
        const exactScore = canonicalOverlapScore(entry.canonicalNameTokens, queryTokens);
        if (exactScore.overlap === 0) {
          score -= 30;
        } else {
          score += exactScore.score + exactScore.overlap * 10;
          if (exactScore.overlap === queryTokens.length && queryTokens.length <= 3) {
            score += 20;
          }
        }
      }

      if (intent.isComparison) {
        const queryParts = splitQueryParts(query);
        queryParts.forEach((part, partIndex) => {
          const partTerms = uniq(tokenize(part));
          if (partTerms.length > 0) {
            const partScore = canonicalOverlapScore(entry.canonicalNameTokens, partTerms);
            if (partScore.overlap > 0) {
              score += partScore.score;
            }
            if (partScore.overlap === partTerms.length) {
              comparisonPartHits.push(partIndex);
              matchedTerms.push(...partTerms);
            }
          }
          if (partTerms.some((term) => tokenContains(entry.titleTokens, term))) {
            score += 6;
          }
        });

        const strongBrandNameHit =
          queryParts.some((part) => canonicalOverlapScore(entry.canonicalNameTokens, uniq(tokenize(part))).overlap > 0);
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
      score += fuzzyScore;

      return {
        doc: entry.doc,
        score,
        fuzzyScore,
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
    .map(({ doc, score, fuzzyScore, matchedTerms, qualityScore, comparisonPartHits }) => ({
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
      rationale: buildRationale(doc, matchedTerms, fuzzyScore, query, intent),
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

  const answer = buildAnswer(query, intent, results);

  return {
    query,
    limit: maxResults,
    corpus_size: docs.length,
    indexed_size: indexed.length,
    intent: intent.isComparison
      ? "comparison"
      : intent.isAlternative
        ? "alternative"
        : intent.isExactLookup
          ? "exact_lookup"
          : intent.isNegative
            ? "negative"
            : "vibe_search",
    answer,
    results,
  };
}
