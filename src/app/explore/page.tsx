"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { loadCatalog, loadLookup } from "@/lib/data";
import { useApp } from "@/lib/context";
import { ACCORD_FAMILIES } from "@/lib/accords";
import { AccordPill } from "@/components/AccordPill";
import { PerfumeCard } from "@/components/PerfumeCard";
import { getPerfume } from "@/lib/perfume-lookup";
import type { Perfume } from "@/lib/types";

export default function ExplorePage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [lookup, setLookup] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedAccords, setSelectedAccords] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Perfume[]>([]);
  const [filterResults, setFilterResults] = useState<Perfume[]>([]);
  const [mode, setMode] = useState<"search" | "filter">("search");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<Perfume | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const [fragranticaResults, setFragranticaResults] = useState<{ name: string; brand: string; url: string }[]>([]);
  const [searchingFragrantica, setSearchingFragrantica] = useState(false);

  useEffect(() => {
    Promise.all([loadCatalog(), loadLookup()]).then(([c, l]) => {
      setCatalog(c);
      setLookup(l);
      setLoading(false);
    });
  }, []);

  const fuse = useMemo(() => {
    if (catalog.length === 0) return null;
    return new Fuse(catalog, {
      keys: ["n", "b"],
      threshold: 0.35,
      distance: 100,
    });
  }, [catalog]);

  // Search catalog
  useEffect(() => {
    if (!fuse || !query.trim()) {
      setSearchResults([]);
      setFragranticaResults([]);
      return;
    }
    const results = fuse.search(query, { limit: 20 });
    setSearchResults(results.map((r) => r.item));
    // Reset Fragrantica results when query changes
    setFragranticaResults([]);
  }, [query, fuse]);

  // Filter by accords
  useEffect(() => {
    if (selectedAccords.length === 0 || catalog.length === 0) {
      setFilterResults([]);
      return;
    }

    // Find perfumes that have ALL selected accords
    const candidateSets = selectedAccords.map(
      (accord) => new Set(lookup[accord] ?? [])
    );

    // Intersection of all sets
    let intersection = candidateSets[0];
    for (let i = 1; i < candidateSets.length; i++) {
      const next = new Set<number>();
      for (const id of intersection) {
        if (candidateSets[i].has(id)) next.add(id);
      }
      intersection = next;
    }

    // Score by sum of weights for selected accords, take top 30
    const scored = Array.from(intersection)
      .filter((id) => id < catalog.length)
      .map((id) => {
        const p = catalog[id];
        let score = 0;
        for (const accord of selectedAccords) {
          score += p.aw[accord] ?? 0;
        }
        return { perfume: p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    setFilterResults(scored.map((s) => s.perfume));
  }, [selectedAccords, catalog, lookup]);

  function toggleAccord(accord: string) {
    setSelectedAccords((prev) =>
      prev.includes(accord) ? prev.filter((a) => a !== accord) : [...prev, accord]
    );
  }

  function addToSeeds(perfumeId: number) {
    dispatch({ type: "ADD_SEED", perfumeId });
  }

  function removeFromSeeds(perfumeId: number) {
    dispatch({ type: "REMOVE_SEED", perfumeId });
  }

  const isSeeded = (id: number) => state.seeds.some((p) => p.perfumeId === id);

  async function searchFragrantica() {
    if (!query.trim()) return;
    setSearchingFragrantica(true);
    setScrapeError("");
    setFragranticaResults([]);
    try {
      const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error || "Fragrantica search failed.");
        return;
      }
      setFragranticaResults(data.results ?? []);
    } catch {
      setScrapeError("Network error.");
    } finally {
      setSearchingFragrantica(false);
    }
  }

  async function handleScrape(url?: string) {
    const targetUrl = url || scrapeUrl;
    if (!targetUrl.includes("fragrantica.com/perfume/")) {
      setScrapeError("Please paste a valid Fragrantica perfume URL.");
      return;
    }
    setScraping(true);
    setScrapeError("");
    setScrapeResult(null);
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error || "Scraping failed.");
        return;
      }
      const tempId = -(state.scrapedPerfumes.length + 1);
      const perfume: Perfume = {
        id: tempId,
        n: data.name,
        b: data.brand,
        g: data.gender,
        r: data.rating,
        rc: data.ratingCount,
        aw: data.accords,
      };
      setScrapeResult(perfume);
    } catch {
      setScrapeError("Network error.");
    } finally {
      setScraping(false);
    }
  }

  function confirmScrapedPerfume() {
    if (!scrapeResult) return;
    dispatch({ type: "ADD_SCRAPED_PERFUME", perfume: scrapeResult });
    dispatch({ type: "ADD_SEED", perfumeId: scrapeResult.id });
    setScrapeResult(null);
    setScrapeUrl("");
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading 68,000 perfumes...
      </div>
    );
  }

  const displayResults = mode === "search" ? searchResults : filterResults;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-sans font-bold text-3xl font-medium text-violet-900 mb-6">Explore</h1>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-6 bg-violet-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode("search")}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
            mode === "search" ? "bg-white text-violet-900 shadow-sm" : "text-violet-500 hover:text-violet-700"
          }`}
        >
          Search
        </button>
        <button
          onClick={() => setMode("filter")}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
            mode === "filter" ? "bg-white text-violet-900 shadow-sm" : "text-violet-500 hover:text-violet-700"
          }`}
        >
          Filter by Accords
        </button>
      </div>

      {/* Search mode */}
      {mode === "search" && (
        <div className="mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search perfumes... e.g. Black Orchid, Sauvage, Flowerbomb"
            className="w-full px-4 py-3 bg-white border border-violet-200 rounded-lg text-violet-900 placeholder:text-violet-400 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
          />
        </div>
      )}

      {/* Filter mode */}
      {mode === "filter" && (
        <div className="mb-6 space-y-4">
          <p className="text-sm text-violet-500">
            Select accords you want. We&apos;ll show perfumes that match all of them.
          </p>
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
                    onClick={() => toggleAccord(accord)}
                    selected={selectedAccords.includes(accord)}
                  />
                ))}
              </div>
            </div>
          ))}
          {selectedAccords.length > 0 && (
            <button
              onClick={() => setSelectedAccords([])}
              className="text-xs text-violet-400 hover:text-violet-600 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Your Seeds */}
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
          <div className="grid gap-2">
            {state.seeds.map((pick) => {
              const p = getPerfume(pick.perfumeId, catalog, state.scrapedPerfumes);
              if (!p) return null;
              return (
                <PerfumeCard
                  key={p.id}
                  perfume={p}
                  action={
                    <button
                      onClick={() => removeFromSeeds(p.id)}
                      className="text-xs px-3 py-1.5 rounded-md border border-violet-300 text-violet-500 hover:bg-violet-100 transition-colors"
                    >
                      Remove
                    </button>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {displayResults.length > 0 && (
        <div>
          <h2 className="font-sans font-bold text-lg font-medium text-violet-900 mb-3">
            {mode === "search" ? "Search Results" : `Matching Perfumes (${filterResults.length})`}
          </h2>
          <div className="grid gap-3">
            {displayResults.map((p) => (
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
      )}

      {/* Fragrantica search — always visible when there's a query */}
      {mode === "search" && query && (
        <div className="mt-6">
          {searchResults.length === 0 && (
            <p className="text-center text-violet-500 mb-4">
              No perfumes found for &ldquo;{query}&rdquo; in our catalog.
            </p>
          )}
          <div className="bg-white border border-violet-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-sans font-bold text-lg font-medium text-violet-900">
                  Search Fragrantica
                </h3>
                <p className="text-sm text-violet-500">
                  {searchResults.length > 0
                    ? "Can\u2019t find what you\u2019re looking for? Search Fragrantica\u2019s full catalog."
                    : "We\u2019ll search Fragrantica and import the perfume for you."}
                </p>
              </div>
              <button
                onClick={searchFragrantica}
                disabled={searchingFragrantica}
                className="flex-shrink-0 px-4 py-2 rounded-md bg-violet-900 text-white text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {searchingFragrantica ? "Searching..." : "Search Fragrantica"}
              </button>
            </div>

            {/* Loading state for Fragrantica search */}
            {searchingFragrantica && (
              <div className="flex items-center gap-3 mt-3 border-t border-violet-100 pt-4 pb-2">
                <svg className="animate-spin h-5 w-5 text-violet-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-violet-500">Hang tight while we search Fragrantica...</span>
              </div>
            )}

            {/* Loading state for perfume scrape */}
            {scraping && (
              <div className="flex items-center gap-3 mt-3 border-t border-violet-100 pt-4 pb-2">
                <svg className="animate-spin h-5 w-5 text-violet-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-violet-500">Hang tight while we scrape Fragrantica...</span>
              </div>
            )}

            {/* Fragrantica search results */}
            {!searchingFragrantica && fragranticaResults.length > 0 && (
              <div className="space-y-2 mt-3 border-t border-violet-100 pt-3">
                <p className="text-xs text-violet-400">Select a perfume to import:</p>
                {fragranticaResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleScrape(r.url)}
                    disabled={scraping}
                    className="w-full text-left px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-md hover:border-violet-400 transition-colors disabled:opacity-50"
                  >
                    <span className="text-sm font-medium text-violet-900">{r.name}</span>
                    <span className="text-xs text-violet-400 ml-2">{r.brand}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Or paste URL directly */}
            {fragranticaResults.length === 0 && !searchingFragrantica && !scraping && (
              <div className="mt-3 border-t border-violet-100 pt-3">
                <p className="text-xs text-violet-400 mb-2">Or paste a Fragrantica URL directly:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    placeholder="https://www.fragrantica.com/perfume/..."
                    className="flex-1 px-3 py-2 bg-violet-50 border border-violet-200 rounded-md text-sm text-violet-900 placeholder:text-violet-400 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={() => handleScrape()}
                    disabled={scraping}
                    className="px-4 py-2 rounded-md bg-violet-900 text-white text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    {scraping ? "Fetching..." : "Import"}
                  </button>
                </div>
              </div>
            )}

            {scrapeError && (
              <p className="text-sm text-red-600 mt-2">{scrapeError}</p>
            )}

            {/* Scraped perfume confirmation */}
            {scrapeResult && (
              <div className="mt-4 space-y-3 border-t border-violet-100 pt-3">
                <p className="text-sm text-violet-500">Found this perfume — does it look right?</p>
                <PerfumeCard perfume={scrapeResult} />
                <div className="flex gap-2">
                  <button
                    onClick={confirmScrapedPerfume}
                    className="px-4 py-2 rounded-md bg-violet-900 text-white text-sm hover:bg-violet-700 transition-colors"
                  >
                    Add to Seeds
                  </button>
                  <button
                    onClick={() => setScrapeResult(null)}
                    className="px-4 py-2 rounded-md border border-violet-300 text-violet-500 text-sm hover:bg-violet-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {mode === "filter" && selectedAccords.length > 0 && filterResults.length === 0 && (
        <div className="text-center py-12 text-violet-500">
          No perfumes match all selected accords. Try removing some filters.
        </div>
      )}

      {/* Cross-link to Build */}
      <div className="mt-8 text-center">
        <p className="text-sm text-violet-400">
          Know what you want it to smell like?{" "}
          <a href="/build" className="text-violet-600 underline underline-offset-2 hover:text-violet-900 transition-colors">
            Build your ideal scent profile
          </a>
        </p>
      </div>
    </div>
  );
}
