#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.official_scraper.base import slugify
from scripts.official_scraper.brands.generic import GenericOfficialSiteAdapter
from scripts.official_scraper.brands.guerlain import GuerlainAdapter
from scripts.official_scraper.brands.xerjoff import XerjoffAdapter
from scripts.official_scraper.brands.zara import ZaraAdapter


SPECIAL_ADAPTERS = {
    "guerlain": GuerlainAdapter,
    "xerjoff": XerjoffAdapter,
    "zara": ZaraAdapter,
}


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_existing_keys(corpus_path: Path) -> set[tuple[str, str]]:
    existing: set[tuple[str, str]] = set()
    if not corpus_path.exists():
        return existing
    with corpus_path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            brand = slugify(row.get("brand", "") or row.get("brand_name", ""))
            name = slugify(row.get("name", "") or row.get("product_name", ""))
            url = (row.get("url") or row.get("official_url") or "").strip()
            if brand and name:
                existing.add((brand, name))
            if url:
                existing.add((brand, url))
    return existing


def guess_name_from_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        return ""
    slug = path.rsplit("/", 1)[-1]
    slug = re.sub(r"-p\d+$", "", slug, flags=re.I)
    slug = re.sub(r"\.[a-z0-9]+$", "", slug, flags=re.I)
    slug = slug.replace("-", " ").replace("_", " ").strip()
    return slug.title()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--houses-file", default="data/house-shortlist.csv")
    parser.add_argument("--brand-registry", default="data/brand-registry.csv")
    parser.add_argument("--existing-corpus", default="data/rag/perfume-documents.jsonl")
    parser.add_argument("--output", default="data/retailer-perfume-discovery.csv")
    parser.add_argument("--limit-brands", type=int, default=12)
    parser.add_argument("--source", choices=["shortlist", "registry", "both"], default="both")
    args = parser.parse_args()

    shortlist = load_rows(Path(args.houses_file))
    registry = load_rows(Path(args.brand_registry))
    existing = load_existing_keys(Path(args.existing_corpus))

    candidates: list[dict[str, str]] = []
    if args.source in {"shortlist", "both"}:
        candidates.extend(shortlist)
    if args.source in {"registry", "both"}:
        candidates.extend(registry)

    selected = []
    seen_brands: set[str] = set()
    for row in candidates:
        brand_name = (row.get("brand_name") or "").strip()
        brand_slug = slugify(row.get("brand_slug") or brand_name)
        if not brand_name or not brand_slug or brand_slug in seen_brands:
            continue
        seen_brands.add(brand_slug)
        selected.append(row)
        if len(selected) >= args.limit_brands:
            break

    output_rows: list[dict[str, str]] = []
    skipped_existing = 0
    discovered_seen: set[tuple[str, str]] = set()

    for row in selected:
        brand_name = (row.get("brand_name") or "").strip()
        brand_slug = slugify(row.get("brand_slug") or brand_name)
        official_url = (row.get("official_url") or "").strip()
        if not brand_name:
            continue

        adapter_cls = SPECIAL_ADAPTERS.get(brand_slug, GenericOfficialSiteAdapter)
        if adapter_cls is GenericOfficialSiteAdapter:
            adapter = adapter_cls(
                output_root=REPO_ROOT,
                brand_name=brand_name,
                official_url=official_url,
                seed_file=None,
            )
        else:
            adapter = adapter_cls(REPO_ROOT, seed_file=None)

        for url in adapter.list_product_urls():
            if not url:
                continue
            name_guess = guess_name_from_url(url)
            key = (brand_slug, slugify(name_guess) or url)
            if key in existing or (brand_slug, url) in existing:
                skipped_existing += 1
                continue
            if key in discovered_seen:
                continue
            discovered_seen.add(key)
            output_rows.append(
                {
                    "brand_name": brand_name,
                    "brand_slug": brand_slug,
                    "product_name_guess": name_guess,
                    "product_url": url,
                    "official_url": official_url,
                    "discovery_source": "retailer_listing",
                }
            )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "brand_slug",
                "product_name_guess",
                "product_url",
                "official_url",
                "discovery_source",
            ],
        )
        writer.writeheader()
        for row in output_rows:
            writer.writerow(row)

    print(f"Wrote {len(output_rows)} retailer discoveries to {output_path}")
    print(f"Skipped {skipped_existing} rows already present in the merged corpus")
    for brand_slug in sorted({row["brand_slug"] for row in output_rows}):
        count = sum(1 for row in output_rows if row["brand_slug"] == brand_slug)
        print(f"{brand_slug}: {count}")


if __name__ == "__main__":
    main()
