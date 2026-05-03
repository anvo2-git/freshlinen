from __future__ import annotations

import json
import csv
import subprocess
import tempfile
from pathlib import Path
from functools import lru_cache
import re


def make_note_query(row: dict[str, str]) -> str:
    brand = (row.get("brand_name") or "").strip()
    product = (row.get("product_name") or "").strip()
    parts = [part for part in [brand, product] if part]
    return " ".join(parts).strip()


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", "and")
    return "".join(ch if ch.isalnum() else "-" for ch in text).strip("-")


@lru_cache(maxsize=1)
def load_catalog_url_index() -> dict[tuple[str, str], str]:
    catalog_path = Path("/home/anvo23/projects/perfume-rec/data/catalog_70k.csv")
    index: dict[tuple[str, str], str] = {}
    if not catalog_path.exists():
        return index
    with catalog_path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            url = (row.get("url") or "").strip()
            name = (row.get("Name") or "").strip()
            if not url or not name:
                continue
            brand_match = ""
            if "/perfume/" in url:
                parts = url.split("/perfume/", 1)[1].split("/", 1)
                brand_match = parts[0].replace("-", " ").strip()
            brand_slug = slugify(brand_match)
            name_slug = slugify(name.replace(row.get("Gender", "") or "", "").strip())
            if brand_slug and name_slug and (brand_slug, name_slug) not in index:
                index[(brand_slug, name_slug)] = url
    return index


def resolve_note_source_url(row: dict[str, str]) -> str:
    brand_slug = slugify(row.get("brand_name", ""))
    product_slug = slugify(row.get("product_name", ""))
    index = load_catalog_url_index()
    if brand_slug and product_slug:
        exact = index.get((brand_slug, product_slug))
        if exact:
            return exact

    if product_slug:
        matches = [
            url
            for (indexed_brand, indexed_name), url in index.items()
            if indexed_name == product_slug or product_slug in indexed_name or indexed_name in product_slug
        ]
        if brand_slug:
            branded = [
                url
                for (indexed_brand, indexed_name), url in index.items()
                if indexed_brand == brand_slug and (
                    indexed_name == product_slug
                    or product_slug in indexed_name
                    or indexed_name in product_slug
                )
            ]
            if branded:
                return branded[0]
        if matches:
            return matches[0]
    return ""


def _tokenize(value: str) -> list[str]:
    tokens = re.split(r"[^a-z0-9]+", slugify(value))
    return [token for token in tokens if token and len(token) > 1]


def is_confident_match(row: dict[str, str], note_row: dict[str, str]) -> bool:
    product_tokens = _tokenize(row.get("product_name", ""))
    brand_tokens = _tokenize(row.get("brand_name", ""))
    title = (note_row.get("title") or "").lower()
    url = (note_row.get("resolved_url") or note_row.get("url") or "").lower()
    haystack = f"{title} {url}"
    if not product_tokens:
        return False

    matched_product = sum(1 for token in product_tokens if token in haystack)
    matched_brand = sum(1 for token in brand_tokens if token in haystack)
    if matched_product >= max(1, len(product_tokens) // 2):
        return True
    if matched_product >= 1 and matched_brand >= 1:
        return True
    return False


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def enrich_rows_with_notes(output_root: Path, rows: list[dict], limit: int | None = None) -> list[dict]:
    repo_root = output_root.resolve()
    url_candidates: list[str] = []
    query_candidates: list[str] = []
    row_sources: dict[str, str] = {}
    seen_urls: set[str] = set()
    seen_queries: set[str] = set()
    for row in rows:
        if row.get("source_status") != "ok":
            continue
        note_url = resolve_note_source_url(row)
        query = make_note_query(row)
        if note_url and note_url not in seen_urls:
            seen_urls.add(note_url)
            url_candidates.append(note_url)
            row_sources[note_url] = query
        elif query and query not in seen_queries:
            seen_queries.add(query)
            query_candidates.append(query)
            row_sources[query] = query
        if limit and len(url_candidates) + len(query_candidates) >= limit:
            break

    if not url_candidates and not query_candidates:
        return rows

    with tempfile.TemporaryDirectory(prefix="note-enrichment-") as tmpdir:
        output_path = Path(tmpdir) / "notes.jsonl"
        query_args: list[str] = []
        for url in url_candidates:
            query_args.extend(["--url", url])
        for query in query_candidates:
            query_args.extend(["--query", query])
        cmd = [
            "node",
            "scripts/scrape-notes.js",
            *query_args,
            "--output",
            str(output_path),
            "--quiet",
        ]
        subprocess.run(cmd, cwd=repo_root, check=True)
        note_rows = _load_jsonl(output_path)

    notes_by_url = {row.get("resolved_url") or row.get("url", ""): row for row in note_rows if row.get("resolved_url") or row.get("url")}
    notes_by_query = {row.get("query", ""): row for row in note_rows if row.get("query")}

    for row in rows:
        note_url = resolve_note_source_url(row)
        query = make_note_query(row)
        note_row = None
        if note_url:
            note_row = notes_by_url.get(note_url)
        if not note_row and query:
            note_row = notes_by_query.get(query)
        if not note_row or note_row.get("error"):
            continue
        if not is_confident_match(row, note_row):
            continue

        top_notes = note_row.get("top_notes") or []
        middle_notes = note_row.get("middle_notes") or []
        base_notes = note_row.get("base_notes") or []
        accords = note_row.get("accords") or []
        key_notes = []
        for note in [*top_notes, *middle_notes, *base_notes]:
            if note not in key_notes:
                key_notes.append(note)

        row["top_notes"] = top_notes
        row["middle_notes"] = middle_notes
        row["base_notes"] = base_notes
        row["key_notes"] = key_notes
        row["accord_text"] = ", ".join(accords)

        extra = row.get("extra") if isinstance(row.get("extra"), dict) else {}
        extra = dict(extra)
        extra.update(
            {
                "notes_query": query,
                "notes_source": note_row.get("source", ""),
                "notes_source_url": note_row.get("resolved_url") or note_row.get("url", ""),
                "notes_rating_value": note_row.get("rating_value", ""),
                "notes_longevity_value": note_row.get("longevity_value", ""),
                "notes_sillage_value": note_row.get("sillage_value", ""),
            }
        )
        row["extra"] = extra

    return rows
