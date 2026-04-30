# Project Proposal: PerfumeRAG — A RAG Evaluation Workbench

## One-Line Description
A web-based workbench for building, iterating on, and rigorously evaluating a RAG pipeline over a 68,000-perfume knowledge base — with live RAGAS metrics.

## The Problem
RAG systems are easy to build but hard to evaluate well. Most tutorials show you how to get *something* working, but don't teach you how to know if it's actually good — or how to measure whether a change made it better or worse. This project uses perfume as a domain (rich, relational, subjective queries) to build a serious evaluation harness around a RAG pipeline, with the goal of deeply understanding what makes retrieval and generation quality measurable.

## Target User
Primarily the builder (me) — this is a learning project. Secondary audience: anyone who wants to see a real RAG evaluation workflow in action, with visible metrics and a UI that makes the pipeline's internals legible.

## Core Features (v1)
1. **Natural language query interface** — ask questions like "find me something woody but not heavy, good for winter" and get ranked perfume recommendations with source context shown
2. **RAG pipeline with swappable components** — chunking strategy, embedding model, retrieval method (dense, sparse, hybrid) configurable via the UI or config
3. **RAGAS evaluation dashboard** — run an eval suite and see Faithfulness, Context Precision, Context Recall, and Answer Relevancy scores update in real time
4. **Eval dataset builder** — generate and store a test set of (question, ground truth) pairs to run repeatable evaluations against
5. **Experiment log** — track which pipeline configuration produced which scores, so you can compare iterations over time

## Tech Stack
- **Frontend**: Next.js (web UI, evaluation dashboard, query interface)
- **Styling**: Tailwind CSS
- **Backend**: FastAPI (Python) — RAG pipeline, RAGAS evaluation runner, embedding logic
- **Database**: Supabase with pgvector — stores perfume documents, embeddings, eval datasets, experiment logs
- **Auth**: Clerk (lightweight — mainly to persist experiment logs per user)
- **APIs**: OpenAI API (embeddings + generation), RAGAS (evaluation framework), optionally Cohere Rerank for re-ranking experiments
- **Deployment**: Vercel (frontend) + Railway or Fly.io (FastAPI backend)
- **MCP Servers**: Supabase MCP (database operations), Playwright MCP (UI testing)

## Stretch Goals
- **Re-ranking experiments**: plug in Cohere Rerank or a cross-encoder and measure whether it improves Context Precision
- **Chunking strategy comparison**: fixed-size vs. sentence-window vs. semantic chunking — visualize how chunk boundaries affect retrieval
- **Hallucination deep-dive**: build a per-answer faithfulness checker that highlights which parts of the answer are grounded vs. fabricated
- **GraphRAG layer**: model relationships between accords, fragrance families, and perfume houses as a graph and compare graph-augmented retrieval vs. pure vector search
- **Public eval leaderboard**: let others submit RAG pipeline configs and compare RAGAS scores

## Biggest Risk
**RAGAS runs on LLM calls** — every evaluation is expensive and slow (it calls an LLM to judge faithfulness, relevancy, etc.). Running evals in real time on every query could be slow and costly. Mitigation: run evals asynchronously on a fixed test set, not on live queries. Also, RAGAS scores can be noisy with small test sets — need to build a large enough eval dataset to get stable numbers.

Second risk: **FastAPI + Next.js is two codebases** — more operational complexity than a pure Next.js app. Mitigation: containerize the FastAPI service early and treat it as a black-box API.

## Week 5 Goal
By end of week 1: a working end-to-end RAG pipeline (perfume data ingested into Supabase pgvector, basic retrieval working, answers generated via OpenAI) with a minimal Next.js UI that shows queries and retrieved context. RAGAS evaluation running on a small hand-crafted test set of 10–20 questions, with scores visible in the UI. The pipeline doesn't need to be good — it just needs to be measurable.

Ian: excited to put my grubby hands on this, but also quite worried that there just *isn't* enough scrapable perfume data online. I'll do some digging to see if it is the case. If it is, I'll attempt to vibecode a scraper and see where we get. Otherwise, get fucked Ian, I'll switch to a RAG on cooking (I've had a brief idea of a cooking LLM that incorporates an anti-knowledge base from food science)... or, perhaps, if all else fails... a SaaS B2B 3 White Monster 10 instance claude code from 2PM to 2AM with the bros to-do list startup idea.