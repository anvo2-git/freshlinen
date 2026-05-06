# Board Item Blueprint

Use this blueprint when writing a task on the live board. A good board item must be self-contained enough that a single agent can claim it and execute without asking for more context.

## What A Good Board Item Includes

1. A single owner scope.
2. One clear objective.
3. The exact house, dataset, or code area to touch.
4. The source priority the agent must follow.
5. The expected outputs and file paths.
6. The stop condition.
7. The board lifecycle rule:
   - `claim` when work starts
   - `ready` when it is ready to be pushed
   - `done` after merge

## Required Content

Write the board item notes so they answer these questions:

- What exactly should the agent do?
- What should the agent not do?
- Which sources should it use first?
- Which files should be written?
- What counts as success?
- What counts as out of scope?

## Recommended Structure

Use this structure for the notes field:

```text
Goal:
- one sentence describing the job

Inputs:
- data files
- source URLs
- prior artifacts

Steps:
1. step one
2. step two
3. step three
4. stop after this scope

Outputs:
- exact output files
- raw snapshot paths
- any validation artifact

Done when:
- clear success criteria
- explicit stop condition
```

## For Scraping Tasks

When the task is a scrape job, include:

- the house name or brand name
- whether discovery is one-time or house-specific
- whether Fragrantica is the discovery source
- whether official-site description text is required
- whether Playwright notes enrichment is required
- whether notes, accords, sillage, and longevity are required
- whether `scripts/scrape-notes.js` is the required Fragrantica entrypoint
- the exact normalized output path

## For RAG Tasks

When the task is a retrieval or evaluation job, include:

- whether the corpus is read-only
- which scripts own the implementation
- which artifacts must not be rewritten
- the exact evaluation or retrieval output expected
- the stop condition for “ready to push”

## Good Board Item Example

```text
Scrape Montale

Goal:
- Build a Montale-only scrape pass as the pilot house.

Inputs:
- docs/small-scale-scrape-pilot.md
- docs/scrape-task-breakdown.md
- frozen house queue

Steps:
1. Claim the task.
2. Use Fragrantica to discover Montale perfume pages, prioritizing current and popular perfumes.
3. Enrich each perfume with top_notes, middle_notes, base_notes, accords, sillage, and longevity when available.
4. Pull extra description text from the official site when possible.
5. Save raw snapshots for every source page.
6. Call `scripts/scrape-notes.js` or the note-enrichment wrapper to attach Fragrantica notes, accords, rating, longevity, sillage, and related-perfume data.
7. Write normalized rows to data/official-products/montale-products.jsonl.
8. Keep ambiguous matches out of auto-merge.

Outputs:
- data/official-products/montale-products.jsonl
- data/raw/montale/<timestamp>/...
- data/raw/notes/<timestamp>/...

Done when:
- a small valid Montale batch exists
- notes and accords are present where available
- the agent marks the task Ready to Push
```

## Rule Of Thumb

If an agent would need to ask “what source, what scope, what output, what stop point?” then the board item is too vague.
If the notes field answers those questions, the item is ready to assign.
