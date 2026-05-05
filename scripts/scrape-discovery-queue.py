#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.note_enrichment import enrich_rows_with_notes
from scripts.official_scraper.base import dedupe_rows, slugify, write_jsonl
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


def load_brand_slugs(raw_slugs: str | None, brands_file: Path | None) -> list[str]:
    brand_slugs: list[str] = []

    if raw_slugs:
        for slug in raw_slugs.split(","):
            normalized = slugify(slug.strip())
            if normalized:
                brand_slugs.append(normalized)

    if brands_file and brands_file.exists():
        with brands_file.open(encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                normalized = slugify(line)
                if normalized:
                    brand_slugs.append(normalized)

    seen: set[str] = set()
    ordered: list[str] = []
    for slug in brand_slugs:
        if slug in seen:
            continue
        seen.add(slug)
        ordered.append(slug)
    return ordered


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


def make_adapter(brand_slug: str, brand_name: str, official_url: str, output_root: Path):
    adapter_cls = SPECIAL_ADAPTERS.get(brand_slug, GenericOfficialSiteAdapter)
    if adapter_cls is GenericOfficialSiteAdapter:
        return adapter_cls(
            output_root=output_root,
            brand_name=brand_name,
            official_url=official_url,
            seed_file=None,
        )
    return adapter_cls(output_root, seed_file=None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--discovery", default="data/retailer-perfume-discovery.csv")
    parser.add_argument("--existing-corpus", default="data/rag/perfume-documents.jsonl")
    parser.add_argument("--output-root", default=".")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--brands", type=int, default=None)
    parser.add_argument("--brand-slugs", default=None)
    parser.add_argument("--brands-file", default=None)
    args = parser.parse_args()

    repo_root = Path(args.output_root).resolve()
    discovery_rows = load_rows(Path(args.discovery))
    existing = load_existing_keys(Path(args.existing_corpus))

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in discovery_rows:
        brand_slug = slugify(row.get("brand_slug") or row.get("brand_name", ""))
        if not brand_slug:
            continue
        grouped[brand_slug].append(row)

    selected_brand_slugs = load_brand_slugs(
        args.brand_slugs,
        Path(args.brands_file) if args.brands_file else None,
    )
    if selected_brand_slugs:
        selected_brand_slugs = [slug for slug in selected_brand_slugs if slug in grouped]
    else:
        selected_brand_slugs = sorted(grouped.keys())
        if args.brands:
            selected_brand_slugs = selected_brand_slugs[: args.brands]

    all_rows: list[dict] = []
    summary: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for brand_slug in selected_brand_slugs:
        rows = grouped[brand_slug]
        brand_name = rows[0].get("brand_name", "")
        official_url = rows[0].get("official_url", "")
        adapter = make_adapter(brand_slug, brand_name, official_url, repo_root)

        scraped: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for row in rows:
            product_url = (row.get("product_url") or "").strip()
            product_name_guess = (row.get("product_name_guess") or "").strip()
            key = (brand_slug, slugify(product_name_guess) or product_url)
            if key in existing:
                summary[brand_name]["existing"] += 1
                continue
            if not product_url or key in seen:
                continue
            seen.add(key)
            try:
                record = adapter.parse_product(product_url)
                scraped.append(record.as_json())
            except Exception as exc:
                scraped.append(
                    {
                        "brand_name": brand_name,
                        "official_url": product_url,
                        "product_name": product_name_guess,
                        "collection": "",
                        "description": "",
                        "top_notes": [],
                        "middle_notes": [],
                        "base_notes": [],
                        "key_notes": [],
                        "accord_text": "",
                        "size_options": [],
                        "price_text": "",
                        "release_signal": "",
                        "source_type": "official_site",
                        "scraped_at": "",
                        "raw_html_path": "",
                        "source_status": "error",
                        "source_id": "",
                        "match_hint": f"{brand_name} {product_name_guess}".strip(),
                        "extra": {"error": str(exc), "discovery_source": "retailer_listing"},
                    }
                )
            if args.limit and len(scraped) >= args.limit:
                break

        if not scraped:
            continue

        scraped = dedupe_rows(scraped)
        scraped = enrich_rows_with_notes(repo_root, scraped)
        out_dir = repo_root / "data" / "retailer-products"
        out_path = out_dir / f"{brand_slug}-products.jsonl"
        write_jsonl(out_path, scraped)

        all_rows.extend(scraped)
        for row in scraped:
            summary[brand_name][row.get("source_status", "")] += 1
        print(f"Wrote {len(scraped)} rows to {out_path}")

    releases = [row for row in all_rows if row.get("release_signal")]
    release_path = repo_root / "data" / "retailer-products" / "latest-release-enrichment.csv"
    release_path.parent.mkdir(parents=True, exist_ok=True)
    with release_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "product_name",
                "collection",
                "official_url",
                "release_signal",
                "source_status",
                "price_text",
                "match_hint",
            ],
        )
        writer.writeheader()
        for row in releases:
            writer.writerow(
                {
                    "brand_name": row.get("brand_name", ""),
                    "product_name": row.get("product_name", ""),
                    "collection": row.get("collection", ""),
                    "official_url": row.get("official_url", ""),
                    "release_signal": row.get("release_signal", ""),
                    "source_status": row.get("source_status", ""),
                    "price_text": row.get("price_text", ""),
                    "match_hint": row.get("match_hint", ""),
                }
            )

    print(f"Wrote release summary to {release_path}")
    for brand_name, counts in summary.items():
        print(
            f"{brand_name}: ok={counts.get('ok', 0)} blocked={counts.get('blocked', 0)} "
            f"error={counts.get('error', 0)} existing={counts.get('existing', 0)}"
        )


if __name__ == "__main__":
    main()
