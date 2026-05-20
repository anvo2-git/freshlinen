"use client";

import { displayPerfumeTitle } from "@/lib/perfume-display";

type PerfumeHeadingProps = {
  brand: string;
  name: string;
  className?: string;
  brandClassName?: string;
  nameClassName?: string;
};

export function PerfumeHeading({
  brand,
  name,
  className = "",
  brandClassName = "",
  nameClassName = "",
}: PerfumeHeadingProps) {
  const cleanBrand = brand.trim();
  const cleanName = displayPerfumeTitle(brand, name);

  return (
    <div className={className}>
      {cleanBrand ? (
        <div
          className={`text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 ${brandClassName}`}
        >
          {cleanBrand}
        </div>
      ) : null}
      <div className={`display-font leading-[0.92] text-stone-950 ${nameClassName}`}>{cleanName}</div>
    </div>
  );
}
