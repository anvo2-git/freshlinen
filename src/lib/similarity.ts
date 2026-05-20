import type { Perfume, Vote } from "./types";

type RankingPreference = "balanced" | "popular" | "niche";

/**
 * Cosine similarity between two sparse accord weight vectors.
 * Weights are stored as Record<string, number> (0-100 scale).
 */
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function popularitySignal(perfume: Perfume): number {
  const rating = Number.isFinite(perfume.r) ? Math.max(0, Math.min(perfume.r, 5)) / 5 : 0;
  const count = Number.isFinite(perfume.rc) ? Math.min(1, Math.log1p(Math.max(0, perfume.rc)) / 10) : 0;
  return rating * 0.6 + count * 0.4;
}

function rankingPreferenceBoost(perfume: Perfume, preference: RankingPreference): number {
  const popularity = popularitySignal(perfume);
  if (preference === "popular") return popularity * 40;
  if (preference === "niche") return (1 - popularity) * 18;
  return 0;
}

/**
 * Get candidate perfume IDs that share accords with the given perfume.
 * Uses the pre-computed candidate lookup for fast filtering.
 */
function getCandidates(
  perfume: Perfume,
  lookup: Record<string, number[]>,
  topN: number = 2
): Set<number> {
  const accords = Object.entries(perfume.aw)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name);

  const candidates = new Set<number>();
  for (const accord of accords) {
    const ids = lookup[accord];
    if (ids) {
      for (const id of ids) candidates.add(id);
    }
  }
  return candidates;
}

/**
 * Recommend perfumes similar to a single seed perfume.
 * Returns array of [perfumeId, similarity] sorted by similarity desc.
 */
export function recommendForSeed(
  seed: Perfume,
  catalog: Perfume[],
  lookup: Record<string, number[]>,
  exclude: Set<number>,
  limit: number = 5,
  preference: RankingPreference = "balanced"
): [number, number][] {
  const candidates = getCandidates(seed, lookup);
  const results: Array<[number, number, number]> = [];

  for (const candidateId of candidates) {
    if (exclude.has(candidateId)) continue;
    if (candidateId >= catalog.length) continue;
    const candidate = catalog[candidateId];
    const sim = cosineSimilarity(seed.aw, candidate.aw);
    const score = sim * 100 + rankingPreferenceBoost(candidate, preference);
    results.push([candidateId, sim, score]);
  }

  results.sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  return results.slice(0, limit).map(([candidateId, sim]) => [candidateId, sim]);
}

// ─── Dirichlet-based session personalization ────────────────────────────────
//
// From the README: "Content-based recommendation with session-based Bayesian
// personalisation via Dirichlet posteriors over the accord space."
//
// The Dirichlet distribution is conjugate to the Categorical/Multinomial.
// We maintain concentration parameters α over the 90 accords:
//   - Prior: α_i = 1 (uniform)
//   - Each picked perfume: α_i += accord_weight_i (observe the user "likes" these accords)
//   - Thumbs up:  α_i += accord_weight_i * boost
//   - Thumbs down: α_i = max(prior, α_i - accord_weight_i * dampen)
// The posterior mean E[θ_i] = α_i / Σα gives a probability distribution over accords,
// which serves as the user's preference vector.

/**
 * Get the top-N accord names for a perfume, sorted by weight descending.
 */
function getTopAccords(perfume: Perfume, n: number): Set<string> {
  return new Set(
    Object.entries(perfume.aw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name)
  );
}

/**
 * Build a Dirichlet posterior over the accord space from picks and votes.
 * Returns the posterior mean as a preference vector.
 *
 * Vote influence is weighted by accord rank:
 * - A single vote mostly affects trailing accords (3rd, 4th, 5th…) since the
 *   leading accords are *why* the perfume was recommended in the first place.
 * - Leading accords (top 2) only get significant adjustment when multiple
 *   votes of the same direction converge on them — i.e., the user has shown
 *   a clear pattern, not just one data point.
 */
function buildDirichletPosterior(
  seeds: Perfume[],
  votes: Vote[],
  catalog: Perfume[]
): Record<string, number> {
  // Collect all accord keys from seeds + voted perfumes
  const allAccords = new Set<string>();
  for (const seed of seeds) {
    for (const key of Object.keys(seed.aw)) allAccords.add(key);
  }
  for (const vote of votes) {
    const p = catalog[vote.perfumeId];
    if (p) for (const key of Object.keys(p.aw)) allAccords.add(key);
  }

  // Initialize with uniform prior α = 1 for each observed accord
  const alpha: Record<string, number> = {};
  for (const accord of allAccords) {
    alpha[accord] = 1;
  }

  // Update with seed perfume accord weights (scaled down to pseudo-count range)
  for (const seed of seeds) {
    for (const [accord, weight] of Object.entries(seed.aw)) {
      alpha[accord] += weight / 10; // weight is 0-100, scale to 0-10 pseudo-counts
    }
  }

  // ── Count how many votes of each direction share a leading accord ──
  // If 2+ upvotes share "woody" in their top-2, that's a real signal.
  // If only 1 downvote has "woody" in top-2, the user probably still likes
  // woody — they just didn't like *that specific* woody perfume's trailing notes.
  const leadingAccordVoteCounts: Record<string, { up: number; down: number }> = {};
  for (const vote of votes) {
    const perfume = catalog[vote.perfumeId];
    if (!perfume) continue;
    const top2 = getTopAccords(perfume, 2);
    for (const accord of top2) {
      if (!leadingAccordVoteCounts[accord]) {
        leadingAccordVoteCounts[accord] = { up: 0, down: 0 };
      }
      leadingAccordVoteCounts[accord][vote.vote]++;
    }
  }

  // ── Apply votes with position-aware weighting ──
  for (const vote of votes) {
    const perfume = catalog[vote.perfumeId];
    if (!perfume) continue;
    const top2 = getTopAccords(perfume, 2);

    for (const [accord, weight] of Object.entries(perfume.aw)) {
      const isLeading = top2.has(accord);

      // Determine the multiplier for this accord based on rank position
      let multiplier: number;
      if (isLeading) {
        // Leading accord: only apply full weight if multiple votes converge
        const directionCount = leadingAccordVoteCounts[accord]?.[vote.vote] ?? 0;
        // 1 vote → 0.1x, 2 votes → 0.6x, 3+ votes → 1.0x
        multiplier = directionCount >= 3 ? 1.0 : directionCount >= 2 ? 0.6 : 0.1;
      } else {
        // Trailing accord: full influence — this is the differentiating signal
        multiplier = 1.0;
      }

      const delta = (weight / 20) * multiplier;
      if (vote.vote === "up") {
        alpha[accord] += delta;
      } else {
        alpha[accord] = Math.max(0.1, alpha[accord] - delta);
      }
    }
  }

  // Compute posterior mean: E[θ_i] = α_i / Σα
  const totalAlpha = Object.values(alpha).reduce((s, v) => s + v, 0);
  const posterior: Record<string, number> = {};
  for (const [accord, a] of Object.entries(alpha)) {
    posterior[accord] = (a / totalAlpha) * 100; // scale back to 0-100 for cosine similarity
  }

  return posterior;
}

/**
 * Generate grouped recommendations.
 * Without votes: per-seed recommendations using direct cosine similarity.
 * With votes: Dirichlet posterior-based refined recommendations.
 */
export function generateRecommendations(
  seeds: Perfume[],
  catalog: Perfume[],
  lookup: Record<string, number[]>,
  votes: Vote[] = [],
  recsPerSeed: number = 5,
  preference: RankingPreference = "balanced"
): Record<number, [number, number][]> {
  const seedIds = new Set(seeds.map((s) => s.id));
  const allRecIds = new Set<number>(seedIds);
  const grouped: Record<number, [number, number][]> = {};

  if (votes.length > 0) {
    // Refined mode: keep per-seed grouping but re-rank using Dirichlet posterior
    const posterior = buildDirichletPosterior(seeds, votes, catalog);

    // Blend each seed's accords with the posterior for per-seed re-ranking
    for (const seed of seeds) {
      // Create a blended vector: 50% seed accords + 50% posterior
      const blended: Record<string, number> = {};
      const allKeys = new Set([...Object.keys(seed.aw), ...Object.keys(posterior)]);
      for (const k of allKeys) {
        blended[k] = ((seed.aw[k] ?? 0) + (posterior[k] ?? 0)) / 2;
      }

      // Get candidates from the seed's top accords (same as unrefined mode)
      const candidates = getCandidates(seed, lookup);
      const results: [number, number][] = [];

      for (const candidateId of candidates) {
        if (allRecIds.has(candidateId)) continue;
        if (candidateId >= catalog.length) continue;
        const sim = cosineSimilarity(blended, catalog[candidateId].aw);
        results.push([candidateId, sim]);
      }

      results.sort((a, b) => b[1] - a[1]);
      grouped[seed.id] = results.slice(0, recsPerSeed);
      for (const [id] of grouped[seed.id]) allRecIds.add(id);
    }
  } else {
    // Standard mode: per-seed recommendations
    for (const seed of seeds) {
      const recs = recommendForSeed(seed, catalog, lookup, allRecIds, recsPerSeed, preference);
      grouped[seed.id] = recs;
      for (const [id] of recs) allRecIds.add(id);
    }
  }

  return grouped;
}

/**
 * Find perfumes matching a set of accords (for quiz results).
 * Does (n choose 2) on the liked accords and finds perfumes with those pairs.
 */
export function findByAccordPairs(
  accords: string[],
  catalog: Perfume[],
  lookup: Record<string, number[]>,
  limit: number = 6,
  preference: RankingPreference = "balanced"
): number[] {
  if (accords.length < 2) {
    // Fallback: just find perfumes with the single accord
    if (accords.length === 1) {
      const ids = lookup[accords[0].toLowerCase()] ?? [];
      const scored = ids
        .filter((id) => id < catalog.length)
        .map((id) => {
          const perfume = catalog[id];
          const score = (perfume.aw[accords[0].toLowerCase()] ?? 0) + rankingPreferenceBoost(perfume, preference);
          return [id, score] as [number, number];
        })
        .sort((a, b) => b[1] - a[1]);
      return scored.slice(0, limit).map(([id]) => id);
    }
    return [];
  }

  // Generate all (n choose 2) pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < accords.length; i++) {
    for (let j = i + 1; j < accords.length; j++) {
      pairs.push([accords[i].toLowerCase(), accords[j].toLowerCase()]);
    }
  }

  // For each pair, find perfumes that have both accords with high weights
  const seen = new Set<number>();
  const results: number[] = [];
  const recsPerPair = Math.max(2, Math.ceil(limit / pairs.length));

  for (const [a, b] of pairs) {
    const idsA = new Set(lookup[a] ?? []);
    const idsB = new Set(lookup[b] ?? []);

    // Intersection: perfumes with both accords
    const both: [number, number][] = [];
    for (const id of idsA) {
      if (idsB.has(id) && !seen.has(id) && id < catalog.length) {
        const perfume = catalog[id];
        const score = (perfume.aw[a] ?? 0) + (perfume.aw[b] ?? 0) + rankingPreferenceBoost(perfume, preference);
        both.push([id, score]);
      }
    }

    both.sort((a, b) => b[1] - a[1]);
    for (const [id] of both.slice(0, recsPerPair)) {
      if (results.length >= limit) break;
      results.push(id);
      seen.add(id);
    }
  }

  return results;
}
