# Parallel Agent Workflow

This repo can be worked on by two GPT agents in parallel if each agent has its own git worktree and a clear file ownership boundary.

The live status board is the app page at `/board`, backed by the shared file `/Users/anvo/.codex/memories/freshlinen-agent-board.json`.
Agents update that board through `scripts/agent-board.py`. The web page is read-only.
For detailed task handoffs, use [docs/scrape-task-breakdown.md](/Users/anvo/dev/school/freshlinen/docs/scrape-task-breakdown.md).
For writing a self-contained board item, use [docs/board-item-blueprint.md](/Users/anvo/dev/school/freshlinen/docs/board-item-blueprint.md).

## Board Lifecycle

Agents own task status updates end-to-end:

- `claim` when a task is assigned and work starts
- `ready` when the work is complete and ready to be pushed or merged
- `done` after the change has landed

The user should not manually move task status during normal work.

## Worktree Layout

Use three checkouts:

- Main integration checkout: `/Users/anvo/dev/school/freshlinen`
- Scrape worktree: `../freshlinen-scrape`
- RAG worktree: `../freshlinen-rag`

Create them from the main repo:

```bash
git checkout main
git pull

git worktree add ../freshlinen-scrape -b agent/scrape
git worktree add ../freshlinen-rag -b agent/rag
```

Optional integration worktree:

```bash
git worktree add ../freshlinen-integrate -b agent/integrate
```

## File Ownership

Scrape agent owns:

- `scripts/discover-*`
- `scripts/scrape-*`
- `scripts/official_scraper/*`
- `data/official-products/*`
- `data/retailer-products/*`
- scrape-facing docs such as the scraping sections of `README.md` and `data/official-scraper-plan.md`

RAG agent owns:

- `scripts/build-rag-corpus.py`
- `scripts/query-rag.py`
- future retrieval, reranking, or evaluation scripts
- RAG-focused docs and tests

RAG agent must treat these as read-only:

- `data/rag/perfume-documents.jsonl`
- `data/rag/manifest.json`
- all generated scrape artifacts

## Terminal Setup

- Terminal 1: `cd ../freshlinen-scrape`
- Terminal 2: `cd ../freshlinen-rag`

Run one GPT agent per terminal/worktree.

## Commit Flow

Each agent should commit only its own files.

Scrape agent:

```bash
git status --short
git add <only scrape-owned files>
git commit -m "..."
```

RAG agent:

```bash
git status --short
git add <only rag-owned files>
git commit -m "..."
```

Rules:

- Keep commits small and scoped to one branch.
- Do not commit shared/generated corpus files from the RAG branch.
- Do not let both branches edit the same doc file unless the owner is explicit.

## Merge Flow

Merge into `main` from the integration checkout, one branch at a time.

Recommended order:

1. Merge `agent/scrape`
2. Rebuild derived data if needed, from the main checkout
3. Merge `agent/rag`

Example:

```bash
cd /Users/anvo/dev/school/freshlinen
git checkout main
git pull

git merge agent/scrape
python3 scripts/build-rag-corpus.py
git merge agent/rag
```

If you want linear history, rebase first:

```bash
git checkout agent/scrape
git rebase main

git checkout agent/rag
git rebase main

git checkout main
git merge agent/scrape
git merge agent/rag
```

## Practical Rule

- Scraping produces new raw/product files.
- RAG improves code against the existing corpus snapshot.
- Rebuild `data/rag/perfume-documents.jsonl` only after scrape work lands.
- If both agents need docs, assign docs to one owner or split by file so they don’t overlap.
