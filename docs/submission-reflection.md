# Submission Reflection

This phase focused on expanding the scraping system and making it safe to run in parallel.

## What We Built

- Expanded the scraping scope from a few official-brand adapters to a house-based pipeline.
- Added a shared board and status lifecycle so agents can claim work, mark it ready to push, and mark it done.
- Set up git worktrees so multiple agents can work in isolation at the same time.
- Added a live board page and shared board file outside the worktrees.
- Wrote a reusable board-item blueprint so individual tasks can be self-contained.
- Added a Fragrantica-first scraping pipeline for house discovery, perfume discovery, and Fragrantica-enriched notes/accords extraction.

## Pilot Scraping

- Ran a small-scale pilot on Montale to validate the end-to-end house workflow.
- Followed that with another house scrape on L'Artisan Parfumeur to confirm the pipeline generalized beyond the first house.
- The pilot flow now uses:
  - Fragrantica discovery through Playwright
  - `scripts/scrape-notes.js` for notes, accords, sillage, longevity, and related-perfume data
  - official-site scraping for base product metadata and descriptions when available

## Why It Matters

- The project now has a repeatable way to assign one house to one agent.
- Tasks are clearer because each board item can be written as a self-contained handoff.
- The scraping pipeline now prioritizes the most important perfume data: notes and accords, with performance data when available.

## Next Steps

1. Scale scraping across many more houses using the same house-by-house workflow.
2. Keep the board and worktree setup as the coordination layer for parallel agents.
3. Build the Retriever on top of the growing corpus so the scraped data can power search, retrieval, and answer generation.

