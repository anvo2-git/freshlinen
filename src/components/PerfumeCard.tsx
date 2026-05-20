"use client";

import Link from "next/link";
import { AccordPill } from "./AccordPill";
import { FavoriteButton } from "./FavoriteButton";
import { PerfumeBottleArt } from "./PerfumeBottleArt";
import { PerfumeHeading } from "./PerfumeHeading";
import { SeedButton } from "./SeedButton";
import type { Perfume } from "@/lib/types";

export function PerfumeCard({
  perfume,
  action,
}: {
  perfume: Perfume;
  action?: React.ReactNode;
}) {
  const accords = Object.entries(perfume.aw)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  return (
    <div className="group relative overflow-hidden rounded-[1.75rem] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,241,232,0.95),rgba(243,232,220,0.92))] p-4 shadow-[0_18px_50px_rgba(58,40,28,0.08)] transition-transform hover:-translate-y-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(234,179,8,0.9),rgba(168,85,247,0.85))]" />
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <Link href={`/perfume/${perfume.id}`} className="block">
          <PerfumeBottleArt brand={perfume.b} name={perfume.n} />
        </Link>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/perfume/${perfume.id}`} className="flex-1 min-w-0">
              <PerfumeHeading
                brand={perfume.b}
                name={perfume.n}
                nameClassName="text-3xl font-semibold transition-colors group-hover:text-amber-700"
              />
            </Link>
            <div className="flex-shrink-0 flex items-center gap-1">
              <SeedButton perfumeId={perfume.id} />
              <FavoriteButton perfumeId={perfume.id} />
              {action}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-stone-600">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
              {perfume.r.toFixed(1)} / 5
            </span>
            <span className="text-stone-300">•</span>
            <span>{perfume.rc.toLocaleString()} ratings</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {accords.map((accord, i) => (
              <AccordPill key={accord} accord={accord} large={i < 2} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
