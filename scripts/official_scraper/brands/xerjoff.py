from __future__ import annotations

import re
from html import unescape
from urllib.parse import urljoin

from ..base import BrandAdapter, ScrapeRecord, strip_tags


class XerjoffAdapter(BrandAdapter):
    brand_name = "Xerjoff"
    brand_slug = "xerjoff"
    base_url = "https://www.xerjoff.com"
    collection_url = "https://www.xerjoff.com/en-us/collections/new-arrivals"

    def __init__(self, output_root, seed_file=None):
        super().__init__(output_root, seed_file=seed_file)
        self._collection_urls: set[str] | None = None

    def list_product_urls(self) -> list[str]:
        if self._collection_urls is not None:
            return sorted(self._collection_urls)
        html = self.fetch_text(self.collection_url)
        self.save_raw("new-arrivals", html)
        paths = set(re.findall(r'/en-us/products/[^"\'?# ]+', html))
        urls = {urljoin(self.base_url, path) for path in paths}
        for row in self.seed_rows:
            urls.add(row["source_url"])
        self._collection_urls = urls
        return sorted(urls)

    def parse_product(self, url: str) -> ScrapeRecord:
        if "/products/" not in url:
            seed = next((row for row in self.seed_rows if row.get("source_url") == url), {})
            return ScrapeRecord(
                brand_name=self.brand_name,
                official_url=url,
                product_name=seed.get("product_name", ""),
                collection=seed.get("collection", ""),
                release_signal=seed.get("release_signal", "seed context"),
                source_type="official_seed",
                scraped_at=self.run_id,
                source_status="seed_only",
                match_hint=f"{self.brand_name} {seed.get('product_name', '')}".strip(),
                extra={"seed_notes": seed.get("notes", "")},
            )
        handle = url.rstrip("/").rsplit("/", 1)[-1]
        json_url = f"{self.base_url}/products/{handle}.js"
        data = self.fetch_json(json_url)
        raw_path = self.save_raw(handle, __import__("json").dumps(data, ensure_ascii=True, indent=2), ".json")

        description = strip_tags(data.get("description", ""))
        variants = data.get("variants", [])
        size_options = []
        if variants:
            for variant in variants:
                title = variant.get("public_title") or variant.get("title")
                if title and title != "Default Title":
                    size_options.append(title)
        price_text = ""
        if variants and variants[0].get("price") is not None:
            price_text = f"USD {variants[0]['price'] / 100:.2f}"

        release_signal = "new arrivals collection" if url in self.list_product_urls() else ""

        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=data.get("title", ""),
            collection="New Arrivals",
            description=description,
            size_options=size_options,
            price_text=price_text,
            release_signal=release_signal,
            source_type="official_site",
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            source_id=str(data.get("id", "")),
            match_hint=f"{self.brand_name} {data.get('title', '')}",
            extra={
                "handle": data.get("handle", ""),
                "tags": data.get("tags", []),
                "product_type": data.get("type", ""),
                "vendor": data.get("vendor", ""),
                "images": data.get("images", []),
            },
        )
