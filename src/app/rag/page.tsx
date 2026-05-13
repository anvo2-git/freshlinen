"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BEGINNER_PROMPTS } from "@/lib/rag-semantic.mjs";
import {
  scrapeFragranticaCandidate,
  searchFragranticaCandidates,
  type FragranticaCandidate,
} from "@/lib/rag-fallback";
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
  limit: number;
  corpus_size: number;
  indexed_size: number;
  intent: string;
  answer: string;
  beginner_hint: string;
  matched_concepts: string[];
  suggested_prompts: RagSuggestedPrompt[];
  results: RagResult[];
  error?: string;
};

const SAMPLE_QUERIES = [
  "clean rainy iris",
  "smoky vanilla winter",
  "similar to Layton but less sweet",
  "rose oud incense",
];

export default function RagPage() {
  const [query, setQuery] = useState("clean rainy iris");
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RagResponse | null>(null);
  const [error, setError] = useState("");
  const [fragranticaResults, setFragranticaResults] = useState<FragranticaCandidate[]>([]);
  const [searchingFragrantica, setSearchingFragrantica] = useState(false);
  const [fragranticaError, setFragranticaError] = useState("");
  const [scrapingUrl, setScrapingUrl] = useState("");
  const [scrapeNotice, setScrapeNotice] = useState("");

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  async function searchFragrantica(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) return;

    setSearchingFragrantica(true);
    setFragranticaError("");
    try {
      const results = await searchFragranticaCandidates(trimmed);
      setFragranticaResults(results);
      if (results.length === 0) {
        setFragranticaError("No Fragrantica candidates found for that query.");
      }
    } catch (error) {
      setFragranticaResults([]);
      setFragranticaError(error instanceof Error ? error.message : "Fragrantica search failed.");
    } finally {
      setSearchingFragrantica(false);
    }
  }

  async function scrapeFragrantica(candidate: FragranticaCandidate) {
    setScrapingUrl(candidate.url);
    setFragranticaError("");
    setScrapeNotice("");
    try {
      const data = await scrapeFragranticaCandidate(candidate.url);
      setScrapeNotice(
        `Cached ${data.brand ?? candidate.brand} ${data.name ?? candidate.name} in Supabase. Rebuild the corpus to fold it into RAG.`
      );
    } catch (error) {
      setFragranticaError(error instanceof Error ? error.message : "Scraping failed.");
    } finally {
      setScrapingUrl("");
    }
  }

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) return;

    setLoading(true);
    setError("");
    setFragranticaResults([]);
    setFragranticaError("");
    setScrapeNotice("");
    try {
      const res = await fetch(`/api/rag/query?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
      const data = (await res.json()) as RagResponse;
      if (!res.ok) {
        setResult(null);
        setError(data.error || "RAG query failed.");
        return;
      }
      setResult(data);
      if ((data.results?.length ?? 0) === 0) {
        void searchFragrantica(trimmed);
      }
    } catch {
      setResult(null);
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">Retrieval</p>
        <h1 className="text-4xl font-bold text-violet-950 mb-3">RAG search</h1>
        <p className="text-violet-600 max-w-2xl leading-relaxed">
          Query the merged perfume corpus with natural language and get ranked matches
          with snippets, notes, accords, and source metadata.
        </p>
      </div>

      <div className="bg-white border border-violet-200 rounded-2xl p-5 shadow-sm mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="Describe a vibe, perfume, or note profile"
            className="w-full rounded-xl border border-violet-200 px-4 py-3 text-violet-950 placeholder:text-violet-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={limit}
            onChange={(e) => setLimit(Number.parseInt(e.target.value || "5", 10) || 5)}
            className="w-full rounded-xl border border-violet-200 px-4 py-3 text-violet-950 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <button
            type="button"
            onClick={() => runSearch()}
            disabled={!canSearch || loading}
            className="rounded-xl bg-violet-700 px-5 py-3 font-medium text-white transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Need a starting point?</p>
              <p className="mt-1 text-sm text-violet-700">
                If you do not know the note vocabulary, start from the feeling you want. The chips
                below are the easiest perfume directions to explain.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {BEGINNER_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => {
                  setQuery(prompt.query);
                  runSearch(prompt.query);
                }}
                className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SAMPLE_QUERIES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setQuery(sample);
                runSearch(sample);
              }}
              className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-violet-600">
                {result.results.length} results from {result.corpus_size.toLocaleString()} docs · {result.intent}
              </div>
              <div className="rounded-2xl border border-violet-200 bg-white p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Answer brief</div>
                <p className="mt-3 text-sm leading-relaxed text-violet-800">{result.answer}</p>
              </div>
              {result.beginner_hint ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Beginner hint</div>
                  <p className="mt-3 text-sm leading-relaxed text-violet-700">{result.beginner_hint}</p>
                  {result.matched_concepts.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {result.matched_concepts.map((concept) => (
                        <span key={concept} className="rounded-full bg-white px-3 py-1 text-xs text-violet-700 border border-violet-200">
                          {concept}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {result.suggested_prompts.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {result.suggested_prompts.slice(0, 5).map((prompt) => (
                        <button
                          key={prompt.label}
                          type="button"
                          onClick={() => {
                            setQuery(prompt.query);
                            runSearch(prompt.query);
                          }}
                          className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
                          title={prompt.description}
                        >
                          {prompt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {!loading && result?.results?.length === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-violet-500">
              <p>No corpus match yet. Try a perfume name, note combo, or vibe query.</p>
              <button
                type="button"
                onClick={() => searchFragrantica()}
                disabled={searchingFragrantica}
                className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searchingFragrantica ? "Searching Fragrantica..." : "Search Fragrantica instead"}
              </button>
            </div>
          )}

          {result?.results.map((item) => (
            <a
              key={item.doc_id}
              href={item.official_url || item.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-violet-200 bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-violet-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-violet-400">
                    {item.source_type.replace(/_/g, " ")}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-violet-950">
                    {item.brand}
                    <span className="text-violet-400"> / </span>
                    {item.name}
                  </h2>
                </div>
                <div className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">
                  {item.score.toFixed(1)}
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-violet-700">{item.snippet}</p>
              <p className="mt-3 text-xs leading-relaxed text-violet-500">{item.rationale}</p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {item.accords.slice(0, 6).map((accord) => (
                  <span key={accord} className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                    {accord}
                  </span>
                ))}
                {item.notes.slice(0, 6).map((note) => (
                  <span key={note} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    {note}
                  </span>
                ))}
                {item.semantic_matches?.slice(0, 5).map((concept) => (
                  <span key={concept} className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    {concept}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-violet-500">
                {item.rating_value ? <span>Rating {item.rating_value}</span> : null}
                {item.rating_count ? <span>{item.rating_count} votes</span> : null}
                {item.release_signal ? <span>{item.release_signal}</span> : null}
                {item.matched_terms.length > 0 ? <span>Matched: {item.matched_terms.join(", ")}</span> : null}
              </div>
            </a>
          ))}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
              Fragrantica fallback
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-violet-700">
              If the merged corpus misses a perfume, search Fragrantica and scrape a result into
              the shared Supabase cache.
            </p>
            <button
              type="button"
              onClick={() => searchFragrantica()}
              disabled={!canSearch || searchingFragrantica}
              className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchingFragrantica ? "Searching..." : "Search Fragrantica"}
            </button>
            {scrapeNotice ? <p className="mt-3 text-sm text-emerald-700">{scrapeNotice}</p> : null}
            {fragranticaError ? <p className="mt-3 text-sm text-rose-700">{fragranticaError}</p> : null}
            {fragranticaResults.length > 0 ? (
              <div className="mt-4 space-y-3">
                {fragranticaResults.map((item) => (
                  <div key={item.url} className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm font-medium text-violet-950 hover:text-violet-700"
                    >
                      {item.brand ? `${item.brand} / ` : ""}
                      {item.name}
                    </a>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => scrapeFragrantica(item)}
                        disabled={scrapingUrl === item.url}
                        className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {scrapingUrl === item.url ? "Scraping..." : "Scrape & cache"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
              What this does
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-violet-700">
              <li>Searches the merged perfume corpus with natural language.</li>
              <li>Ranks exact name, brand, note, and accord overlaps higher.</li>
              <li>Expands beginner scent language like fresh, sweet, smoky, woody, and floral.</li>
              <li>Prefers richer records when the query is ambiguous.</li>
              <li>Returns snippets you can inspect before using the result.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm text-violet-700">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
              Current scope
            </h3>
            <p className="mt-3 leading-relaxed">
              This is the first pass: lexical retrieval over the current corpus, not embeddings or answer generation yet.
            </p>
            <Link
              href="/rag/eval"
              className="mt-4 inline-flex rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100"
            >
              Open eval dashboard
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
