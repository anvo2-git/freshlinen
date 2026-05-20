"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { loadCatalog, loadLookup } from "@/lib/data";
import { generateRecommendations } from "@/lib/similarity";
import { useApp } from "@/lib/context";
import { useFavorites } from "@/lib/favorites-context";
import { PerfumeCard } from "@/components/PerfumeCard";
import { getPerfume } from "@/lib/perfume-lookup";
import type { Perfume } from "@/lib/types";

type RecommendationSummaryResponse = {
  answer: string;
  follow_up?: string;
  research_summary?: string;
  confidence?: "high" | "medium" | "low";
  llm_used?: boolean;
  llm_model?: string;
  research_used?: boolean;
  research_model?: string;
};

export default function RecommendationsPage() {
  const { state, dispatch } = useApp();
  const { favoriteIds } = useFavorites();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [lookup, setLookup] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [includeFavorites, setIncludeFavorites] = useState(true);
  const [summary, setSummary] = useState<(RecommendationSummaryResponse & { key: string }) | null>(null);
  const summaryRequestKey = useRef("");

  useEffect(() => {
    Promise.all([loadCatalog(), loadLookup()]).then(([c, l]) => {
      setCatalog(c);
      setLookup(l);
      setLoading(false);
    });
  }, []);

  const seedPerfumes = useMemo(
    () =>
      state.seeds
        .map((p) => getPerfume(p.perfumeId, catalog, state.scrapedPerfumes))
        .filter((p): p is Perfume => !!p),
    [state.seeds, catalog, state.scrapedPerfumes]
  );

  const favoritePerfumes = useMemo(
    () =>
      Array.from(favoriteIds)
        .map((id) => getPerfume(id, catalog, state.scrapedPerfumes))
        .filter((p): p is Perfume => !!p),
    [favoriteIds, catalog, state.scrapedPerfumes]
  );

  const recs = useMemo(() => {
    if (seedPerfumes.length === 0 || catalog.length === 0) return {};
    const favoriteContext = includeFavorites ? favoritePerfumes : [];
    return generateRecommendations(seedPerfumes, catalog, lookup, state.votes, 5, favoriteContext);
  }, [seedPerfumes, state.votes, catalog, lookup, includeFavorites, favoritePerfumes]);

  const recommendationGroups = useMemo(
    () =>
      Object.entries(recs).map(([seedIdStr, recList]) => {
        const seedId = Number.parseInt(seedIdStr, 10);
        const seedPerfume = getPerfume(seedId, catalog, state.scrapedPerfumes);
        return {
          seedId,
          seedName: seedPerfume?.n ?? "Unknown",
          items: recList
            .map(([recId, sim]) => {
              const perfume = getPerfume(recId, catalog, state.scrapedPerfumes);
              return perfume ? { perfume, similarity: sim } : null;
            })
            .filter((item): item is { perfume: Perfume; similarity: number } => !!item),
        };
      }),
    [recs, catalog, state.scrapedPerfumes]
  );

  const summaryKey = useMemo(
    () =>
      JSON.stringify({
        includeFavorites,
        seedIds: seedPerfumes.map((perfume) => perfume.id),
        favoriteIds: includeFavorites ? favoritePerfumes.map((perfume) => perfume.id) : [],
        voteCount: state.votes.length,
        groups: recommendationGroups.map((group) => ({
          seedId: group.seedId,
          items: group.items.map((item) => item.perfume.id),
        })),
      }),
    [includeFavorites, seedPerfumes, favoritePerfumes, state.votes.length, recommendationGroups]
  );

  useEffect(() => {
    if (loading || seedPerfumes.length === 0 || recommendationGroups.length === 0) {
      return;
    }

    const requestKey = summaryKey;
    summaryRequestKey.current = requestKey;
    fetch("/api/recommendations/format", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        include_favorites: includeFavorites,
        seed_count: seedPerfumes.length,
        favorite_count: favoritePerfumes.length,
        seed_perfumes: seedPerfumes,
        favorite_perfumes: includeFavorites ? favoritePerfumes : [],
        groups: recommendationGroups,
        vote_count: state.votes.length,
      }),
    })
      .then((res) => res.json())
      .then((data: RecommendationSummaryResponse) => {
        if (summaryRequestKey.current !== requestKey) return;
        setSummary({ ...data, key: requestKey });
      })
      .catch(() => {
        if (summaryRequestKey.current !== requestKey) return;
        setSummary({
          key: requestKey,
          answer: "These recommendations are ranked by accord similarity to your session Seeds.",
          confidence: "low",
        });
      });
  }, [loading, seedPerfumes, favoritePerfumes, recommendationGroups, includeFavorites, state.votes.length, summaryKey]);

  function handleVote(perfumeId: number, vote: "up" | "down") {
    const existing = state.votes.find((v) => v.perfumeId === perfumeId);
    if (existing?.vote === vote) {
      dispatch({ type: "REMOVE_VOTE", perfumeId });
    } else {
      dispatch({ type: "SET_VOTE", perfumeId, vote });
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading...
      </div>
    );
  }

  // Empty state: no seeds
  if (state.seeds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="font-sans font-bold text-3xl font-medium text-violet-900 mb-3">Recommendations</h1>
        <p className="text-violet-500 mb-6">
          You haven&apos;t added any Seeds yet. Add up to 3 to get personalised recommendations.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/explore"
            className="px-5 py-2.5 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Explore Perfumes
          </Link>
          <Link
            href="/quiz"
            className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
          >
            Take the Quiz
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-sans font-bold text-3xl font-medium text-violet-900">Recommendations</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncludeFavorites((prev) => !prev)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              includeFavorites
                ? "border border-violet-300 text-violet-600 hover:bg-violet-100"
                : "border border-violet-300 text-violet-500 hover:bg-violet-100"
            }`}
          >
            {includeFavorites ? "Favorites included" : "Favorites excluded"}
          </button>
        </div>
      </div>

      {includeFavorites && favoritePerfumes.length > 0 && (
        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm text-violet-700">
            Favorites are included as taste context for this run. They steer similarity without replacing your session Seeds.
          </p>
        </div>
      )}

      {seedPerfumes.length > 0 && recommendationGroups.length > 0 && summary?.key !== summaryKey && (
        <div className="mb-6 rounded-xl border border-violet-200 bg-white p-4 text-sm text-violet-500">
          Formatting recommendation summary...
        </div>
      )}

      {seedPerfumes.length > 0 && recommendationGroups.length > 0 && summary?.key === summaryKey && summary?.answer ? (
        <div className="mb-6 space-y-3">
          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-violet-400">LLM summary</div>
              <div className="text-xs text-violet-400">
                {summary.llm_used ? `LLM ${summary.llm_model}` : "Deterministic fallback"}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-violet-800">{summary.answer}</p>
          </div>
          {summary.research_summary ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Research notes</div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-violet-800">
                {summary.research_summary}
              </pre>
            </div>
          ) : null}
          {summary.follow_up ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-amber-500">Follow-up</div>
              <p className="mt-3 text-sm leading-relaxed text-amber-800">{summary.follow_up}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Grouped recommendations */}
      {recommendationGroups.map(({ seedId, seedName, items }) => {
        return (
          <div key={seedId} className="mb-8">
            <h2 className="font-sans font-bold italic text-lg text-violet-500 mb-3">
              Because you liked <span className="text-violet-700 not-italic font-medium">{seedName}</span>
            </h2>
            <div className="grid gap-3">
              {items.map(({ perfume: p, similarity: sim }) => {
                const existingVote = state.votes.find((v) => v.perfumeId === p.id);
                return (
                  <PerfumeCard
                    key={p.id}
                    perfume={p}
                    action={
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-violet-400 mr-1">
                          {(sim * 100).toFixed(0)}%
                        </span>
                        <button
                          onClick={() => handleVote(p.id, "up")}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                            existingVote?.vote === "up"
                              ? "bg-green-100 text-green-700"
                              : "bg-violet-100 text-violet-400 hover:bg-green-50 hover:text-green-600"
                          }`}
                          title="More like this"
                        >
                          &#9650;
                        </button>
                        <button
                          onClick={() => handleVote(p.id, "down")}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                            existingVote?.vote === "down"
                              ? "bg-red-100 text-red-700"
                              : "bg-violet-100 text-violet-400 hover:bg-red-50 hover:text-red-600"
                          }`}
                          title="Not for me"
                        >
                          &#9660;
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
