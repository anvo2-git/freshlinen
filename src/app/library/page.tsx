"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { useFavorites } from "@/lib/favorites-context";
import { useApp } from "@/lib/context";
import { loadCatalog } from "@/lib/data";
import { PerfumeCard } from "@/components/PerfumeCard";
import {
  loadChatHistory,
  loadSavedRecommendations,
  type ChatHistoryEntry,
  type SavedRecommendation,
} from "@/lib/library-store";
import type { Perfume } from "@/lib/types";

function MemoryCard({ item }: { item: SavedRecommendation }) {
  const href = item.official_url || item.url;

  return (
    <article className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_14px_40px_rgba(58,40,28,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-600">
            {item.source_type.replace(/_/g, " ")}
          </div>
          <h3 className="mt-1 text-base font-semibold text-stone-950">
            {item.brand}
            <span className="mx-1 text-stone-400">/</span>
            {item.name}
          </h3>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {item.score.toFixed(1)}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-stone-700">{item.snippet}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {item.accords.slice(0, 4).map((accord) => (
          <span key={accord} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            {accord}
          </span>
        ))}
        {item.notes.slice(0, 4).map((note) => (
          <span key={note} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
            {note}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
        >
          Open source
        </a>
        {item.query ? (
          <span className="self-center text-[11px] uppercase tracking-[0.28em] text-stone-400">
            Query: {item.query}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function HistoryCard({ item }: { item: ChatHistoryEntry }) {
  return (
    <article className="rounded-[1.5rem] border border-stone-200 bg-white/80 p-4 shadow-[0_14px_40px_rgba(58,40,28,0.06)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-600">
        {new Date(item.created_at).toLocaleDateString()}
      </div>
      <h3 className="mt-2 text-base font-semibold text-stone-950">{item.query}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-700">{item.summary}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.26em] text-stone-400">
        {item.results.length} result{item.results.length === 1 ? "" : "s"}
      </p>
    </article>
  );
}

export default function LibraryPage() {
  const { userId, isLoaded } = useAuth();
  const { favoriteIds, isLoading } = useFavorites();
  const { state } = useApp();
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    loadCatalog().then((c) => {
      setCatalog(c);
      setCatalogLoading(false);
    });
  }, []);

  const storage = useMemo(() => {
    if (!isLoaded || typeof window === "undefined") return null;
    return userId ? window.localStorage : window.sessionStorage;
  }, [isLoaded, userId]);

  const savedRecommendations = useMemo(() => loadSavedRecommendations(storage), [storage]);
  const history = useMemo(() => loadChatHistory(storage), [storage]);

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-stone-500">
        Loading library...
      </div>
    );
  }

  const loading = isLoading || catalogLoading;
  const catalogMap = new Map(catalog.map((p) => [p.id, p]));
  const scrapedMap = new Map(state.scrapedPerfumes.map((p) => [p.id, p]));
  const favorites: Perfume[] = [];

  for (const id of favoriteIds) {
    const perfume = catalogMap.get(id) ?? scrapedMap.get(id);
    if (perfume) favorites.push(perfume);
  }
  favorites.sort((a, b) => a.n.localeCompare(b.n));

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_24%),linear-gradient(180deg,rgba(250,246,239,0.95),rgba(240,234,224,0.92))]" />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
              Personal memory
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-950 sm:text-5xl">
              Library
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-700">
              Favorites, saved recommendations, and recent query threads live here. Sign in to
              keep the memory with you.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
          >
            Back to chat
          </Link>
        </div>

        {!userId ? (
          <section className="mt-8 rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(255,255,255,0.9))] p-6 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
              Sign in optional
            </p>
            <h2 className="mt-3 text-2xl font-bold text-stone-950">Keep your memory across sessions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-700">
              Without sign-in, the assistant stays useful for the current browser session. Sign in
              when you want favorites, saved recommendations, and chat history to persist.
            </p>
            <div className="mt-4">
              <SignInButton mode="modal">
                <button className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800">
                  Sign in to save memory
                </button>
              </SignInButton>
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-stone-200 bg-white/80 p-5 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
              Favorites
            </div>
            <div className="mt-3 text-3xl font-black text-stone-950">{favoriteIds.size}</div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Saved perfumes from the catalog and anything you&apos;ve explicitly kept around.
            </p>
          </div>
          <div className="rounded-[2rem] border border-stone-200 bg-white/80 p-5 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
              Recommendations
            </div>
            <div className="mt-3 text-3xl font-black text-stone-950">{savedRecommendations.length}</div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Perfumes the assistant surfaced during chat and you chose to keep.
            </p>
          </div>
          <div className="rounded-[2rem] border border-stone-200 bg-white/80 p-5 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
              Query threads
            </div>
            <div className="mt-3 text-3xl font-black text-stone-950">{history.length}</div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Recent prompts and the three matches that came back for each one.
            </p>
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-5">
            <div className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,250,243,0.96),rgba(246,239,230,0.94))] p-6 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                    Saved recommendations
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-stone-950">
                    A shelf of what the assistant has already shown you
                  </h2>
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-stone-500">Loading saved items...</div>
              ) : savedRecommendations.length === 0 ? (
                <div className="mt-6 rounded-[1.5rem] border border-dashed border-stone-300 bg-white/70 p-8 text-center">
                  <p className="text-stone-600">No saved recommendations yet.</p>
                  <p className="mt-2 text-sm text-stone-500">
                    Ask the assistant for three perfumes, then tap save on any result you want to keep.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {savedRecommendations.map((item) => (
                    <MemoryCard key={`${item.doc_id}-${item.created_at}`} item={item} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                Favorites
              </div>
              {loading ? (
                <div className="py-12 text-center text-stone-500">Loading favorites...</div>
              ) : favorites.length === 0 ? (
                <div className="mt-4 rounded-[1.5rem] border border-dashed border-stone-300 bg-white/70 p-8 text-center">
                  <p className="text-stone-600">No favorites yet.</p>
                  <p className="mt-2 text-sm text-stone-500">
                    Use the heart on a perfume card once you sign in.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {favorites.map((perfume) => (
                    <PerfumeCard key={perfume.id} perfume={perfume} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-stone-200 bg-white/80 p-6 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                Recent chat
              </div>
              {history.length === 0 ? (
                <p className="mt-4 text-sm leading-relaxed text-stone-600">
                  No recent threads yet. Once you ask the assistant for perfumes, your query history
                  will appear here.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {history.map((item) => (
                    <HistoryCard key={`${item.created_at}-${item.query}`} item={item} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(255,255,255,0.9))] p-6 shadow-[0_18px_60px_rgba(58,40,28,0.08)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                How this library works
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-stone-700">
                <li>Favorites persist through Clerk + Supabase.</li>
                <li>Saved recommendation cards persist after sign-in.</li>
                <li>Anonymous sessions can still use the library for the current browser session.</li>
                <li>Everything starts from chat now, not from a separate browse flow.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
