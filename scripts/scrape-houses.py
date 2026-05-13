#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.official_scraper.base import dedupe_rows, slugify, write_jsonl
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

FRAGRANTICA_SEARCH_HELPER = REPO_ROOT / "scripts" / "fetch-fragrantica-search.js"
FRAGRANTICA_NOTES_HELPER = REPO_ROOT / "scripts" / "scrape-notes.js"


def load_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_jsonl_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


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
            if brand and url:
                existing.add((brand, url))
    return existing


def fetch_fragrantica_search_urls(query: str) -> list[str]:
    completed = subprocess.run(
        ["node", str(FRAGRANTICA_SEARCH_HELPER), query],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        href = str(item.get("href", "")).strip()
        if not href:
            continue
        if not href.startswith("http"):
            href = f"https://www.fragrantica.com{href}"
        if "/perfume/" not in href or href in seen:
            continue
        seen.add(href)
        urls.append(href)
    return urls


def build_fragrantica_latest_rows(
    brand_name: str,
    brand_slug: str,
    existing: set[tuple[str, str]],
    limit: int = 3,
) -> list[dict]:
    queries = [
        f"{brand_name} new fragrance",
        f"{brand_name} latest fragrance",
        brand_name,
    ]
    urls: list[str] = []
    seen_urls: set[str] = set()
    for query in queries:
        try:
            results = fetch_fragrantica_search_urls(query)
        except Exception as exc:
            print(f"warning: fragrantica search failed for {brand_name} ({query}): {exc}")
            continue
        for href in results:
            if href in seen_urls or (brand_slug, href) in existing:
                continue
            seen_urls.add(href)
            urls.append(href)
            if len(urls) >= limit:
                break
        if len(urls) >= limit:
            break

    if not urls:
        return []

    with tempfile.TemporaryDirectory(prefix="fragrantica-latest-") as tmpdir:
        output_path = Path(tmpdir) / "notes.jsonl"
        cmd = ["node", str(FRAGRANTICA_NOTES_HELPER)]
        for url in urls:
            cmd.extend(["--url", url])
        cmd.extend(["--output", str(output_path), "--quiet"])
        try:
            subprocess.run(cmd, cwd=REPO_ROOT, check=True)
        except subprocess.CalledProcessError as exc:
            print(f"warning: fragrantica latest browser launch failed for {brand_name}: {exc}")
            return []
        note_rows = load_jsonl_rows(output_path)

    rows: list[dict] = []
    for note_row in note_rows:
        if note_row.get("error"):
            continue
        resolved_url = note_row.get("resolved_url") or note_row.get("url", "")
        title = (note_row.get("title") or "").strip()
        if not title or not resolved_url:
            continue
        product_slug = slugify(title)
        if (brand_slug, resolved_url) in existing or (brand_slug, product_slug) in existing:
            continue
        top_notes = note_row.get("top_notes") or []
        middle_notes = note_row.get("middle_notes") or []
        base_notes = note_row.get("base_notes") or []
        accords = note_row.get("accords") or []
        release_signal = note_row.get("notes_launch_year", "") or "fragrantica latest"
        source_status = "blocked" if note_row.get("blocked") else "ok"
        rows.append(
            {
                "brand_name": brand_name,
                "brand_slug": brand_slug,
                "product_name": title,
                "product_slug": product_slug,
                "official_url": resolved_url,
                "source_url": resolved_url,
                "source_type": "fragrantica",
                "source_status": source_status,
                "description": note_row.get("meta_description", ""),
                "collection": note_row.get("notes_family", ""),
                "top_notes": top_notes,
                "middle_notes": middle_notes,
                "base_notes": base_notes,
                "key_notes": list(dict.fromkeys([*top_notes, *middle_notes, *base_notes])),
                "accord_text": ", ".join(accords),
                "size_options": [],
                "price_text": "",
                "price_value": "",
                "release_signal": release_signal,
                "raw_html_path": note_row.get("raw_path", ""),
                "rating_value": note_row.get("rating_value", ""),
                "rating_count": note_row.get("rating_count", ""),
                "year": note_row.get("notes_launch_year", ""),
                "launch_year": note_row.get("notes_launch_year", ""),
                "gender": note_row.get("notes_gender", ""),
                "notes_source": "fragrantica",
                "notes_source_url": resolved_url,
                "notes_family": note_row.get("notes_family", ""),
                "notes_gender": note_row.get("notes_gender", ""),
                "notes_launch_year": note_row.get("notes_launch_year", ""),
                "notes_nose": note_row.get("notes_nose", ""),
                "longevity_value": note_row.get("longevity_value", ""),
                "longevity_votes": note_row.get("longevity_votes", ""),
                "sillage_value": note_row.get("sillage_value", ""),
                "sillage_votes": note_row.get("sillage_votes", ""),
                "similar_perfumes": note_row.get("similar_perfumes", []),
                "similar_perfumes_user_votes": note_row.get("similar_perfumes_user_votes", []),
                "notes_status_summary": note_row.get("status_summary", {}),
                "notes_user_status": note_row.get("user_status", {}),
                "season_scores": note_row.get("season_scores", []),
                "text": "\n".join(
                    part
                    for part in [
                        f"Perfume: {title}",
                        f"Brand: {brand_name}",
                        f"Brand slug: {brand_slug}",
                        f"Product slug: {product_slug}",
                        "Source type: fragrantica",
                        f"Source status: {source_status}",
                        f"Description: {note_row.get('meta_description', '')}",
                        f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                        f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                        f"Base notes: {', '.join(base_notes)}" if base_notes else "",
                        f"Accords: {', '.join(accords)}" if accords else "",
                        "Notes source: fragrantica",
                        f"Notes source URL: {resolved_url}",
                        f"Rating value: {note_row.get('rating_value', '')}" if note_row.get("rating_value") else "",
                        f"Rating count: {note_row.get('rating_count', '')}" if note_row.get("rating_count") else "",
                        f"Launch year: {note_row.get('notes_launch_year', '')}" if note_row.get("notes_launch_year") else "",
                    ]
                    if part
                ),
                "extra": {
                    "notes_source": "fragrantica",
                    "notes_source_url": resolved_url,
                    "notes_rating_value": note_row.get("rating_value", ""),
                    "notes_rating_count": note_row.get("rating_count", ""),
                    "notes_reviews_count": note_row.get("reviews_count", ""),
                    "notes_meta_description": note_row.get("meta_description", ""),
                    "notes_family": note_row.get("notes_family", ""),
                    "notes_gender": note_row.get("notes_gender", ""),
                    "notes_launch_year": note_row.get("notes_launch_year", ""),
                    "notes_nose": note_row.get("notes_nose", ""),
                    "notes_status_summary": note_row.get("status_summary", {}),
                    "notes_user_status": note_row.get("user_status", {}),
                    "notes_season_scores": note_row.get("season_scores", []),
                    "notes_longevity_value": note_row.get("longevity_value", ""),
                    "notes_longevity_votes": note_row.get("longevity_votes", ""),
                    "notes_sillage_value": note_row.get("sillage_value", ""),
                    "notes_sillage_votes": note_row.get("sillage_votes", ""),
                    "notes_similar_perfumes": note_row.get("similar_perfumes", []),
                    "notes_similar_perfumes_user_votes": note_row.get("similar_perfumes_user_votes", []),
                },
            }
        )
        existing.add((brand_slug, resolved_url))
        existing.add((brand_slug, product_slug))
    return rows


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


def scrape_candidate(
    output_root: Path,
    seed_file: Path,
    row: dict[str, str],
    limit: int | None,
    existing: set[tuple[str, str]],
    fragrantica_limit: int,
) -> list[dict]:
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
    scraped = dedupe_rows([record.as_json() for record in records])
    if fragrantica_limit > 0:
        scraped.extend(build_fragrantica_latest_rows(brand_name, brand_slug, existing, limit=fragrantica_limit))
    return dedupe_rows(scraped)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--houses-file", default="data/house-shortlist.csv")
    parser.add_argument("--seed-file", default="data/latest-release-seeds.csv")
    parser.add_argument("--output-root", default=".")
    parser.add_argument("--limit-per-house", type=int, default=20)
    parser.add_argument("--fragrantica-limit", type=int, default=3)
    parser.add_argument("--existing-corpus", default="data/rag/perfume-documents.jsonl")
    parser.add_argument("--only-top", type=int, default=None)
    args = parser.parse_args()

    output_root = Path(args.output_root).resolve()
    seed_file = Path(args.seed_file).resolve()
    houses_file = Path(args.houses_file).resolve()
    existing = load_existing_keys(Path(args.existing_corpus).resolve())
    candidates = load_candidates(houses_file)
    if args.only_top:
        candidates = candidates[: args.only_top]

    all_rows: list[dict] = []
    summary: dict[str, dict[str, int]] = {}

    for row in candidates:
        brand_name = row.get("brand_name", "")
        brand_slug = row.get("brand_slug", "")
        try:
            rows = scrape_candidate(
                output_root,
                seed_file,
                row,
                limit=args.limit_per_house,
                existing=existing,
                fragrantica_limit=args.fragrantica_limit,
            )
        except Exception as exc:
            print(f"warning: failed to scrape {brand_name} ({brand_slug}): {exc}")
            continue
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
