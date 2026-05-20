"use client";

import Link from "next/link";
import { AccordPill } from "./AccordPill";
import { FavoriteButton } from "./FavoriteButton";
import { SeedButton } from "./SeedButton";
import { GENDER_SYMBOL } from "@/lib/accords";
import type { Perfume } from "@/lib/types";

export function PerfumeCard({
  perfume,
  action,
}: {
  perfume: Perfume;
  action?: React.ReactNode;
}) {
  const genderSym = GENDER_SYMBOL[perfume.g] ?? "";
  const accords = Object.entries(perfume.aw)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  return (
    <div className="bg-white border border-violet-200 rounded-lg p-4 hover:border-violet-400 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/perfume/${perfume.id}`} className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-violet-900 hover:text-violet-600 transition-colors truncate">
            {perfume.n}{" "}
            {genderSym && <span className="text-violet-400 font-light">{genderSym}</span>}
          </h3>
          {perfume.b && (
            <p className="text-xs text-violet-500 mt-0.5">{perfume.b}</p>
          )}
        </Link>
        <div className="flex-shrink-0 flex items-center gap-1">
          <SeedButton perfumeId={perfume.id} />
          <FavoriteButton perfumeId={perfume.id} />
          {action}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-violet-500">
        <span>{perfume.r.toFixed(1)} / 5</span>
        <span className="text-violet-300">|</span>
        <span>{perfume.rc.toLocaleString()} ratings</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-2.5">
        {accords.map((accord, i) => (
          <AccordPill key={accord} accord={accord} large={i < 2} />
        ))}
      </div>
    </div>
  );
}
