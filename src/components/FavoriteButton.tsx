"use client";

import { useAuth } from "@clerk/nextjs";
import { useFavorites } from "@/lib/favorites-context";

export function FavoriteButton({ perfumeId }: { perfumeId: number }) {
  const { userId } = useAuth();
  const { favoriteIds, addFavorite, removeFavorite } = useFavorites();

  if (!userId) return null;

  const isFavorite = favoriteIds.has(perfumeId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isFavorite) {
          removeFavorite(perfumeId);
        } else {
          addFavorite(perfumeId);
        }
      }}
      className={`rounded-full border p-1.5 transition-colors ${
        isFavorite
          ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "border-stone-200 bg-white text-stone-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
      }`}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isFavorite ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={isFavorite ? 0 : 1.5}
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}
