# Small-Scale Scrape Pilot

Goal: validate the full house-level scrape workflow on one house before expanding the queue.

## Pilot House

- Montale

## Why Montale

- It is already on the frozen niche-house list.
- It is a real niche house with enough catalog depth to exercise discovery, notes enrichment, and official-site description capture.
- It is small enough to verify the workflow without turning the first test into a large batch run.

## Agent Task

Give one scrape agent the Montale house only.

The agent should:

1. Claim the board item `Scrape Montale` with owner `Scrape` and branch `agent/scrape`.
2. Read `docs/scrape-task-breakdown.md` and this pilot doc before changing code.
3. Use Fragrantica first for Montale perfume-name discovery, prioritizing current and popular perfumes, and load those Fragrantica pages through Playwright only.
4. Use Playwright to load every Fragrantica page for discovery and note extraction. Do not use plain HTTP fetches for Fragrantica. Then enrich each perfume with:
   - top notes
   - middle notes
   - base notes
   - accords
   - sillage when available
   - longevity when available
5. Visit the official Montale site, if possible, to collect extra description text and metadata.
6. Save raw snapshots for every fetched source page.
7. Write normalized rows to `data/official-products/montale-products.jsonl`.
8. Keep unmatched or ambiguous rows out of auto-merge.
9. When the Montale pass is complete and ready to be pushed, update the board item to `Ready to Push`.
10. Commit only scrape-owned files.

## Success Criteria

- At least a small, valid Montale batch is produced.
- Notes and accords are present for the matched pages.
- Raw snapshots exist for every fetched page.
- The agent can complete the task without asking for additional project context.

## Next Step After Pilot

If the Montale run works, split the next houses one-per-agent from the frozen shortlist.
