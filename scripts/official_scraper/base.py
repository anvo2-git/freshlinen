from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def strip_tags(value: str) -> str:
    value = re.sub(r"<script.*?</script>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<style.*?</style>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def read_seed_rows(seed_file: Path | None, brand_name: str) -> list[dict[str, str]]:
    if not seed_file or not seed_file.exists():
        return []
    with seed_file.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = [row for row in reader if row.get("brand_name") == brand_name]
    return rows


def ensure_json_serializable(value):
    if isinstance(value, dict):
        return {key: ensure_json_serializable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [ensure_json_serializable(item) for item in value]
    return value


@dataclass
class ScrapeRecord:
    brand_name: str
    official_url: str
    product_name: str = ""
    collection: str = ""
    description: str = ""
    top_notes: list[str] = field(default_factory=list)
    middle_notes: list[str] = field(default_factory=list)
    base_notes: list[str] = field(default_factory=list)
    key_notes: list[str] = field(default_factory=list)
    accord_text: str = ""
    size_options: list[str] = field(default_factory=list)
    price_text: str = ""
    release_signal: str = ""
    source_type: str = "official_site"
    scraped_at: str = ""
    raw_html_path: str = ""
    source_status: str = "ok"
    source_id: str = ""
    match_hint: str = ""
    extra: dict[str, object] = field(default_factory=dict)

    def as_json(self) -> dict[str, object]:
        return {
            "brand_name": self.brand_name,
            "official_url": self.official_url,
            "product_name": self.product_name,
            "collection": self.collection,
            "description": self.description,
            "top_notes": self.top_notes,
            "middle_notes": self.middle_notes,
            "base_notes": self.base_notes,
            "key_notes": self.key_notes,
            "accord_text": self.accord_text,
            "size_options": self.size_options,
            "price_text": self.price_text,
            "release_signal": self.release_signal,
            "source_type": self.source_type,
            "scraped_at": self.scraped_at,
            "raw_html_path": self.raw_html_path,
            "source_status": self.source_status,
            "source_id": self.source_id,
            "match_hint": self.match_hint,
            "extra": ensure_json_serializable(self.extra),
        }


class BrandAdapter:
    brand_name = ""
    brand_slug = ""
    base_url = ""

    def __init__(self, output_root: Path, seed_file: Path | None = None):
        self.output_root = output_root
        self.seed_rows = read_seed_rows(seed_file, self.brand_name)
        self.headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        self.run_id = now_utc()
        self.raw_dir = output_root / "data" / "raw" / self.brand_slug / self.run_id
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def fetch_text(self, url: str, extra_headers: dict[str, str] | None = None) -> str:
        headers = dict(self.headers)
        if extra_headers:
            headers.update(extra_headers)
        request = Request(url, headers=headers)
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", errors="ignore")

    def fetch_json(self, url: str, extra_headers: dict[str, str] | None = None):
        return json.loads(self.fetch_text(url, extra_headers=extra_headers))

    def save_raw(self, name: str, text: str, suffix: str = ".html") -> str:
        safe_name = slugify(name)[:90] or "raw"
        path = self.raw_dir / f"{safe_name}{suffix}"
        path.write_text(text, encoding="utf-8")
        return str(path.relative_to(self.output_root))

    def list_product_urls(self) -> list[str]:
        raise NotImplementedError

    def parse_product(self, url: str) -> ScrapeRecord:
        raise NotImplementedError

    def latest_seed_records(self) -> list[ScrapeRecord]:
        records: list[ScrapeRecord] = []
        for row in self.seed_rows:
            records.append(
                ScrapeRecord(
                    brand_name=self.brand_name,
                    official_url=row.get("source_url", ""),
                    product_name=row.get("product_name", ""),
                    collection=row.get("collection", ""),
                    release_signal=row.get("release_signal", ""),
                    source_type="official_seed",
                    scraped_at=self.run_id,
                    source_status="seed_only",
                    match_hint=f"{self.brand_name} {row.get('product_name', '')}".strip(),
                    extra={"seed_notes": row.get("notes", "")},
                )
            )
        return records

    def run(self, limit: int | None = None) -> list[ScrapeRecord]:
        records: list[ScrapeRecord] = []
        seen = set()
        for url in self.list_product_urls():
            if url in seen:
                continue
            seen.add(url)
            try:
                records.append(self.parse_product(url))
            except Exception as exc:
                records.append(
                    ScrapeRecord(
                        brand_name=self.brand_name,
                        official_url=url,
                        scraped_at=self.run_id,
                        source_status="error",
                        source_type="official_site",
                        extra={"error": str(exc)},
                    )
                )
            if limit and len(records) >= limit:
                break
        return records


def write_jsonl(path: Path, rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")
