#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path

from .base import dedupe_rows, write_jsonl
from .brands.guerlain import GuerlainAdapter
from .brands.montale import MontaleAdapter
from .brands.xerjoff import XerjoffAdapter
from .brands.zara import ZaraAdapter
from ..note_enrichment import enrich_rows_with_notes


ADAPTERS = {
    "guerlain": GuerlainAdapter,
    "montale": MontaleAdapter,
    "xerjoff": XerjoffAdapter,
    "zara": ZaraAdapter,
}


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand", default="all", choices=["all", *ADAPTERS.keys()])
    parser.add_argument("--seed-file", default="data/latest-release-seeds.csv")
    parser.add_argument("--output-root", default=".")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    output_root = Path(args.output_root).resolve()
    seed_file = Path(args.seed_file).resolve()

    selected = ADAPTERS.keys() if args.brand == "all" else [args.brand]

    all_rows = []
    summary = defaultdict(lambda: defaultdict(int))

    for brand in selected:
        adapter = ADAPTERS[brand](output_root, seed_file=seed_file)
        records = adapter.run(limit=args.limit)
        if adapter.seed_rows:
            records.extend(adapter.latest_seed_records())
        json_rows = dedupe_rows([record.as_json() for record in records])
        json_rows = enrich_rows_with_notes(output_root, json_rows)
        out_path = output_root / "data" / "official-products" / f"{brand}-products.jsonl"
        write_jsonl(out_path, json_rows)
        for row in json_rows:
            summary[brand][row["source_status"]] += 1
        all_rows.extend(json_rows)
        print(f"Wrote {len(json_rows)} rows to {out_path}")

    releases_path = build_release_csv(output_root, all_rows)
    print(f"Wrote release summary to {releases_path}")
    for brand in selected:
        counts = summary[brand]
        print(
            f"{brand}: ok={counts['ok']} blocked={counts['blocked']} "
            f"error={counts['error']} seed_only={counts['seed_only']}"
        )


if __name__ == "__main__":
    main()
