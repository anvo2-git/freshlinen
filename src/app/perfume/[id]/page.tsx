"use client";

import { useState, useEffect, use } from "react";
import { loadCatalog, loadLookup } from "@/lib/data";
import { recommendForSeed } from "@/lib/similarity";
import { useApp } from "@/lib/context";
import { AccordPill } from "@/components/AccordPill";
import { PerfumeCard } from "@/components/PerfumeCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SeedButton } from "@/components/SeedButton";
import { getPerfume } from "@/lib/perfume-lookup";
import { displayPerfumeTitle } from "@/lib/perfume-display";
import type { Perfume } from "@/lib/types";

export default function PerfumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, dispatch } = useApp();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [lookup, setLookup] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState<Perfume[]>([]);
  const [notes, setNotes] = useState("");
  const [userRating, setUserRating] = useState<number | null>(null);
  const [brandInfo, setBrandInfo] = useState<{
    title: string;
    extract: string;
    thumbnail: string | null;
    url: string | null;
  } | null>(null);

  const perfumeId = parseInt(id, 10);
  const perfume = getPerfume(perfumeId, catalog, state.scrapedPerfumes) ?? null;
  const isSeeded = state.seeds.some((p) => p.perfumeId === perfumeId);

  useEffect(() => {
    Promise.all([loadCatalog(), loadLookup()]).then(([c, l]) => {
      setCatalog(c);
      setLookup(l);
      setLoading(false);
    });
  }, []);

  // Load personal notes from context
  useEffect(() => {
    const existing = state.personalNotes[perfumeId];
    if (existing) {
      setNotes(existing.notes);
      setUserRating(existing.rating);
    }
  }, [state.personalNotes, perfumeId]);

  // Fetch Wikipedia brand info (external API, via our server route)
  useEffect(() => {
    if (!perfume?.b) {
      setBrandInfo(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/brand/${encodeURIComponent(perfume.b)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.found) {
          setBrandInfo({
            title: data.title,
            extract: data.extract,
            thumbnail: data.thumbnail,
            url: data.url,
          });
        } else {
          setBrandInfo(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBrandInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [perfume?.b]);

  // Compute similar perfumes
  useEffect(() => {
    if (!perfume || !catalog.length) return;
    const exclude = new Set([perfumeId]);
    const recs = recommendForSeed(perfume, catalog, lookup, exclude, 5);
    setSimilar(recs.map(([recId]) => getPerfume(recId, catalog, state.scrapedPerfumes)).filter(Boolean) as Perfume[]);
  }, [perfume, catalog, lookup, perfumeId]);

  function saveNote() {
    dispatch({
      type: "SET_PERSONAL_NOTE",
      perfumeId,
      note: { notes, rating: userRating },
    });
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading...
      </div>
    );
  }

  if (!perfume) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-violet-500">
        Perfume not found.
      </div>
    );
  }

  const accords = Object.entries(perfume.aw)
    .sort((a, b) => b[1] - a[1])
    .map(([name, weight]) => ({ name, weight }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-sans font-bold text-3xl md:text-4xl font-medium text-violet-900">
              {displayPerfumeTitle(perfume.b, perfume.n)}
            </h1>
            {perfume.b && (
              <p className="text-violet-500 mt-1">{perfume.b}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SeedButton perfumeId={perfumeId} />
            <FavoriteButton perfumeId={perfumeId} />
            <button
              onClick={() =>
                isSeeded
                  ? dispatch({ type: "REMOVE_SEED", perfumeId })
                  : dispatch({ type: "ADD_SEED", perfumeId })
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSeeded
                  ? "border border-violet-300 text-violet-600 hover:bg-violet-100"
                  : "bg-violet-900 text-white hover:bg-violet-700"
              }`}
            >
              {isSeeded ? "Remove from Seeds" : "+ Add to Seeds"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-sm text-violet-500">
          <span className="font-medium text-violet-700">{perfume.r.toFixed(1)} / 5</span>
          <span className="text-violet-300">|</span>
          <span>{perfume.rc.toLocaleString()} ratings</span>
        </div>
      </div>

      {/* Accords */}
      <div className="mb-8">
        <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-3">Accords</h2>
        <div className="space-y-2">
          {accords.map(({ name, weight }, i) => (
            <div key={name} className="flex items-center gap-3">
              <AccordPill accord={name} large={i < 2} />
              <div className="flex-1 h-2 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-400 rounded-full transition-all"
                  style={{ width: `${weight}%` }}
                />
              </div>
              <span className="text-xs text-violet-400 w-8 text-right">{weight}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* About the house — from Wikipedia via /api/brand/[name] */}
      {brandInfo && brandInfo.extract && (
        <div className="mb-8 bg-white border border-violet-200 rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h2 className="font-sans font-bold text-xl font-medium text-violet-900">
              About {brandInfo.title}
            </h2>
            {brandInfo.url && (
              <a
                href={brandInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-500 hover:text-violet-900 underline-offset-4 hover:underline flex-shrink-0 pt-1"
              >
                Wikipedia →
              </a>
            )}
          </div>
          <div className="flex items-start gap-4">
            {brandInfo.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandInfo.thumbnail}
                alt={brandInfo.title}
                className="w-20 h-20 object-cover rounded-md border border-violet-100 flex-shrink-0"
              />
            )}
            <p className="text-sm text-violet-700 leading-relaxed">
              {brandInfo.extract}
            </p>
          </div>
        </div>
      )}

      {/* Personal Notes Form */}
      <div className="mb-8 bg-white border border-violet-200 rounded-lg p-5">
        <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-3">Your Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add your personal notes about this perfume..."
          rows={3}
          className="w-full px-3 py-2 bg-violet-50 border border-violet-200 rounded-md text-sm text-violet-900 placeholder:text-violet-400 focus:outline-none focus:border-violet-400 resize-none"
        />
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-violet-500">Your rating:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setUserRating(star === userRating ? null : star)}
                  className={`w-7 h-7 rounded-full text-sm transition-colors ${
                    userRating && star <= userRating
                      ? "bg-violet-900 text-white"
                      : "bg-violet-100 text-violet-400 hover:bg-violet-200"
                  }`}
                >
                  {star}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={saveNote}
            className="ml-auto px-4 py-1.5 rounded-md bg-violet-900 text-white text-sm hover:bg-violet-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Similar Perfumes */}
      {similar.length > 0 && (
        <div>
          <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-3">Similar Perfumes</h2>
          <div className="grid gap-3">
            {similar.map((p) => (
              <PerfumeCard key={p.id} perfume={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
