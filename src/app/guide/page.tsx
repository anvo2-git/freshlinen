"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BEGINNER_PROMPTS } from "@/lib/rag-semantic.mjs";
import { buildGuideQuery, createGuideState, getGuideQuestion, guideReady, summarizeGuideState, type GuideState } from "@/lib/guide";
import { loadCatalog } from "@/lib/data";
import { useApp } from "@/lib/context";
import { useFavorites } from "@/lib/favorites-context";
import { getPerfume } from "@/lib/perfume-lookup";
import { displayPerfumeTitle } from "@/lib/perfume-display";
import { PerfumeCard } from "@/components/PerfumeCard";
import { PerfumeDetails } from "@/components/PerfumeDetails";
import { PerfumeHeading } from "@/components/PerfumeHeading";
import { PerfumeBottleArt } from "@/components/PerfumeBottleArt";
import type { Perfume } from "@/lib/types";
import type { RagSuggestedPrompt } from "@/lib/rag";

type RagResult = {
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
};

type RagResponse = {
  query: string;
  intent: string;
  answer: string;
  beginner_hint: string;
  matched_concepts: string[];
  suggested_prompts: RagSuggestedPrompt[];
  results: RagResult[];
  research_summary?: string;
  follow_up?: string;
  confidence?: "high" | "medium" | "low";
  llm_used?: boolean;
  llm_model?: string;
  research_used?: boolean;
  research_model?: string;
  error?: string;
};

type TranscriptEntry = {
  role: "assistant" | "user";
  text: string;
};

const INTRO_LINES = [
  "Tell me one perfume you like, a vibe you want, or just a budget and I’ll do the rest.",
  "I’ll keep it simple, then tighten the results one small question at a time.",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePerfumeResult(item: RagResult, catalog: Perfume[], scrapedPerfumes: Perfume[]): Perfume | null {
  if (item.doc_id.startsWith("catalog-")) {
    const perfumeId = Number.parseInt(item.doc_id.slice("catalog-".length), 10);
    if (Number.isFinite(perfumeId)) {
      const perfume = getPerfume(perfumeId, catalog, scrapedPerfumes);
      if (perfume) return perfume;
    }
  }

  const targetBrand = normalize(item.brand);
  const targetName = normalize(item.name);
  const targetOfficial = normalize(item.official_url || "");

  return (
    catalog.find((perfume) => {
      const brand = normalize(perfume.b);
      const name = normalize(perfume.n);
      const brandMatch = targetBrand.length > 0 && (brand.includes(targetBrand) || targetBrand.includes(brand));
      const nameMatch =
        targetName.length > 0 &&
        (name.includes(targetName) ||
          targetName.includes(name) ||
          (name.length > 4 && targetName.includes(name.slice(0, Math.min(name.length, 12)))));
      const officialMatch = targetOfficial.length > 0 && normalize(perfume.n).includes(targetOfficial);
      return brandMatch && (nameMatch || officialMatch);
    }) ?? null
  );
}

export default function GuidePage() {
  const router = useRouter();
  const { state } = useApp();
  const { favoriteIds } = useFavorites();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [guide, setGuide] = useState<GuideState>(createGuideState());
  const [perfumeDraft, setPerfumeDraft] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RagResponse | null>(null);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(
    INTRO_LINES.map((text) => ({ role: "assistant", text }))
  );
  const lastSearchKey = useRef("");

  useEffect(() => {
    loadCatalog().then((items) => {
      setCatalog(items);
      setLoadingCatalog(false);
    });
  }, []);

  const seedPerfumes = useMemo(
    () =>
      state.seeds
        .map((seed) => getPerfume(seed.perfumeId, catalog, state.scrapedPerfumes))
        .filter((perfume): perfume is Perfume => !!perfume),
    [state.seeds, catalog, state.scrapedPerfumes]
  );

  const favoritePerfumes = useMemo(
    () =>
      Array.from(favoriteIds)
        .map((id) => getPerfume(id, catalog, state.scrapedPerfumes))
        .filter((perfume): perfume is Perfume => !!perfume),
    [favoriteIds, catalog, state.scrapedPerfumes]
  );

  const includeFavorites = guide.includeFavorites && favoritePerfumes.length > 0;
  const currentQuestion = getGuideQuestion(guide);
  const searchQuery = buildGuideQuery(guide);
  const shouldSearch = guideReady(guide);
  const summary = summarizeGuideState(guide);
  const rankingPreference =
    guide.priority === "unique"
      ? "niche"
      : guide.priority === "easy" || guide.priority === "performance"
        ? "popular"
        : "balanced";

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        query: searchQuery,
        includeFavorites,
        mode: guide.mode,
        perfumeText: guide.perfumeText,
        vibe: guide.vibe,
        budget: guide.budget,
        priority: guide.priority,
        seedIds: seedPerfumes.map((perfume) => perfume.id),
        favoriteIds: includeFavorites ? favoritePerfumes.map((perfume) => perfume.id) : [],
      }),
    [searchQuery, includeFavorites, guide, seedPerfumes, favoritePerfumes]
  );

  useEffect(() => {
    if (!shouldSearch || loadingCatalog) return;
    if (lastSearchKey.current === requestKey) return;

    const seedPerfumePayload = seedPerfumes.map((perfume) => ({
      id: perfume.id,
      n: perfume.n,
      b: perfume.b,
      g: perfume.g,
      r: perfume.r,
      rc: perfume.rc,
      aw: perfume.aw,
    }));
    const favoritePerfumePayload = includeFavorites
      ? favoritePerfumes.map((perfume) => ({
          id: perfume.id,
          n: perfume.n,
          b: perfume.b,
          g: perfume.g,
          r: perfume.r,
          rc: perfume.rc,
          aw: perfume.aw,
        }))
      : [];

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      lastSearchKey.current = requestKey;
      setLoading(true);
      setError("");

      fetch("/api/rag/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 5,
          seed_perfumes: seedPerfumePayload,
          favorite_perfumes: favoritePerfumePayload,
          include_favorites: includeFavorites,
          ranking_preference: rankingPreference,
        }),
      })
        .then(async (res) => {
          const data = (await res.json()) as RagResponse;
          if (!res.ok) {
            throw new Error(data.error || "Guide search failed.");
          }
          if (!cancelled) {
            setResult(data);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setResult(null);
          setError(err instanceof Error ? err.message : "Network error.");
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shouldSearch, requestKey, loadingCatalog, includeFavorites, searchQuery, seedPerfumes, favoritePerfumes, rankingPreference]);

  function pushUserLine(text: string) {
    setTranscript((prev) => [...prev, { role: "user", text }]);
  }

  function setMode(mode: GuideState["mode"], label: string) {
    pushUserLine(label);
    setGuide({
      mode,
      perfumeText: "",
      includeFavorites: guide.includeFavorites,
    });
    setPerfumeDraft("");
    setResult(null);
    setError("");
    lastSearchKey.current = "";
  }

  function setChoice(
    key: "vibe" | "budget" | "priority",
    value: string,
    label: string
  ) {
    pushUserLine(label);
    setGuide((prev) => ({
      ...prev,
      [key]: value,
    }));
    setResult(null);
    setError("");
    lastSearchKey.current = "";
  }

  function submitPerfumeSeed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = perfumeDraft.trim();
    if (!trimmed) return;
    pushUserLine(trimmed);
    setGuide((prev) => ({
      ...prev,
      perfumeText: trimmed,
    }));
    setResult(null);
    setError("");
    lastSearchKey.current = "";
  }

  function startOver() {
    setGuide(createGuideState());
    setPerfumeDraft("");
    setTranscript(INTRO_LINES.map((text) => ({ role: "assistant", text })));
    setResult(null);
    setError("");
    lastSearchKey.current = "";
  }

  const starterPrompts = BEGINNER_PROMPTS.slice(0, 4);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.32em] text-violet-400 mb-3">Guided onboarding</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-violet-950 mb-3">Perfume Guide</h1>
            <p className="text-violet-600 max-w-2xl leading-relaxed">
              A short conversation that turns beginner perfume language into Seeds, RAG searches,
              and recommendation-ready context.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGuide((prev) => ({ ...prev, includeFavorites: !prev.includeFavorites }))}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors border ${
                guide.includeFavorites && favoritePerfumes.length > 0
                  ? "border-violet-300 bg-violet-100 text-violet-700"
                  : "border-violet-200 bg-white text-violet-500"
              }`}
            >
              {guide.includeFavorites && favoritePerfumes.length > 0 ? "Favorites included" : "Favorites excluded"}
            </button>
            <button
              onClick={startOver}
              className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-violet-200 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Conversation</p>
                <h2 className="mt-1 text-lg font-semibold text-violet-900">
                  One question at a time
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-violet-400">
                <span>{shouldSearch ? "Live RAG" : "Waiting for one answer"}</span>
                {loading && <span>· Searching</span>}
              </div>
            </div>

            <div className="space-y-3">
              {transcript.map((line, idx) => (
                <div
                  key={`${line.role}-${idx}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    line.role === "assistant"
                      ? "bg-violet-50 text-violet-700"
                      : "ml-auto bg-violet-900 text-white"
                  }`}
                >
                  {line.text}
                </div>
              ))}

              {currentQuestion ? (
                <div className="max-w-[90%] rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-violet-400">{currentQuestion.title}</p>
                  <p className="mt-1 text-sm text-violet-700">{currentQuestion.prompt}</p>

                  {currentQuestion.kind === "text" ? (
                    <form onSubmit={submitPerfumeSeed} className="mt-4 flex flex-col gap-3">
                      <input
                        value={perfumeDraft}
                        onChange={(e) => setPerfumeDraft(e.target.value)}
                        placeholder={currentQuestion.placeholder}
                        className="w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-violet-950 placeholder:text-violet-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                      />
                      <button
                        type="submit"
                        className="w-fit rounded-xl bg-violet-900 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 transition-colors"
                      >
                        Use this perfume
                      </button>
                    </form>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {currentQuestion.options.map((option) => (
                        <button
                          key={option.label}
                          onClick={() => {
                            if (currentQuestion.key === "mode") {
                              setMode(option.value as GuideState["mode"], option.label);
                            } else if (currentQuestion.key === "vibe") {
                              setChoice("vibe", option.value, option.label);
                            } else if (currentQuestion.key === "budget") {
                              setChoice("budget", option.value, option.label);
                            } else if (currentQuestion.key === "priority") {
                              setChoice("priority", option.value, option.label);
                            }
                          }}
                          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            option.value === "skip"
                              ? "border-violet-200 bg-white text-violet-500 hover:border-violet-300"
                              : "border-violet-200 bg-white text-violet-700 hover:border-violet-400"
                          }`}
                        >
                          <div className="text-sm font-medium">{option.label}</div>
                          <div className="mt-0.5 max-w-[16rem] text-xs leading-relaxed text-violet-400">
                            {option.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {starterPrompts.length > 0 && (
              <div className="mt-6 border-t border-violet-100 pt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-3">Starter paths</p>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      onClick={() =>
                        setGuide({
                          mode: "vibe",
                          perfumeText: "",
                          vibe: prompt.query,
                          includeFavorites: guide.includeFavorites,
                        })
                      }
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:border-violet-400 hover:bg-violet-100 transition-colors"
                      title={prompt.description}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Current profile</p>
                <h2 className="mt-1 text-lg font-semibold text-violet-900">What we know so far</h2>
              </div>
              <span className="text-xs text-violet-400">
                {guideReady(guide) ? "Ready to search" : "Still refining"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.map((item) => (
                <span key={item} className="rounded-full bg-violet-50 px-3 py-1.5 text-xs text-violet-700">
                  {item}
                </span>
              ))}
            </div>
            {state.seeds.length > 0 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-2">Session Seeds</p>
                <div className="flex flex-wrap gap-2">
                  {seedPerfumes.map((perfume) => (
                    <span key={perfume.id} className="rounded-full bg-violet-900 px-3 py-1.5 text-xs text-white">
                      {displayPerfumeTitle(perfume.b, perfume.n)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {guideReady(guide) && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              Once you like a result, hit <span className="font-semibold">Seed</span> on the card and open
              <span className="font-semibold"> Recommendations</span> to turn this into a shopping list.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-violet-400">RAG output</p>
                <h2 className="mt-1 text-lg font-semibold text-violet-900">Search results</h2>
              </div>
              {guideReady(guide) && (
                <button
                  onClick={() => router.push("/recommendations")}
                  className="rounded-xl bg-violet-900 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 transition-colors"
                >
                  Open Recs
                </button>
              )}
            </div>

            {!shouldSearch && !loading && (
              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-600">
                Answer one small question and the guide will pull a set of perfumes for you.
              </div>
            )}

            {loading && (
              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-600">
                Finding corpus-backed matches...
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            {result ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-violet-400">LLM summary</span>
                    <span className="text-xs text-violet-400">
                      {result.llm_used ? `LLM ${result.llm_model}` : "Deterministic fallback"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-violet-800">{result.answer}</p>
                  {result.follow_up ? (
                    <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-violet-700 border border-violet-200">
                      {result.follow_up}
                    </p>
                  ) : null}
                </div>

                {result.research_summary ? (
                  <div className="rounded-2xl border border-violet-100 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Research notes</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-violet-700">
                      {result.research_summary}
                    </pre>
                  </div>
                ) : null}

                {result.suggested_prompts?.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-3">Refine this</p>
                    <div className="flex flex-wrap gap-2">
                      {result.suggested_prompts.slice(0, 4).map((prompt) => (
                        <button
                          key={prompt.label}
                          onClick={() =>
                            setGuide({
                              mode: "vibe",
                              perfumeText: "",
                              vibe: prompt.query,
                              includeFavorites: guide.includeFavorites,
                            })
                          }
                          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:border-violet-400 hover:bg-violet-100 transition-colors"
                        >
                          {prompt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {result?.results?.length ? (
            <div className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Matches</p>
                  <h2 className="mt-1 text-lg font-semibold text-violet-900">Perfumes to try</h2>
                </div>
                <span className="text-xs text-violet-400">
                  {result.intent === "alternative" ? "Blend / similarity" : result.intent}
                </span>
              </div>
              <div className="grid gap-3">
                {result.results.map((perfume) => {
                  const resolved = resolvePerfumeResult(perfume, catalog, state.scrapedPerfumes);
                  if (resolved) {
                    return <PerfumeCard key={perfume.doc_id} perfume={resolved} />;
                  }

                  return (
                    <div key={perfume.doc_id} className="rounded-2xl border border-violet-200 bg-white p-5">
                      <div className="grid gap-4 sm:grid-cols-[104px_1fr]">
                        <Link href={perfume.official_url || perfume.url} target="_blank" rel="noreferrer" className="block">
                          <PerfumeBottleArt brand={perfume.brand} name={perfume.name} />
                        </Link>
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <Link
                              href={perfume.official_url || perfume.url}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1"
                            >
                              <PerfumeHeading
                                brand={perfume.brand}
                                name={perfume.name}
                                brandClassName="text-violet-400"
                                nameClassName="mt-1 text-xl font-semibold text-violet-950 transition-colors hover:text-violet-700"
                              />
                            </Link>
                            <div>
                              <a
                                href={perfume.official_url || perfume.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-violet-700 hover:border-violet-300 hover:bg-violet-100"
                              >
                                Open
                                <span className="text-violet-400">↗</span>
                              </a>
                            </div>
                            <div className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">
                              {perfume.score.toFixed(1)}
                            </div>
                          </div>
                          <div className="mt-4">
                            <PerfumeDetails
                              brand={perfume.brand}
                              name={perfume.name}
                              snippet={perfume.snippet}
                              text={perfume.text}
                              accords={perfume.accords.slice(0, 6)}
                            />
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-violet-500">{perfume.rationale}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
