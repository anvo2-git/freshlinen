"use client";

import { useEffect, useMemo, useState } from "react";
import { displayPerfumeTitle, stripPerfumeSuffix } from "@/lib/perfume-display";

type ImageMap = Record<string, string>;

let imageMapPromise: Promise<ImageMap> | null = null;
let imageMapCache: ImageMap | null = null;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\'’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeys(brand: string, name: string): string[] {
  const cleanBrand = brand.trim();
  const cleanName = stripPerfumeSuffix(name).trim();
  const title = displayPerfumeTitle(brand, name).trim();
  return Array.from(
    new Set(
      [
        `${normalize(cleanBrand)}|${normalize(cleanName)}`,
        `${normalize(cleanBrand)}|${normalize(name)}`,
        `${normalize(cleanBrand)}|${normalize(title)}`,
        `${normalize(cleanBrand)}|${normalize(`${cleanBrand} ${cleanName}`)}`,
      ].filter(Boolean)
    )
  );
}

async function loadImageMap(): Promise<ImageMap> {
  if (imageMapCache) return imageMapCache;
  if (!imageMapPromise) {
    imageMapPromise = fetch("/data/perfume-images.json")
      .then(async (res) => {
        if (!res.ok) return {};
        return (await res.json()) as ImageMap;
      })
      .catch(() => ({}));
  }
  imageMapCache = await imageMapPromise;
  return imageMapCache;
}

export function PerfumeBottleArt({ brand, name }: { brand: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);

  const keys = useMemo(() => buildKeys(brand, name), [brand, name]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = await loadImageMap();
      if (cancelled) return;
      const found = keys.map((key) => map[key]).find(Boolean) ?? null;
      setSrc(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [keys]);

  if (!src) {
    return (
      <div className="flex h-full min-h-[120px] w-full items-center justify-center rounded-[1.35rem] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,247,236,0.95),rgba(250,244,236,0.85))] text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">
        No image
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white shadow-[0_10px_24px_rgba(58,40,28,0.08)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${displayPerfumeTitle(brand, name)} bottle`}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
