"use client";

import { useApp } from "@/lib/context";

export function SeedButton({ perfumeId }: { perfumeId: number }) {
  const { state, dispatch } = useApp();
  const isSeed = state.seeds.some((seed) => seed.perfumeId === perfumeId);
  const atCap = state.seeds.length >= 3;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSeed) {
          dispatch({ type: "REMOVE_SEED", perfumeId });
        } else if (!atCap) {
          dispatch({ type: "ADD_SEED", perfumeId });
        }
      }}
      disabled={!isSeed && atCap}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        isSeed
          ? "bg-violet-900 text-white hover:bg-violet-700"
          : "bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
      }`}
      title={isSeed ? "Remove from Seeds" : atCap ? "Seeds are limited to 3" : "Add to Seeds"}
    >
      {isSeed ? "Seeded" : "Seed"}
    </button>
  );
}
