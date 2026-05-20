import fs from "fs";
import path from "path";
import Fuse from "fuse.js";
import { buildSemanticQuerySignal } from "./rag-semantic.mjs";
import { CONCEPT_SPECIFICITY } from "./rag-taxonomy.mjs";
import { cleanPerfumeSnippet, displayPerfumeText, displayPerfumeTitle } from "./perfume-display";
import type { Perfume } from "./types";

const GENDER_SUFFIXES = ["for women and men", "for men and women", "for women", "for men"];

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
  semantic_matches?: string[];
}

export type RagSuggestedPrompt = {
  label: string;
  description: string;
  query: string;
  family: string;
};

export interface RagQueryResponse {
  query: string;
  limit: number;
  corpus_size: number;
  indexed_size: number;
  intent: string;
  answer: string;
  beginner_hint: string;
  matched_concepts: string[];
  suggested_prompts: RagSuggestedPrompt[];
  blend_query?: {
    reference_text: string;
    modifier_text: string;
  } | null;
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
  releaseSignalTokens: string[];
  qualityScore: number;
}

interface CorpusCache {
  docs: RagDocument[];
  indexed: IndexedDocument[];
  fuse: Fuse<IndexedDocument>;
  tokenIndex: Map<string, number[]>;
  corpusMtimeMs: number;
}

interface PublicCatalogCache {
  perfumes: Perfume[];
  mtimeMs: number;
}

export interface RagContextOptions {
  seedIds?: number[];
  favoriteIds?: number[];
  includeFavorites?: boolean;
  seedPerfumes?: Perfume[];
  favoritePerfumes?: Perfume[];
  rankingPreference?: "balanced" | "popular" | "niche";
}

interface QueryIntent {
  isComparison: boolean;
  isAlternative: boolean;
  isExactLookup: boolean;
  isNegative: boolean;
  parts: string[];
}

interface BlendQuery {
  referenceText: string;
  modifierText: string;
  terms: string[];
}

function buildRationale(
  doc: RagDocument,
  matchedTerms: string[],
  semanticMatches: string[],
  fuzzyScore: number,
  query: string,
  intent: QueryIntent
): string {
  const reasons: string[] = [];
  if (matchedTerms.length > 0) {
    reasons.push(`matched: ${matchedTerms.slice(0, 4).join(", ")}`);
  }
  if (semanticMatches.length > 0) {
    reasons.push(`semantic: ${semanticMatches.slice(0, 3).join(", ")}`);
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
  "easy",
  "for",
  "from",
  "give",
  "how",
  "i",
  "is",
  "it",
  "like",
  "looking",
  "more",
  "nice",
  "new",
  "of",
  "on",
  "or",
  "perfume",
  "fragrance",
  "scent",
  "smell",
  "show",
  "that",
  "the",
  "this",
  "something",
  "style",
  "wear",
  "wearable",
  "to",
  "what",
  "when",
  "which",
  "with",
  "want",
  "wanting",
  "good",
  "pretty",
  "please",
  "vibe",
]);

let cache: CorpusCache | null = null;
let publicCatalogCache: PublicCatalogCache | null = null;

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

function uniqByDocId(entries: IndexedDocument[]): IndexedDocument[] {
  const seen = new Set<string>();
  const deduped: IndexedDocument[] = [];
  for (const entry of entries) {
    if (seen.has(entry.doc.doc_id)) continue;
    seen.add(entry.doc.doc_id);
    deduped.push(entry);
  }
  return deduped;
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
  const ratingCount = Number.parseInt((doc.rating_count ?? "").replace(/,/g, ""), 10);
  const valueSignal = Number.isFinite(ratingValue) ? Math.max(0, Math.min(ratingValue, 5)) / 5 : 0;
  const countSignal = Number.isFinite(ratingCount) ? Math.min(1, Math.log1p(Math.max(0, ratingCount)) / 10) : 0;
  return valueSignal * 0.55 + countSignal * 0.45;
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
  const releaseSignalTokens = tokenize(doc.release_signal || "");
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
    releaseSignalTokens,
    qualityScore: qualityScore(doc),
  };
}

function buildTokenIndex(indexed: IndexedDocument[]): Map<string, number[]> {
  const tokenIndex = new Map<string, number[]>();
  indexed.forEach((entry, index) => {
    const tokens = new Set<string>([
      ...entry.searchTokens,
      ...entry.titleTokens,
      ...entry.noteTokens,
      ...entry.brandTokens,
      ...entry.canonicalNameTokens,
      ...entry.releaseSignalTokens,
    ]);
    for (const token of tokens) {
      const bucket = tokenIndex.get(token);
      if (bucket) {
        bucket.push(index);
      } else {
        tokenIndex.set(token, [index]);
      }
    }
  });
  return tokenIndex;
}

function loadCorpus(): CorpusCache {
  const corpusPath = path.join(process.cwd(), "data", "rag", "perfume-documents.jsonl");
  if (!fs.existsSync(corpusPath)) {
    cache = { docs: [], indexed: [], fuse: buildFuseIndex([]), tokenIndex: new Map(), corpusMtimeMs: 0 };
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

  cache = {
    docs,
    indexed,
    fuse: buildFuseIndex(indexed),
    tokenIndex: buildTokenIndex(indexed),
    corpusMtimeMs,
  };
  return cache;
}

function loadPublicCatalog(): Perfume[] {
  const catalogPath = path.join(process.cwd(), "public", "data", "perfumes.json");
  if (!fs.existsSync(catalogPath)) {
    publicCatalogCache = { perfumes: [], mtimeMs: 0 };
    return [];
  }

  const mtimeMs = fs.statSync(catalogPath).mtimeMs;
  if (publicCatalogCache && publicCatalogCache.mtimeMs === mtimeMs) {
    return publicCatalogCache.perfumes;
  }

  try {
    const perfumes = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as Perfume[];
    publicCatalogCache = { perfumes, mtimeMs };
    return perfumes;
  } catch {
    publicCatalogCache = { perfumes: [], mtimeMs };
    return [];
  }
}

function resolveContextPerfumes(options: RagContextOptions = {}): Perfume[] {
  const catalog = loadPublicCatalog();
  const seen = new Set<number>();
  const perfumes: Perfume[] = [];

  const appendPerfumes = (items: Perfume[] | undefined) => {
    for (const perfume of items ?? []) {
      if (!Number.isFinite(perfume.id) || seen.has(perfume.id)) continue;
      seen.add(perfume.id);
      perfumes.push(perfume);
    }
  };

  appendPerfumes(options.seedPerfumes);
  if (options.includeFavorites) {
    appendPerfumes(options.favoritePerfumes);
  }

  const ids = [...(options.seedIds ?? [])];
  if (options.includeFavorites) {
    ids.push(...(options.favoriteIds ?? []));
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const perfume = catalog[id];
    if (perfume) perfumes.push(perfume);
  }
  return perfumes;
}

function buildAverageAccordProfile(perfumes: Perfume[]): Record<string, number> {
  const totals: Record<string, number> = {};
  if (perfumes.length === 0) return totals;

  for (const perfume of perfumes) {
    for (const [accord, weight] of Object.entries(perfume.aw)) {
      totals[accord] = (totals[accord] ?? 0) + weight;
    }
  }

  for (const [accord, total] of Object.entries(totals)) {
    totals[accord] = total / perfumes.length;
  }

  return totals;
}

function topContextAccords(perfumes: Perfume[], limit = 8): string[] {
  const profile = buildAverageAccordProfile(perfumes);
  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([accord]) => accord);
}

function buildSnippet(text: string, terms: string[], fallback: string, brand = "", name = ""): string {
  const content = cleanPerfumeSnippet(text, brand, name) || displayPerfumeText(text);
  if (!content) return fallback;
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulLines = lines.filter((line) => !/^(official product|brand|gender|main accords|notes|description|top notes|middle notes|base notes):/i.test(line));
  const contentLines = meaningfulLines.length > 0 ? meaningfulLines : lines;

  if (contentLines.length > 1) {
    const lowerLines = contentLines.map((line) => line.toLowerCase());
    let hitLine = -1;
    for (const term of terms) {
      const idx = lowerLines.findIndex((line) => line.includes(term));
      if (idx >= 0 && (hitLine < 0 || idx < hitLine)) {
        hitLine = idx;
      }
    }

    const start = hitLine >= 0 ? Math.max(0, hitLine - 1) : 0;
    const end = hitLine >= 0 ? Math.min(contentLines.length, hitLine + 2) : Math.min(contentLines.length, 3);
    const excerpt = contentLines.slice(start, end).join(" · ");
    return excerpt.length > 260 ? excerpt.slice(0, 260).trim() : excerpt;
  }

  const lower = content.toLowerCase();
  let hitIndex = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (hitIndex < 0 || idx < hitIndex)) {
      hitIndex = idx;
    }
  }
  if (hitIndex < 0) {
    return content.length > 220 ? content.slice(0, 220).trim() : content;
  }
  const start = Math.max(0, hitIndex - 90);
  const end = Math.min(content.length, hitIndex + 170);
  return content.slice(start, end).trim();
}

function parseQueryIntent(query: string): QueryIntent {
  const normalized = normalize(query);
  const rawTokenCount = tokenize(query).length;
  const hasStyleModifier =
    /\b(metallic|aldehydic|smoky|smoke|clean|fresh|sweet|woody|floral|iris|musky|skin-like|rainy|rain|soapy|incense|green|citrus|bright|powdery|amber|oud|leather|tobacco|patchouli|animalic|balsamic|gourmand|coconut|almond|lactonic|creamy|milky|buttery|aquatic|marine|ozonic|salty|mineral|watery|briny|oceanic|coastal|seawater|surf|tide|fruity|rose|spicy|earthy|aromatic|herbal|lavender|sage|rosemary|mint|thyme|basil|tea|vanilla)\b/.test(
      normalized
    );
  const likelyExact =
    rawTokenCount <= 2 ||
    (rawTokenCount <= 3 && (/[A-Z]/.test(query) || /\d/.test(query) || /['’]/.test(query)));
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
  const isExactLookup = !isComparison && !isAlternative && !isNegative && likelyExact && !hasStyleModifier;
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

function parseBlendQuery(query: string): BlendQuery | null {
  const normalized = normalize(query);
  const patterns = [
    /^.*?\b(?:smells?|smelling|smell)\s+like\s+(.+?)\s+(?:but\s+also\s+has|but\s+with|and\s+has|and\s+with|with)\s+(.+)$/i,
    /^.*?\b(?:like|similar to)\s+(.+?)\s+(?:but\s+also\s+has|but\s+with|and\s+has|and\s+with|with)\s+(.+)$/i,
    /^(.+?)\s+(?:but\s+also\s+has|but\s+with|and\s+has|and\s+with|with)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const referenceText = match[1].trim();
    const modifierText = match[2].trim();
    if (!referenceText || !modifierText) continue;
    return {
      referenceText,
      modifierText,
      terms: uniq([...tokenize(referenceText), ...tokenize(modifierText)]),
    };
  }

  return null;
}

function tokenOverlapScore(tokens: string[], term: string): boolean {
  return tokens.includes(term);
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

function buildAnswer(
  query: string,
  intent: QueryIntent,
  results: RagResult[],
  semantic: ReturnType<typeof buildSemanticQuerySignal>,
  blendQuery: BlendQuery | null
): string {
  if (results.length === 0) {
    return semantic.beginnerHint || "No strong matches surfaced. Try a perfume name, a few notes, or a narrower vibe.";
  }

  const top = results.slice(0, 3);
  const topNames = top.map((item) => `${displayPerfumeTitle(item.brand, item.name)}`.trim());
  const semanticLead = semantic.matchedConcepts.length > 0
    ? `I read this as ${semantic.matchedConcepts.slice(0, 3).map((concept) => concept.label).join(", ")}. `
    : "";

  if (blendQuery) {
    const [best, second] = top;
    const anchor = `${blendQuery.referenceText.trim()} + ${blendQuery.modifierText.trim()}`;
    const bestName = `${displayPerfumeTitle(best.brand, best.name)}`.trim();
    const secondName = second ? `${displayPerfumeTitle(second.brand, second.name)}`.trim() : "";
    const bestSummary = describeTopResult(best) || "closest corpus-backed blend";
    const secondSummary = second ? describeTopResult(second) : "";
    const parts = [
      `Closest match for ${anchor}: ${bestName}.`,
      `Anchor: ${blendQuery.referenceText.trim()}. Modifier: ${blendQuery.modifierText.trim()}.`,
      bestSummary ? `${bestSummary}.` : "",
      secondName ? `Next option: ${secondName}${secondSummary ? ` — ${secondSummary}.` : "."}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  }

  if (intent.isComparison && top.length >= 2) {
    const [left, right] = top;
    const leftSummary = describeTopResult(left) || "a canonical match";
    const rightSummary = describeTopResult(right) || "a nearby alternative";
    return `${semanticLead}${displayPerfumeTitle(left.brand, left.name)} and ${displayPerfumeTitle(right.brand, right.name)} are the clearest comparison anchors here. ${leftSummary}. ${rightSummary}.`;
  }

  if (intent.isExactLookup) {
    const topResult = top[0];
    return `Best match: ${displayPerfumeTitle(topResult.brand, topResult.name)}. ${describeTopResult(topResult) || "This looks like the canonical perfume record."}`;
  }

  if (intent.isAlternative) {
    return `${semanticLead}Closest alternatives: ${topNames.join("; ")}. These are the nearest corpus-backed matches to the seed perfume or vibe.`;
  }

  const names = top.map((item) => `${displayPerfumeTitle(item.brand, item.name)}`.trim());
  return `${semanticLead}Top matches: ${names.join("; ")}. The ranking favors perfumes whose notes, accords, and product names overlap the query.`;
}

function hasPhrase(tokens: string[], phrase: string): boolean {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0 || phraseTokens.length > tokens.length) return false;
  return phraseTokens.every((token) => tokens.includes(token));
}

function addCandidateScores(
  scores: Map<number, number>,
  tokenIndex: Map<string, number[]>,
  tokens: string[],
  weight: number
) {
  for (const token of tokens) {
    const hits = tokenIndex.get(token);
    if (!hits) continue;
    for (const index of hits) {
      scores.set(index, (scores.get(index) ?? 0) + weight);
    }
  }
}

function collectCandidateIndices(
  indexed: IndexedDocument[],
  tokenIndex: Map<string, number[]>,
  queryTokens: string[],
  intent: QueryIntent,
  semantic: ReturnType<typeof buildSemanticQuerySignal>
): number[] {
  const candidateScores = new Map<number, number>();
  addCandidateScores(candidateScores, tokenIndex, queryTokens, 4);

  for (const part of intent.parts) {
    addCandidateScores(candidateScores, tokenIndex, tokenize(part), 5);
  }

  addCandidateScores(candidateScores, tokenIndex, semantic.boostTerms, 2);

  for (const concept of semantic.matchedConcepts) {
    const conceptTokens = uniq(
      concept.docTerms.flatMap((term) => tokenize(term))
    );
    addCandidateScores(candidateScores, tokenIndex, conceptTokens, 3);
  }

  if (candidateScores.size === 0) {
    return [];
  }

  return Array.from(candidateScores.entries())
    .map(([index, score]) => ({
      index,
      score: score + indexed[index].qualityScore * 0.25,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .slice(0, 1600)
    .map(({ index }) => index);
}

export function queryRag(
  query: string,
  limit = 5,
  contextOptions: RagContextOptions = {}
): RagQueryResponse {
  const { docs, indexed, fuse, tokenIndex } = loadCorpus();
  const contextPerfumes = resolveContextPerfumes(contextOptions);
  const contextAccords = topContextAccords(contextPerfumes, contextPerfumes.length > 0 ? 8 : 0);
  const rankingPreference = contextOptions.rankingPreference ?? "balanced";
  const normalizedQuery = normalize(query);
  const terms = uniq(tokenize(query));
  const intent = parseQueryIntent(query);
  const semantic = buildSemanticQuerySignal(query);
  const guidanceMode = semantic.needsGuidance;
  const queryTokens = tokenize(query);
  const queryParts = intent.isComparison ? splitQueryParts(query) : [];
  const queryPartTokens = queryParts.map((part) => uniq(tokenize(part)));
  const maxResults = Math.max(1, Math.min(limit, 20));
  const blendQuery = parseBlendQuery(query);
  const blendMode = Boolean(blendQuery) || semantic.matchedConcepts.length > 1 || (queryTokens.includes("vanilla") && queryTokens.length > 1);
  const specificityMap = CONCEPT_SPECIFICITY as Record<string, number>;
  const blendReferenceTokens = blendQuery ? uniq(tokenize(blendQuery.referenceText)) : [];
  const blendModifierTokens = blendQuery ? uniq(tokenize(blendQuery.modifierText)) : [];
  const blendSemantic = blendQuery
    ? {
        reference: buildSemanticQuerySignal(blendQuery.referenceText),
        modifier: buildSemanticQuerySignal(blendQuery.modifierText),
      }
    : null;

  if (!normalizedQuery || terms.length === 0) {
    return {
      query,
      limit: maxResults,
      corpus_size: docs.length,
      indexed_size: indexed.length,
      intent: "unknown",
      answer: "No strong matches surfaced. Try a perfume name, a few notes, or a narrower vibe.",
      beginner_hint: semantic.beginnerHint,
      matched_concepts: semantic.matchedConcepts.map((concept) => concept.label),
      suggested_prompts: semantic.suggestedPrompts,
      results: [],
    };
  }

  const candidateIndices = collectCandidateIndices(indexed, tokenIndex, queryTokens, intent, semantic);
  const candidateIndexed =
    candidateIndices.length > 0
      ? candidateIndices.map((index) => indexed[index])
      : fuse.search(query).slice(0, 240).map((hit) => hit.item);
  const candidateDocsBase = candidateIndexed.length > 0 ? candidateIndexed : indexed.slice(0, 240);
  const blendReferenceDocs = blendQuery ? fuse.search(blendQuery.referenceText).slice(0, 10).map((hit) => hit.item) : [];
  const blendModifierDocs = blendQuery ? fuse.search(blendQuery.modifierText).slice(0, 10).map((hit) => hit.item) : [];
  const candidateDocs = blendQuery
    ? uniqByDocId([...candidateDocsBase, ...blendReferenceDocs, ...blendModifierDocs])
    : candidateDocsBase;
  const localFuse = buildFuseIndex(candidateDocs);
  const blendReferenceDocIds = new Set(blendReferenceDocs.map((entry) => entry.doc.doc_id));
  const blendReferenceSignatureTokens = uniq(
    blendReferenceDocs.flatMap((entry) =>
      uniq([
        ...entry.canonicalNameTokens,
        ...entry.titleTokens,
        ...entry.brandTokens,
        ...entry.noteTokens,
        ...entry.releaseSignalTokens,
        ...tokenize(entry.doc.release_signal ?? ""),
        ...(entry.doc.notes ?? []).flatMap((note) => tokenize(note)),
        ...(entry.doc.accords ?? []).flatMap((accord) => tokenize(accord)),
      ])
    )
  );

  const fuzzyBoosts = new Map<string, { score: number; rank: number }>();
  const fuseMatches = localFuse.search(query).slice(0, 48);
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
    const partHits = localFuse.search(part).slice(0, 24);
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

  const scoredResults = candidateDocs
    .map((entry) => {
      let score = 0;
      const fuzzyScore = fuzzyBoosts.get(entry.doc.doc_id)?.score ?? 0;
      const matchedTerms: string[] = [];
      const comparisonPartHits: number[] = [];
      const semanticMatches: string[] = [];
      let blendReferencePriority = 0;
      let blendReferenceWeight = 0;
      let blendModifierPriority = 0;
      let blendModifierWeight = 0;

      for (const term of terms) {
        let hit = false;

        if (tokenOverlapScore(entry.titleTokens, term) || tokenOverlapScore(entry.canonicalNameTokens, term)) {
          score += 12;
          hit = true;
        }
        if (tokenOverlapScore(entry.brandTokens, term)) {
          score += 8;
          hit = true;
        }
        if (tokenOverlapScore(entry.canonicalNameTokens, term) || tokenOverlapScore(entry.searchTokens, term)) {
          score += 12;
          hit = true;
        }
        if (tokenOverlapScore(entry.noteTokens, term)) {
          score += 6;
          hit = true;
        }
        if (tokenOverlapScore(entry.searchTokens, term)) {
          score += 3;
          hit = true;
        }
        if (tokenOverlapScore(entry.releaseSignalTokens, term)) {
          score += 1;
          hit = true;
        }

        if (hit) matchedTerms.push(term);
      }

      for (const term of semantic.boostTerms) {
        if (terms.includes(term)) continue;
        let hit = false;

        if (hasPhrase(entry.titleTokens, term) || hasPhrase(entry.canonicalNameTokens, term)) {
          score += guidanceMode ? 8 : 4;
          hit = true;
        }
        if (hasPhrase(entry.noteTokens, term)) {
          score += guidanceMode ? 6 : 3;
          hit = true;
        }
        if (hasPhrase(entry.searchTokens, term)) {
          score += guidanceMode ? 3 : 1.5;
          hit = true;
        }

        if (hit) {
          score += guidanceMode ? 2 : 0.5;
        }
      }

      for (const concept of semantic.matchedConcepts) {
        let conceptHit = false;
        let conceptScore = 0;
        let matchedConceptTerms = 0;

        for (const docTerm of concept.docTerms) {
          if (
            hasPhrase(entry.canonicalNameTokens, docTerm) ||
            hasPhrase(entry.titleTokens, docTerm) ||
            hasPhrase(entry.noteTokens, docTerm) ||
            hasPhrase(entry.searchTokens, docTerm)
          ) {
            conceptHit = true;
            matchedConceptTerms += 1;
            conceptScore += docTerm.includes(" ") ? 2.5 : 1.5;
          }
        }

        if (conceptHit) {
          const specificity = specificityMap[concept.key] ?? 0.5;
          let conceptBoost = Math.min(
            guidanceMode ? 24 : 10,
            (guidanceMode ? 10 : 4) + conceptScore + matchedConceptTerms * (guidanceMode ? 1.5 : 0.75)
          );
          if (blendMode) {
            if (specificity < 0.5) {
              conceptBoost *= guidanceMode ? 0.55 : 0.7;
            } else {
              conceptBoost *= guidanceMode ? 1.15 : 1.08;
            }
          }
          score += conceptBoost;
          semanticMatches.push(concept.label);
        }
      }

      if (blendMode && semantic.matchedConcepts.length > 0) {
        const matchedConceptCount = semantic.matchedConcepts.length;
        const hitCount = semanticMatches.length;
        const specificitySum = semantic.matchedConcepts.reduce((sum, concept) => {
          const specificity = specificityMap[concept.key] ?? 0.5;
          return sum + specificity;
        }, 0);
        const averageSpecificity = specificitySum / matchedConceptCount;

        if (hitCount === 0) {
          score -= guidanceMode ? 14 : 9;
        } else if (hitCount === 1) {
          score += averageSpecificity * (guidanceMode ? 4 : 2);
          if (averageSpecificity < 0.5) {
            score -= guidanceMode ? 8 : 5;
          }
        } else {
          score += hitCount * (guidanceMode ? 8 : 5);
          score += Math.min(18, specificitySum * (guidanceMode ? 6 : 4));
        }
      }

      if (contextAccords.length > 0) {
        let contextMatches = 0;
        for (const accord of contextAccords) {
          if (
            hasPhrase(entry.noteTokens, accord) ||
            hasPhrase(entry.searchTokens, accord) ||
            hasPhrase(entry.titleTokens, accord)
          ) {
            contextMatches += 1;
          }
        }
        if (contextMatches > 0) {
          score += contextMatches * (guidanceMode ? 4 : 2.5);
          if (guidanceMode) {
            score += Math.min(10, contextMatches * 1.5);
          }
        }
      }

      const metallicQuery = semantic.matchedConcepts.some((concept) =>
        /metallic|aldehydic/i.test(concept.label)
      );
      if (metallicQuery) {
        const metallicHit =
          hasPhrase(entry.noteTokens, "metallic") ||
          hasPhrase(entry.noteTokens, "aldehydic") ||
          hasPhrase(entry.noteTokens, "aldehydes") ||
          hasPhrase(entry.searchTokens, "metallic") ||
          hasPhrase(entry.searchTokens, "aldehydic") ||
          hasPhrase(entry.searchTokens, "aldehydes") ||
          hasPhrase(entry.titleTokens, "metallic") ||
          hasPhrase(entry.titleTokens, "aldehydic") ||
          hasPhrase(entry.titleTokens, "aldehydes");

        if (metallicHit) {
          score += guidanceMode ? 12 : 8;
        } else {
          score -= guidanceMode ? 18 : 10;
        }
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
        queryPartTokens.forEach((partTerms, partIndex) => {
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
          queryPartTokens.some((partTerms) => canonicalOverlapScore(entry.canonicalNameTokens, partTerms).overlap > 0);
        if (strongBrandNameHit) {
          score += 12;
        }
      }

      if (blendSemantic) {
        const referenceScore = canonicalOverlapScore(entry.canonicalNameTokens, blendReferenceTokens);
        const modifierScore = canonicalOverlapScore(entry.canonicalNameTokens, blendModifierTokens);
        const signatureScore = canonicalOverlapScore([...entry.titleTokens, ...entry.noteTokens, ...entry.searchTokens], blendReferenceSignatureTokens);
        const exactReferenceHit = blendReferenceDocIds.has(entry.doc.doc_id);
        let referenceBoost = 0;
        let modifierBoost = 0;

        if (blendSemantic.reference.matchedConcepts.length > 0 || blendReferenceTokens.length > 0) {
          if (referenceScore.overlap > 0) {
            referenceBoost += referenceScore.score * 1.35 + referenceScore.overlap * 10;
          }
          if (signatureScore.overlap > 0) {
            referenceBoost += signatureScore.score * 1.2 + signatureScore.overlap * 6;
          }
          for (const term of blendSemantic.reference.boostTerms) {
            if (
              hasPhrase(entry.titleTokens, term) ||
              hasPhrase(entry.canonicalNameTokens, term) ||
              hasPhrase(entry.noteTokens, term) ||
              hasPhrase(entry.searchTokens, term)
            ) {
              referenceBoost += guidanceMode ? 5 : 3;
            }
          }
        }

        if (blendSemantic.modifier.matchedConcepts.length > 0 || blendModifierTokens.length > 0) {
          if (modifierScore.overlap > 0) {
            modifierBoost += modifierScore.score * 1.15 + modifierScore.overlap * 9;
          }
          for (const term of blendSemantic.modifier.boostTerms) {
            if (
              hasPhrase(entry.titleTokens, term) ||
              hasPhrase(entry.canonicalNameTokens, term) ||
              hasPhrase(entry.noteTokens, term) ||
              hasPhrase(entry.searchTokens, term)
            ) {
              modifierBoost += guidanceMode ? 8 : 5;
            }
          }
        }

        if (referenceBoost > 0 && modifierBoost > 0) {
          score += referenceBoost * (guidanceMode ? 1.45 : 1.25) + modifierBoost * (guidanceMode ? 0.9 : 0.75) + (guidanceMode ? 24 : 16);
        } else if (referenceBoost > 0) {
          score += referenceBoost * (guidanceMode ? 1.1 : 0.95);
        } else if (modifierBoost > 0) {
          score += modifierBoost * (guidanceMode ? 0.65 : 0.5);
        }

        if (exactReferenceHit) {
          score += guidanceMode ? 112 : 84;
          blendReferencePriority = 2;
          blendReferenceWeight += guidanceMode ? 112 : 84;
          if (referenceBoost > 0) {
            score += guidanceMode ? 24 : 18;
            blendReferenceWeight += referenceBoost;
          }
          if (modifierBoost > 0) {
            score += guidanceMode ? 12 : 8;
            blendModifierPriority = 1;
            blendModifierWeight += modifierBoost;
          }
        } else if (referenceBoost > 0) {
          blendReferencePriority = 1;
          blendReferenceWeight += referenceBoost;
        } else if (modifierBoost > 0) {
          blendModifierPriority = 1;
          blendModifierWeight += modifierBoost;
        }

        if (blendSemantic.reference.matchedConcepts.length > 0 && referenceBoost === 0) {
          score -= guidanceMode ? 18 : 12;
        }
        if (blendSemantic.modifier.matchedConcepts.length > 0 && modifierBoost === 0) {
          score -= guidanceMode ? 14 : 9;
        }
        if (exactReferenceHit && blendSemantic.modifier.matchedConcepts.length > 0) {
          score += guidanceMode ? 12 : 8;
        }
        if (!exactReferenceHit && referenceBoost === 0 && modifierBoost > 0) {
          score -= guidanceMode ? 36 : 24;
        }
        if (referenceBoost > 0 && modifierBoost === 0) {
          score += guidanceMode ? 18 : 12;
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
      score += coverage * (guidanceMode ? 10 : 20);
      score += entry.qualityScore * 0.75;
      const popularity = popularityScore(entry.doc);
      if (rankingPreference === "popular") {
        score += popularity * (guidanceMode ? 28 : 18);
      } else if (rankingPreference === "niche") {
        score += (1 - popularity) * (guidanceMode ? 14 : 9);
      }
      score += fuzzyScore;

      if (guidanceMode) {
        if (semanticMatches.length > 0) {
          score += 12;
        } else if (semantic.matchedConcepts.length > 0) {
          score -= 10;
        }
      }

      return {
        doc: entry.doc,
        score,
        fuzzyScore,
        matchedTerms: uniq(matchedTerms),
        qualityScore: entry.qualityScore,
        comparisonPartHits: Array.from(new Set(comparisonPartHits)),
        semanticMatches: uniq(semanticMatches),
        blendReferencePriority,
        blendReferenceWeight,
        blendModifierPriority,
        blendModifierWeight,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (blendQuery) {
        const aAffinity = a.blendReferencePriority + a.blendModifierPriority;
        const bAffinity = b.blendReferencePriority + b.blendModifierPriority;
        if (bAffinity !== aAffinity) {
          return bAffinity - aAffinity;
        }
        if (b.blendReferencePriority !== a.blendReferencePriority) {
          return b.blendReferencePriority - a.blendReferencePriority;
        }
        if (b.blendModifierPriority !== a.blendModifierPriority) {
          return b.blendModifierPriority - a.blendModifierPriority;
        }
        if (b.blendReferenceWeight !== a.blendReferenceWeight) {
          return b.blendReferenceWeight - a.blendReferenceWeight;
        }
        if (b.blendModifierWeight !== a.blendModifierWeight) {
          return b.blendModifierWeight - a.blendModifierWeight;
        }
      }
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedTerms.length !== a.matchedTerms.length) {
        return b.matchedTerms.length - a.matchedTerms.length;
      }
      if ((b.semanticMatches?.length ?? 0) !== (a.semanticMatches?.length ?? 0)) {
        return (b.semanticMatches?.length ?? 0) - (a.semanticMatches?.length ?? 0);
      }
      return b.qualityScore - a.qualityScore;
    })
    .map(({ doc, score, fuzzyScore, matchedTerms, qualityScore, comparisonPartHits, semanticMatches }) => ({
      doc_id: doc.doc_id,
      source_type: doc.source_type,
      brand: doc.brand,
      name: displayPerfumeTitle(doc.brand, doc.name),
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
      semantic_matches: semanticMatches,
      snippet: buildSnippet(
        doc.text,
        matchedTerms.length > 0 ? matchedTerms : terms,
        `${doc.brand} - ${displayPerfumeTitle(doc.brand, doc.name)}`
      ),
      quality_score: qualityScore,
      comparison_part_hits: comparisonPartHits,
      rationale: buildRationale(doc, matchedTerms, semanticMatches, fuzzyScore, query, intent),
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

  const answer = buildAnswer(query, intent, results, semantic, blendQuery);
  const beginnerHint = semantic.beginnerHint;

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
    beginner_hint: intent.isExactLookup ? "" : beginnerHint,
    matched_concepts: semantic.matchedConcepts.map((concept) => concept.label),
    suggested_prompts: semantic.suggestedPrompts,
    blend_query: blendQuery
      ? {
          reference_text: blendQuery.referenceText,
          modifier_text: blendQuery.modifierText,
        }
      : null,
    results,
  };
}
