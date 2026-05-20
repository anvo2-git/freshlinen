"use client";

import { useEffect, useState } from "react";
import { useAuth, RedirectToSignIn } from "@clerk/nextjs";
import { useFavorites } from "@/lib/favorites-context";
import { useApp } from "@/lib/context";
import { loadCatalog } from "@/lib/data";
import { PerfumeCard } from "@/components/PerfumeCard";
import type { Perfume } from "@/lib/types";

export default function FavoritesPage() {
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

  if (!isLoaded) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading...
      </div>
    );
  }

  if (!userId) {
    return <RedirectToSignIn />;
  }

  const loading = isLoading || catalogLoading;

  // Resolve favorite IDs to full perfume objects from catalog + scraped perfumes
  const catalogMap = new Map(catalog.map((p) => [p.id, p]));
  const scrapedMap = new Map(state.scrapedPerfumes.map((p) => [p.id, p]));
  const favorites: Perfume[] = [];
  for (const id of favoriteIds) {
    const p = catalogMap.get(id) ?? scrapedMap.get(id);
    if (p) favorites.push(p);
  }
  // Sort by name
  favorites.sort((a, b) => a.n.localeCompare(b.n));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-sans font-bold text-3xl text-violet-900 mb-2">
        Your Favorites
      </h1>
      <p className="text-violet-500 mb-8">
        Perfumes you&apos;ve saved. Use them as persistent taste memory alongside your
        session Seeds when you want recommendations.
      </p>

      {loading ? (
        <div className="text-center text-violet-500 py-12">
          Loading your favorites...
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-violet-400 text-lg mb-2">No favorites yet</p>
          <p className="text-violet-400 text-sm">
            Tap the heart on any perfume card to save it here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-violet-400 mb-4">
            {favorites.length} perfume{favorites.length === 1 ? "" : "s"} saved
          </p>
          <div className="grid gap-3">
            {favorites.map((p) => (
              <PerfumeCard key={p.id} perfume={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
