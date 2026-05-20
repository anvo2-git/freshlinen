#!/usr/bin/env node

import assert from "assert/strict";
import {
  scrapeFragranticaCandidate,
  searchFragranticaCandidates,
} from "../src/lib/rag-fallback.ts";

async function main() {
  const calls = [];
  const mockFetch = async (input) => {
    calls.push(String(input));
    if (String(input).includes("/api/rag/query")) {
      return {
        ok: true,
        json: async () => ({ results: [] }),
      };
    }
    if (String(input).includes("/api/scrape/search")) {
      return {
        ok: true,
        json: async () => ({
          results: [
            { name: "Layton", brand: "Parfums de Marly", url: "https://www.fragrantica.com/perfume/Parfums-de-Marly/Layton-47645.html" },
          ],
        }),
      };
    }
    if (String(input).includes("/api/scrape?url=")) {
      return {
        ok: true,
        json: async () => ({ name: "Layton", brand: "Parfums de Marly" }),
      };
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  };

  async function runFallback(query) {
    const ragResponse = await mockFetch(`/api/rag/query?q=${encodeURIComponent(query)}&limit=3`);
    const ragData = await ragResponse.json();
    assert.equal(ragData.results.length, 0);

    const candidates = await searchFragranticaCandidates(query, mockFetch);
    assert.equal(candidates.length, 1);

    const scraped = await scrapeFragranticaCandidate(candidates[0].url, mockFetch);
    return { candidates, scraped };
  }

  const flow = await runFallback("Layton");
  assert.equal(flow.candidates[0].name, "Layton");
  assert.equal(flow.scraped.name, "Layton");
  assert.equal(flow.scraped.brand, "Parfums de Marly");

  console.log(JSON.stringify({ ok: true, calls }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
