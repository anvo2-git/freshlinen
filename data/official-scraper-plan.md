# Official Site Scraper Plan

Prepared on `2026-04-28` for the first enrichment wave.

## Objective

Build and run a repeatable scraper that enriches the existing perfume dataset from official brand sites, starting with brands that:

- have strong catalog coverage in `data/brand-registry.csv`
- are currently fetchable without a headless browser war
- expose recent or new fragrance listings on official pages

The first execution wave targets:

1. `Guerlain`
2. `Zara`
3. `Xerjoff`

The next wave expands that fixed list into a two-step pipeline:

1. do a one-time house discovery pass from Fragrantica home/news plus the current registry
2. freeze that house queue, then assign each agent one house at a time for end-to-end scraping

The current working shortlist lives in `data/house-shortlist.csv` and is the source of truth for the next scrape pass. It currently focuses on roughly 50 niche houses. The exploratory output in `data/house-candidates.csv` is kept only as a discovery aid.
For perfume discovery, always filter new Fragrantica/retailer candidates against the existing corpus in `data/rag/perfume-documents.jsonl` before scraping so we do not overscrape perfumes we already have.
Use the corpus gap report to prioritize houses with weak coverage, then use retailer listings as the first discovery source for new product URLs.
The retailer discovery queue is scraped into `data/retailer-products/`, which the corpus builder now merges alongside official products.

## Deliverables

1. A reusable adapter interface for brand sites
2. Raw crawl snapshots for replay/debugging
3. A normalized enrichment dataset for official perfumes
4. A latest-release seed set merged into the enrichment queue
5. A command that can be rerun without manual intervention

## Execution Plan

### Phase 1: Scaffold the scraper

Create a Python scraper package under `scripts/official_scraper/` with:

- `base.py`
  - `list_products()`
  - `parse_product(url)`
  - `normalize_record(raw_record)`
- `brands/guerlain.py`
- `brands/zara.py`
- `brands/xerjoff.py`
- `runner.py`
- `brands/generic.py`

Shared normalized output schema:

- `brand_name`
- `official_url`
- `product_name`
- `collection`
- `description`
- `top_notes`
- `middle_notes`
- `base_notes`
- `key_notes`
- `accord_text`
- `size_options`
- `price_text`
- `release_signal`
- `source_type`
- `scraped_at`
- `raw_html_path`

### Phase 2: Discovery strategy per brand

Use brand-specific collection pages first, then crawl product detail pages.

- `Guerlain`
  - new arrivals page
  - fragrance featured page
  - official fragrance collection page
- `Zara`
  - fragrance category page
  - directly seeded recent product pages
- `Xerjoff`
  - official new arrivals collection
  - journal posts for release context

### Phase 2b: House discovery strategy

Build a candidate list once before scraping:

1. Pull prominent brands from Fragrantica's home page.
2. Pull active release mentions from Fragrantica news.
3. Merge in the current `data/brand-registry.csv` and `data/latest-release-seeds.csv`.
4. Bucket the resulting houses into:
   - popular
   - high-end
   - niche
   - other
5. Sample the exploratory discovery output when you want to widen the queue later.

This avoids over-sampling only the biggest catalog houses.
Do not rerun house discovery in parallel for each house scrape; use the frozen queue as input for the house-specific tasks.

For the actual scrape queue, prefer the curated shortlist over the exploratory dump:

- `data/house-shortlist.csv` - stable reviewable queue of 50 niche houses
- `data/house-candidates.csv` - exploratory, algorithmic discovery output

### Phase 3: Storage strategy

Write three artifacts per run:

1. `data/raw/<brand>/<timestamp>/...html`
2. `data/official-products/<brand>-products.jsonl`
3. `data/official-products/latest-release-enrichment.csv`

Keep the raw HTML so parsers can be debugged without hitting the site again.

### Phase 4: Matching strategy

Match official products back to the Kaggle corpus using:

1. normalized brand slug exact match
2. normalized product name exact match
3. fallback fuzzy match on `brand + perfume name`
4. manual review bucket for unresolved matches

Do not auto-merge ambiguous matches.

### Phase 5: Initial execution order

Run in this order:

1. `Xerjoff`
  - smallest surface area
  - explicit new-arrivals page
  - likely fastest path to a working adapter
2. `Guerlain`
  - richer text and structured merchandising
  - useful for RAG enrichment quality
3. `Zara`
  - highest volume among fetchable targets
  - likely messier front-end behavior, but worth it once the pipeline is stable

For the balanced discovery queue, keep the one-time first pass small, inspect the resulting mix, and then freeze the list before house-level scraping begins.

### Phase 6: Definition of done

The overnight enrichment pass is successful if it produces:

- `>= 100` normalized official product records across the first three brands
- `>= 10` current release records from official pages
- raw snapshots for every fetched product page
- a machine-readable unresolved-match queue

## Latest Release Seeds

Use `data/latest-release-seeds.csv` as the first queue.

It currently includes official release candidates from:

- `Guerlain`
- `Zara`
- `Xerjoff`

## Risks

1. Front-end rendered category pages may hide product URLs from plain HTML.
2. Locale redirects may create unstable URLs.
3. Product naming on official sites may not exactly match the Kaggle corpus.
4. Some pages may expose notes only in images or embedded JSON.
5. Notes and performance metrics are often better sourced from Fragrantica or Parfumo than from official brand sites.

## Mitigations

1. Save raw responses and inspect embedded JSON before escalating to headless tools.
2. Canonicalize URLs after redirects.
3. Separate scraping from matching so parser work is not blocked by dedup logic.
4. Start with the seed set even if collection crawling is imperfect.
5. Use a notes-first Playwright pass before merging official-site metadata into the corpus.
6. Keep the discovery queue corpus-aware, and skip rows already present in the merged corpus.

## Notes Source Priority

For note-heavy enrichment, prefer this order:

1. Exact Fragrantica URLs from the existing catalog
2. Fragrantica perfume pages
3. Parfumo perfume pages
4. Official brand pages when they explicitly list notes
5. Retailers like Sephora or Ulta when they expose key notes
6. Descriptions and tags only as a last resort

## Discovery Source Priority

For queue-building, prefer this order:

1. Fragrantica for house discovery
2. Fragrantica for perfume discovery within each house, prioritizing current and popular perfumes
3. Retailer or brand-site discovery only when Fragrantica is incomplete
4. Corpus-aware filtering before any scrape run

The implementation now runs a notes enrichment pass automatically after each house scrape and keeps only high-confidence matches, so the output prefers correctness over overfitting search results.

## Next Commands

Suggested commands for the first autonomous implementation pass:

```bash
npm run brand-registry
python3 scripts/discover-houses.py
python3 scripts/scrape-houses.py --houses-file data/house-candidates.csv --only-top 20
python3 scripts/official_scraper/runner.py --brand xerjoff
python3 scripts/official_scraper/runner.py --brand guerlain
python3 scripts/official_scraper/runner.py --brand zara
python3 scripts/official_scraper/runner.py --seed-file data/latest-release-seeds.csv
```
