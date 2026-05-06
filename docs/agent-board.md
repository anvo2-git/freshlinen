# Agent Board

This is the shared status board for parallel GPT work in this repo.

## Rules

- One row per active task or feature.
- Every task should have exactly one owner.
- The owner should be an agent name, branch, or worktree path.
- Move a task through `Backlog` -> `In Progress` -> `Blocked` -> `Done`.
- Keep PR/merge notes in the `Notes` column.

## Current Worktrees

| Agent | Branch | Worktree | Status |
| --- | --- | --- | --- |
| Scrape | `agent/scrape` | `/Users/anvo/dev/school/freshlinen-scrape` | Active |
| RAG | `agent/rag` | `/Users/anvo/dev/school/freshlinen-rag` | Active |

## Active Tasks

| Task | Owner | Branch | Status | PR / Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| Expand perfume discovery for uncovered niche houses | Scrape | `agent/scrape` | In Progress | - | Focus on houses with gap coverage but weak/no retailer discovery. |
| Improve retrieval / evaluation tooling | RAG | `agent/rag` | On Deck | - | Read-only against the current corpus snapshot. |

## Backlog

| Task | Owner | Branch | Status | Notes |
| --- | --- | --- | --- | --- |
| Add retailer discovery source for the long tail | Unassigned | - | Backlog | Needed for Montale, L'Artisan Parfumeur, Henry Jacques, and similar houses. |
| Add evaluation set for notes/accords retrieval quality | Unassigned | - | Backlog | Keep this separate from scraping work. |
| Add answer-generation API on top of the retriever | Unassigned | - | Backlog | Should wait until retrieval quality stabilizes. |

## Done

| Task | Owner | Branch | Commit | Notes |
| --- | --- | --- | --- | --- |
| Parallel worktree workflow | Codex | `main` | `5d1470d` / `438f518` / `181090e` / `fe76b56` | Added the workflow doc and the parallel-agent setup. |
| Retailer queue scrape and corpus merge | Codex | `main` | `5d1470d` | Added retailer scraping outputs and merged them into the corpus. |
| Corpus-aware discovery filtering | Codex | `main` | `438f518` | Skips discovery rows already present in the merged corpus. |

## How To Update

- When a new task starts, add a row under `Active Tasks`.
- When a task blocks, change status to `Blocked` and note the blocker.
- When a branch is ready to merge, put the commit or PR reference in `PR / Commit`.
- After merge, move the row to `Done`.

