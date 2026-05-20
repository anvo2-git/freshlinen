"use client";

import Link from "next/link";
import { AccordPill } from "./AccordPill";
import { FavoriteButton } from "./FavoriteButton";
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
    <div className="rounded-[1.5rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,241,233,0.9))] p-4 shadow-[0_12px_35px_rgba(58,40,28,0.06)] transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/perfume/${perfume.id}`} className="flex-1 min-w-0">
          <h3 className="truncate text-base font-semibold text-stone-950 transition-colors hover:text-amber-700">
            {perfume.n}{" "}
            {genderSym && <span className="font-light text-stone-400">{genderSym}</span>}
          </h3>
          {perfume.b && (
            <p className="mt-0.5 text-xs text-stone-500">{perfume.b}</p>
          )}
        </Link>
        <div className="flex-shrink-0 flex items-center gap-1">
          <FavoriteButton perfumeId={perfume.id} />
          {action}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
        <span>{perfume.r.toFixed(1)} / 5</span>
        <span className="text-stone-300">|</span>
        <span>{perfume.rc.toLocaleString()} ratings</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {accords.map((accord, i) => (
          <AccordPill key={accord} accord={accord} large={i < 2} />
        ))}
      </div>
    </div>
  );
}
