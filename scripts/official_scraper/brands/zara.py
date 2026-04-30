from __future__ import annotations

import re

from ..base import BrandAdapter, ScrapeRecord


class ZaraAdapter(BrandAdapter):
    brand_name = "Zara"
    brand_slug = "zara"
    base_url = "https://www.zara.com"
    collection_url = "https://www.zara.com/us/en/woman-beauty-perfumes-l1415.html"

    def list_product_urls(self) -> list[str]:
        urls = {row["source_url"] for row in self.seed_rows if row.get("source_url")}
        try:
            html = self.fetch_text(self.collection_url)
            self.save_raw("collection", html)
            matches = re.findall(r'/us/en/[^"\'?# ]+-p\d+\.html', html)
            for match in matches:
                urls.add(f"{self.base_url}{match}")
        except Exception:
            pass
        return sorted(urls)

    def parse_product(self, url: str) -> ScrapeRecord:
        seed = next((row for row in self.seed_rows if row.get("source_url") == url), {})
        try:
            html = self.fetch_text(url)
        except Exception as exc:
            return ScrapeRecord(
                brand_name=self.brand_name,
                official_url=url,
                product_name=seed.get("product_name", ""),
                collection=seed.get("collection", ""),
                release_signal=seed.get("release_signal", "blocked"),
                source_type="official_site",
                scraped_at=self.run_id,
                source_status="blocked",
                match_hint=f"{self.brand_name} {seed.get('product_name', '')}".strip(),
                extra={"error": str(exc), "seed_notes": seed.get("notes", "")},
            )
        raw_path = self.save_raw(url.rsplit("/", 1)[-1].replace(".html", ""), html)
        if "bm-verify" in html or "/_sec/verify" in html or "interstitial" in html.lower():
            return ScrapeRecord(
                brand_name=self.brand_name,
                official_url=url,
                product_name=seed.get("product_name", ""),
                collection=seed.get("collection", ""),
                release_signal=seed.get("release_signal", "bot challenge"),
                source_type="official_site",
                scraped_at=self.run_id,
                raw_html_path=raw_path,
                source_status="blocked",
                match_hint=f"{self.brand_name} {seed.get('product_name', '')}".strip(),
                extra={"blocked": True, "notes": seed.get("notes", "")},
            )
        title_match = re.search(r"<title>(.*?)</title>", html, flags=re.S | re.I)
        title = title_match.group(1).strip() if title_match else ""
        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=title,
            source_type="official_site",
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            match_hint=f"{self.brand_name} {title}".strip(),
        )
