#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def ensure_index(db_path: Path, docs_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS perfume_docs USING fts5(doc_id, brand, name, url, text, release_signal)"
    )
    existing = conn.execute("SELECT count(*) FROM perfume_docs").fetchone()[0]
    if existing == 0:
        with docs_path.open(encoding="utf-8") as handle:
            rows = [json.loads(line) for line in handle if line.strip()]
        conn.executemany(
            "INSERT INTO perfume_docs(doc_id, brand, name, url, text, release_signal) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    row["doc_id"],
                    row.get("brand", ""),
                    row.get("name", ""),
                    row.get("url", ""),
                    row.get("text", ""),
                    row.get("release_signal", ""),
                )
                for row in rows
            ],
        )
        conn.commit()
    return conn


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    docs_path = repo_root / "data" / "rag" / "perfume-documents.jsonl"
    db_path = repo_root / "data" / "rag" / "perfume-fts.db"
    conn = ensure_index(db_path, docs_path)
    tokens = [token for token in args.query.lower().split() if token]
    match_query = " OR ".join(f"{token}*" for token in tokens) if tokens else args.query
    rows = conn.execute(
        """
        SELECT brand, name, url, release_signal, snippet(perfume_docs, 4, '[', ']', '...', 16)
        FROM perfume_docs
        WHERE perfume_docs MATCH ?
        ORDER BY bm25(perfume_docs)
        LIMIT ?
        """,
        (match_query, args.limit),
    ).fetchall()
    for brand, name, url, release_signal, snippet in rows:
        print(f"{brand} | {name}")
        if release_signal:
            print(f"release_signal: {release_signal}")
        print(url)
        print(snippet)
        print("---")


if __name__ == "__main__":
    main()
