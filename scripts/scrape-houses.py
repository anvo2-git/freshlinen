#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.official_scraper.base import dedupe_rows, write_jsonl
from scripts.official_scraper.brands.generic import GenericOfficialSiteAdapter
from scripts.official_scraper.brands.guerlain import GuerlainAdapter
from scripts.official_scraper.brands.xerjoff import XerjoffAdapter
from scripts.official_scraper.brands.zara import ZaraAdapter
from scripts.note_enrichment import enrich_rows_with_notes


SPECIAL_ADAPTERS = {
    "guerlain": GuerlainAdapter,
    "xerjoff": XerjoffAdapter,
    "zara": ZaraAdapter,
}


def load_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def build_release_csv(output_root: Path, all_rows: list[dict]) -> Path:
    out_path = output_root / "data" / "official-products" / "latest-release-enrichment.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [row for row in all_rows if row.get("release_signal")]
    with out_path.open("w", newline="", encoding="utf-8") as handle:
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
        for row in rows:
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
    return out_path


def scrape_candidate(output_root: Path, seed_file: Path, row: dict[str, str], limit: int | None) -> list[dict]:
    brand_slug = (row.get("brand_slug") or "").strip().lower()
    brand_name = (row.get("brand_name") or "").strip()
    official_url = (row.get("official_url") or "").strip()
    if not brand_name:
        return []

    if brand_slug in SPECIAL_ADAPTERS:
        adapter = SPECIAL_ADAPTERS[brand_slug](output_root, seed_file=seed_file)
    else:
        adapter = GenericOfficialSiteAdapter(
            output_root=output_root,
            brand_name=brand_name,
            official_url=official_url,
            seed_file=seed_file,
        )

    records = adapter.run(limit=limit)
    if adapter.seed_rows:
        records.extend(adapter.latest_seed_records())
    return dedupe_rows([record.as_json() for record in records])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--houses-file", default="data/house-shortlist.csv")
    parser.add_argument("--seed-file", default="data/latest-release-seeds.csv")
    parser.add_argument("--output-root", default=".")
    parser.add_argument("--limit-per-house", type=int, default=20)
    parser.add_argument("--only-top", type=int, default=None)
    args = parser.parse_args()

    output_root = Path(args.output_root).resolve()
    seed_file = Path(args.seed_file).resolve()
    houses_file = Path(args.houses_file).resolve()
    candidates = load_candidates(houses_file)
    if args.only_top:
        candidates = candidates[: args.only_top]

    all_rows: list[dict] = []
    summary: dict[str, dict[str, int]] = {}

    for row in candidates:
        brand_name = row.get("brand_name", "")
        brand_slug = row.get("brand_slug", "")
        rows = scrape_candidate(output_root, seed_file, row, limit=args.limit_per_house)
        if not rows:
            continue
        rows = enrich_rows_with_notes(output_root, rows)
        out_name = brand_slug or brand_name.lower().replace(" ", "-")
        out_path = output_root / "data" / "official-products" / f"{out_name}-products.jsonl"
        write_jsonl(out_path, rows)

        summary.setdefault(brand_name, {})
        for rec in rows:
            status = rec.get("source_status", "")
            summary[brand_name][status] = summary[brand_name].get(status, 0) + 1
        all_rows.extend(rows)
        print(f"Wrote {len(rows)} rows to {out_path}")

    releases_path = build_release_csv(output_root, all_rows)
    print(f"Wrote release summary to {releases_path}")
    for brand_name, counts in summary.items():
        print(
            f"{brand_name}: ok={counts.get('ok', 0)} blocked={counts.get('blocked', 0)} "
            f"error={counts.get('error', 0)} seed_only={counts.get('seed_only', 0)}"
        )


if __name__ == "__main__":
    main()
