#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", "and")
    return "".join(ch if ch.isalnum() else "-" for ch in text).strip("-")


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def load_shortlist(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_brand_registry(path: Path) -> dict[str, dict[str, str]]:
    registry: dict[str, dict[str, str]] = {}
    if not path.exists():
        return registry
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        for row in csv.DictReader(handle):
            brand = (row.get("brand_name") or "").strip()
            if brand:
                registry[slugify(brand)] = row
    return registry


def count_corpus_brands(rows: list[dict]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for row in rows:
        brand = slugify(row.get("brand", "") or row.get("brand_name", ""))
        if brand:
            counts[brand] += 1
    return counts


def count_official_rows(official_dir: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    if not official_dir.exists():
        return counts
    for path in official_dir.glob("*-products.jsonl"):
        brand = slugify(path.name.replace("-products.jsonl", ""))
        for row in load_jsonl(path):
            if row.get("source_status") != "ok":
                continue
            counts[brand] += 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shortlist", default="data/house-shortlist.csv")
    parser.add_argument("--brand-registry", default="data/brand-registry.csv")
    parser.add_argument("--corpus", default="data/rag/perfume-documents.jsonl")
    parser.add_argument("--official-dir", default="data/official-products")
    parser.add_argument("--output", default="data/corpus-gap-report.csv")
    args = parser.parse_args()

    shortlist = load_shortlist(Path(args.shortlist))
    registry = load_brand_registry(Path(args.brand_registry))
    corpus_counts = count_corpus_brands(load_jsonl(Path(args.corpus)))
    official_counts = count_official_rows(Path(args.official_dir))

    rows: list[dict[str, str]] = []
    for house in shortlist:
        brand_name = (house.get("brand_name") or "").strip()
        brand_slug = slugify(house.get("brand_slug") or brand_name)
        reg = registry.get(brand_slug, {})
        corpus_count = corpus_counts.get(brand_slug, 0)
        official_count = official_counts.get(brand_slug, 0)
        rows.append(
            {
                "bucket": house.get("bucket", ""),
                "brand_name": brand_name,
                "brand_slug": brand_slug,
                "corpus_count": str(corpus_count),
                "official_count": str(official_count),
                "gap_count": str(max(corpus_count - official_count, 0)),
                "domain_status": reg.get("domain_status", ""),
                "official_url": reg.get("official_url", house.get("official_url", "")),
                "scraper_tier": reg.get("scraper_tier", ""),
                "priority_notes": reg.get("priority_notes", ""),
            }
        )

    rows.sort(
        key=lambda row: (
            int(row["official_count"]),
            -int(row["corpus_count"]),
            row["brand_name"].lower(),
        )
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "bucket",
                "brand_name",
                "brand_slug",
                "corpus_count",
                "official_count",
                "gap_count",
                "domain_status",
                "official_url",
                "scraper_tier",
                "priority_notes",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Wrote {len(rows)} gap rows to {output_path}")
    for row in rows[:15]:
        print(
            f"{row['brand_name']}: corpus={row['corpus_count']} official={row['official_count']} "
            f"gap={row['gap_count']} status={row['domain_status']}"
        )


if __name__ == "__main__":
    main()
