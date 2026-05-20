"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadCatalog, loadLookup } from "@/lib/data";
import { useApp } from "@/lib/context";
import { ACCORD_FAMILIES } from "@/lib/accords";
import { AccordPill } from "@/components/AccordPill";
import { PerfumeCard } from "@/components/PerfumeCard";
import type { Perfume } from "@/lib/types";

/**
 * Score a candidate perfume against the user's constructed scent profile.
 *
 * Scoring is tiered — perfumes that have ALL requested accords (leading +
 * trailing) are placed in a higher tier than those missing any trailing accord.
 * Within each tier, score by combined weight.
 *
 * Tier 2 (1,000,000+): has every leading AND every trailing accord
 * Tier 1 (500,000+):   has every leading accord + at least one trailing
 * Tier 0:              has every leading accord but no trailing accords
 * Disqualified (-1):   missing any leading accord
 */
function scoreCandidate(
  candidate: Perfume,
  leadingAccords: string[],
  trailingAccords: string[]
): number {
  // Leading accords — hard requirement, disqualify if missing
  let leadingScore = 0;
  for (const accord of leadingAccords) {
    const weight = candidate.aw[accord] ?? 0;
    if (weight === 0) return -1;
    leadingScore += weight;
  }

  // Trailing accords — count how many are present
  let trailingScore = 0;
  let trailingHits = 0;
  for (const accord of trailingAccords) {
    const weight = candidate.aw[accord] ?? 0;
    if (weight > 0) {
      trailingHits++;
      trailingScore += weight;
    }
  }

  // Tier bonus: perfumes with ALL trailing accords jump far ahead
  let tier = 0;
  if (trailingAccords.length > 0 && trailingHits === trailingAccords.length) {
    tier = 1_000_000;
  } else if (trailingHits > 0) {
    tier = 500_000;
  }

  return tier + leadingScore * 3 + trailingScore * 2;
}

export default function BuildPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [lookup, setLookup] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [leadingAccords, setLeadingAccords] = useState<string[]>([]);
  const [trailingAccords, setTrailingAccords] = useState<string[]>([]);
  const [results, setResults] = useState<{ perfume: Perfume; score: number }[]>([]);

  useEffect(() => {
    Promise.all([loadCatalog(), loadLookup()]).then(([c, l]) => {
      setCatalog(c);
      setLookup(l);
      setLoading(false);
    });
  }, []);

  function toggleLeading(accord: string) {
    setLeadingAccords((prev) => {
      if (prev.includes(accord)) return prev.filter((a) => a !== accord);
      if (prev.length >= 3) return prev; // max 3 leading accords
      return [...prev, accord];
    });
    // If it was in trailing, remove it
    setTrailingAccords((prev) => prev.filter((a) => a !== accord));
  }

  function toggleTrailing(accord: string) {
    setTrailingAccords((prev) =>
      prev.includes(accord) ? prev.filter((a) => a !== accord) : [...prev, accord]
    );
    // If it was in leading, remove it
    setLeadingAccords((prev) => prev.filter((a) => a !== accord));
  }

  function findMatches() {
    if (leadingAccords.length === 0) return;

    // Get candidate IDs from the lookup using leading accords
    const candidateSets = leadingAccords.map(
      (accord) => new Set(lookup[accord] ?? [])
    );

    // Intersection: perfumes that have ALL leading accords in the lookup
    let intersection = candidateSets[0];
    for (let i = 1; i < candidateSets.length; i++) {
      const next = new Set<number>();
      for (const id of intersection) {
        if (candidateSets[i].has(id)) next.add(id);
      }
      intersection = next;
    }

    // Also pull in candidates from trailing accord lookups — this widens
    // the pool to include e.g. "fresh aquatic ambers" that might only
    // appear in the amber lookup. scoreCandidate will disqualify any
    // that are missing the leading accords.
    for (const accord of trailingAccords) {
      const ids = lookup[accord] ?? [];
      for (const id of ids) intersection.add(id);
    }

    // Score and rank
    const scored: { perfume: Perfume; score: number }[] = [];
    for (const id of intersection) {
      if (id >= catalog.length) continue;
      const candidate = catalog[id];
      const score = scoreCandidate(candidate, leadingAccords, trailingAccords);
      if (score > 0) {
        scored.push({ perfume: candidate, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    setResults(scored.slice(0, 30));
    setStep(3);
  }

  function addToSeeds(perfumeId: number) {
    dispatch({ type: "ADD_SEED", perfumeId });
  }

  function removeFromSeeds(perfumeId: number) {
    dispatch({ type: "REMOVE_SEED", perfumeId });
  }

  const isSeeded = (id: number) => state.seeds.some((p) => p.perfumeId === id);

  function goBack() {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-sans font-bold text-3xl font-medium text-violet-900 mb-2">
          Build Your Scent
        </h1>
        <p className="text-violet-500">
          Describe the perfume you&apos;re looking for and we&apos;ll find it in our catalog of 68,000 fragrances.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step >= s
                  ? "bg-violet-900 text-white"
                  : "bg-violet-100 text-violet-400"
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <div className={`w-12 h-0.5 rounded-full transition-colors ${step > s ? "bg-violet-900" : "bg-violet-200"}`} />
            )}
          </div>
        ))}
        <span className="ml-3 text-sm text-violet-400">
          {step === 1 && "Choose leading accords"}
          {step === 2 && "Add trailing accords"}
          {step === 3 && "Results"}
        </span>
      </div>

      {/* Step 1: Leading accords */}
      {step === 1 && (
        <div>
          <div className="bg-white border border-violet-200 rounded-lg p-6 mb-6">
            <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-1">
              What should it smell like?
            </h2>
            <p className="text-sm text-violet-500 mb-5">
              Choose 1&ndash;3 leading accords &mdash; the dominant scent character you want.
            </p>

            {leadingAccords.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-violet-100">
                <span className="text-xs text-violet-400 self-center mr-1">Selected:</span>
                {leadingAccords.map((accord) => (
                  <AccordPill
                    key={accord}
                    accord={accord}
                    large
                    onClick={() => toggleLeading(accord)}
                    selected
                  />
                ))}
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(ACCORD_FAMILIES).map(([family, accords]) => (
                <div key={family}>
                  <h3 className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-2">
                    {family}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {accords.map((accord) => (
                      <AccordPill
                        key={accord}
                        accord={accord}
                        onClick={() => toggleLeading(accord)}
                        selected={leadingAccords.includes(accord)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              disabled={leadingAccords.length === 0}
              className="px-5 py-2.5 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Trailing Accords
            </button>
            {leadingAccords.length >= 1 && (
              <button
                onClick={findMatches}
                className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
              >
                Skip &amp; Find Matches
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Trailing accords */}
      {step === 2 && (
        <div>
          <div className="bg-white border border-violet-200 rounded-lg p-6 mb-4">
            <div className="mb-4 pb-4 border-b border-violet-100">
              <span className="text-xs font-medium text-violet-400 uppercase tracking-wider">Leading accords</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {leadingAccords.map((accord) => (
                  <AccordPill key={accord} accord={accord} large selected />
                ))}
              </div>
            </div>

            <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-1">
              What else should it have?
            </h2>
            <p className="text-sm text-violet-500 mb-5">
              Optionally pick trailing accords &mdash; secondary notes that add character.
              These won&apos;t be required, but perfumes with them will rank higher.
            </p>

            {trailingAccords.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-violet-100">
                <span className="text-xs text-violet-400 self-center mr-1">Selected:</span>
                {trailingAccords.map((accord) => (
                  <AccordPill
                    key={accord}
                    accord={accord}
                    large
                    onClick={() => toggleTrailing(accord)}
                    selected
                  />
                ))}
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(ACCORD_FAMILIES).map(([family, accords]) => {
                // Filter out accords already selected as leading
                const available = accords.filter((a) => !leadingAccords.includes(a));
                if (available.length === 0) return null;
                return (
                  <div key={family}>
                    <h3 className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-2">
                      {family}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((accord) => (
                        <AccordPill
                          key={accord}
                          accord={accord}
                          onClick={() => toggleTrailing(accord)}
                          selected={trailingAccords.includes(accord)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={findMatches}
              className="px-5 py-2.5 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Find Matches
            </button>
            <button
              onClick={goBack}
              className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && (
        <div>
          {/* Profile summary */}
          <div className="bg-white border border-violet-200 rounded-lg p-5 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-violet-500">Smells like</span>
              {leadingAccords.map((accord) => (
                <AccordPill key={accord} accord={accord} large />
              ))}
              {trailingAccords.length > 0 && (
                <>
                  <span className="text-sm text-violet-400">with</span>
                  {trailingAccords.map((accord) => (
                    <AccordPill key={accord} accord={accord} />
                  ))}
                </>
              )}
              <button
                onClick={() => setStep(1)}
                className="ml-auto text-xs text-violet-400 hover:text-violet-600 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Seeds */}
          {state.seeds.length > 0 && (
            <div className="mb-6 p-4 bg-white border border-violet-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-sans font-bold text-lg font-medium text-violet-900">
                  Your Seeds ({state.seeds.length}/3)
                </h2>
                <button
                  onClick={() => router.push("/recommendations")}
                  className="px-4 py-2 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                >
                  Get Recommendations
                </button>
              </div>
            </div>
          )}

          {results.length > 0 ? (
            <div>
              <h2 className="font-sans font-bold text-lg font-medium text-violet-900 mb-3">
                Matching Perfumes ({results.length})
              </h2>
              <div className="grid gap-3">
                {results.map(({ perfume: p }) => (
                  <PerfumeCard
                    key={p.id}
                    perfume={p}
                    action={
                      isSeeded(p.id) ? (
                        <button
                          onClick={() => removeFromSeeds(p.id)}
                          className="text-xs px-3 py-1.5 rounded-md border border-violet-300 text-violet-500 hover:bg-violet-100 transition-colors"
                        >
                          Remove
                        </button>
                      ) : state.seeds.length < 3 ? (
                        <button
                          onClick={() => addToSeeds(p.id)}
                          className="text-xs px-3 py-1.5 rounded-md bg-violet-900 text-white hover:bg-violet-700 transition-colors"
                        >
                          + Seed
                        </button>
                      ) : null
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-violet-500">
              No perfumes match all your leading accords. Try removing one.
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={goBack}
              className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => { setStep(1); setLeadingAccords([]); setTrailingAccords([]); setResults([]); }}
              className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
