# Scrape Task Breakdown

This doc breaks the scraping work into agent-sized tasks with clear inputs, outputs, and stop conditions. Each task should be executable by one agent without extra context.

## Shared Rules

- Check the existing corpus first: `data/rag/perfume-documents.jsonl`.
- Do not scrape URLs already represented in the merged corpus unless the goal is to improve missing notes or fix a broken record.
- Save raw snapshots for every new source page under `data/raw/...`.
- Write normalized product rows to `data/official-products/...` or `data/retailer-products/...`.
- Treat notes and accords as first-class fields, not optional extras.
- Use the shared board at `/board`:
  - `claim` when you start
  - `ready` when the code/data is finished and waiting to be pushed
  - `done` after merge

## Source Priority

Use sources in this order:

1. Fragrantica for house discovery, loaded through Playwright.
2. Fragrantica for perfume-name discovery inside each house, prioritizing current and popular perfumes, loaded through Playwright.
3. Use Playwright to load every Fragrantica page for `top_notes`, `middle_notes`, `base_notes`, `accords`, `sillage`, and `longevity` when available. Do not rely on plain HTTP fetches for Fragrantica. Route this through `scripts/scrape-notes.js` or the note-enrichment wrapper.
4. Official house websites for additional text descriptions and metadata.
5. Retailer pages or Parfumo only when Fragrantica or official pages are incomplete.

## Task 1: Build the one-time house discovery queue

**Goal**

Produce one filtered, frozen queue of perfume URLs for uncovered niche houses. This is a one-time pass. Do not repeat it in parallel per house.

**Inputs**

- `data/corpus-gap-report.csv`
- `data/house-shortlist.csv`
- `data/rag/perfume-documents.jsonl`
- retailer pages, Fragrantica pages, and any brand registry entries that expose new perfume URLs

**Steps**

1. Pick the highest-gap houses from the gap report.
2. Use Fragrantica to confirm house names and the perfume pages that belong to each house.
3. Prefer current releases and popular perfumes within each house before older or obscure listings.
4. Use retailer and official-site sources only to fill gaps in the Fragrantica discovery set.
5. Extract candidate perfume URLs and brand names.
6. Filter out anything already present in the merged corpus.
7. Write the final queue as CSV.
8. Keep a small sample of rejected or ambiguous rows for review.

**Output**

- `data/retailer-perfume-discovery.csv` or a new batch-specific CSV
- updated notes in the board item

**Done when**

- The queue contains only new perfume candidates.
- Duplicate corpus rows are excluded.
- The top uncovered houses are represented in the queue.
- The queue is treated as frozen input for all later house scrapes.

## Task 2: Scrape Montale end to end

**Goal**

Create a normalized scrape pass for Montale with raw snapshots, product rows, Fragrantica discovery, notes enrichment, and official-site description capture. This is a single-house assignment.

**Inputs**

- Montale official site and any stable collection pages
- `data/latest-release-seeds.csv`
- Fragrantica URLs if the official site is missing product detail pages

**Steps**

1. Add a dedicated adapter under `scripts/official_scraper/brands/`.
2. Use the frozen house queue plus Fragrantica loaded through Playwright to enumerate the Montale perfume pages that matter most, especially current and popular fragrances.
3. Implement `list_product_urls()` for the official site and/or Fragrantica fallback.
4. Implement `parse_product(url)` to capture:
   - product name
   - collection
   - description
   - price
   - sizes
   - release signal
5. Save raw HTML for every fetched product page.
6. Run the brand through the existing runner.
7. Verify notes, accords, sillage, and longevity are present after enrichment from `scripts/scrape-notes.js`.
8. Add official-site description text if the page provides it.
9. Do not expand into other houses.

**Output**

- `data/official-products/montale-products.jsonl`
- `data/official-products/latest-release-enrichment.csv`
- `data/raw/montale/<timestamp>/...`

**Done when**

- The adapter produces a stable batch of Montale rows.
- Scraped rows are deduped.
- Notes and accords are populated where the source allows it.

## Task 3: Scrape L'Artisan Parfumeur end to end

**Goal**

Create a normalized scrape pass for L'Artisan Parfumeur with the same fields and confidence rules as the other brands. This agent owns only this house.

**Inputs**

- L'Artisan Parfumeur official site
- retailer fallback URLs if the official site is sparse
- Fragrantica note pages for enrichment

**Steps**

1. Add a brand adapter or generic mapping for the house.
2. Use the frozen house queue plus Fragrantica to discover the main perfume pages for the house, then rank current and popular releases first.
3. Crawl collection or product pages on the official site for text-based description enrichment.
4. Parse JSON-LD, meta tags, and visible text for product metadata.
5. Save raw HTML snapshots.
6. Enrich the resulting rows with notes, accords, sillage, and longevity using `scripts/scrape-notes.js` or the note-enrichment wrapper.
7. Write the normalized JSONL output.
8. Do not broaden the task to other houses.

**Output**

- `data/official-products/l-artisan-parfumeur-products.jsonl`
- raw HTML snapshots under `data/raw/l-artisan-parfumeur/<timestamp>/...`

**Done when**

- At least a small but valid batch of products is produced.
- Notes and accords are filled when Fragrantica or Parfumo coverage exists.
- Unclear matches remain excluded from auto-merge.

## Task 4: Scrape Henry Jacques end to end

**Goal**

Create a scrape pass for Henry Jacques, even if the site requires a more manual crawl strategy. This agent owns only this house.

**Inputs**

- Henry Jacques official site
- retailer discovery rows
- Fragrantica/Parfumo pages for notes and accords

**Steps**

1. Use the frozen house queue plus Fragrantica to map the Henry Jacques perfume universe first.
2. Identify the official collection and product page pattern.
3. Implement URL discovery and product parsing.
4. Preserve raw HTML for every fetched page.
5. Emit normalized rows with `source_status` set correctly.
6. Run notes enrichment after parsing with `scripts/scrape-notes.js`.
7. Extract additional description text from the house website if possible.
8. Check whether the site needs a one-off adapter or can stay generic.
9. Do not broaden the task to other houses.

**Output**

- `data/official-products/henry-jacques-products.jsonl`
- raw HTML snapshots in `data/raw/henry-jacques/<timestamp>/...`

**Done when**

- The run yields valid, non-duplicate rows.
- The adapter path is documented for future reruns.

## Task 5: Validate notes and accords coverage

**Goal**

Verify that new scrape outputs actually contain the important fields: notes and accords.

**Inputs**

- newly generated `data/official-products/*.jsonl`
- `data/notes/*.jsonl`
- sample URLs from Fragrantica and Parfumo

**Steps**

1. Sample 5 to 10 rows from each new brand output.
2. Confirm `top_notes`, `middle_notes`, `base_notes`, and `accord_text` are populated.
3. Check whether the fallback source is Fragrantica or Parfumo.
4. Flag rows that only have metadata but no notes.
5. Fix the scraper or enrichment rules if the notes are missing for common pages.

**Output**

- a short validation note in the board task
- any code fix needed to improve notes coverage

**Done when**

- The important note fields are present on the majority of valid rows.
- Missing notes are explained by source limitations, not parser bugs.

## Suggested Parallel Split

These tasks can be run in parallel once the one-time house queue exists:

- one agent builds and freezes the house discovery queue
- one agent claims Montale end to end
- one agent claims L'Artisan Parfumeur end to end
- one agent claims Henry Jacques end to end
- one agent validates notes and accords coverage

If only two agents are available, finish the one-time discovery queue first, then split the house scrape tasks between them.
