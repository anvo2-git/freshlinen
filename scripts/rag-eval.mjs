#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_FAIL_UNDER = 0.7;

const CASES = [
  {
    id: "layton",
    query: "Layton",
    kind: "exact",
    expected: { brand: "Parfums de Marly", name: "Layton" },
    topK: 3,
  },
  {
    id: "naxos",
    query: "Xerjoff Naxos",
    kind: "exact",
    expected: { brand: "Xerjoff", name: "Naxos" },
    topK: 3,
  },
  {
    id: "sauvage",
    query: "Dior Sauvage",
    kind: "exact",
    expected: { brand: "Dior", name: "Sauvage" },
    topK: 3,
  },
  {
    id: "black-orchid",
    query: "Tom Ford Black Orchid",
    kind: "exact",
    expected: { brand: "Tom Ford", name: "Black Orchid" },
    topK: 3,
  },
  {
    id: "smoky-vanilla",
    query: "smoky vanilla winter",
    kind: "vibe",
    requiredTerms: ["smoky", "vanilla"],
    topK: 3,
  },
  {
    id: "rose-oud-incense",
    query: "rose oud incense",
    kind: "vibe",
    requiredTerms: ["rose", "oud"],
    topK: 3,
  },
  {
    id: "fresh-woody",
    query: "fresh woody summer",
    kind: "vibe",
    requiredTerms: ["fresh", "woody"],
    topK: 5,
  },
  {
    id: "citrus-musk",
    query: "citrus musk cedar",
    kind: "vibe",
    requiredTerms: ["citrus", "musk"],
    topK: 5,
  },
  {
    id: "powdery-iris",
    query: "powdery iris",
    kind: "vibe",
    requiredTerms: ["iris"],
    topK: 5,
  },
  {
    id: "new-amber",
    query: "new fragrance amber",
    kind: "vibe",
    requiredTerms: ["amber"],
    topK: 5,
  },
];

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.RAG_BASE_URL || DEFAULT_BASE_URL,
    failUnder: DEFAULT_FAIL_UNDER,
    json: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base-url") {
      args.baseUrl = argv[i + 1] || args.baseUrl;
      i += 1;
    } else if (token === "--fail-under") {
      const parsed = Number.parseFloat(argv[i + 1] || "");
      if (!Number.isNaN(parsed)) args.failUnder = parsed;
      i += 1;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--help" || token === "-h") {
      printHelpAndExit();
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Usage: node scripts/rag-eval.mjs [--base-url http://127.0.0.1:3000] [--fail-under 0.7] [--json]`);
  process.exit(0);
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultSearchText(result) {
  return normalize(
    [
      result.brand,
      result.name,
      result.source_type,
      result.rating_value,
      result.rating_count,
      result.release_signal,
      ...(result.accords || []),
      ...(result.notes || []),
      result.snippet,
    ].join(" ")
  );
}

function matchesExact(result, expected) {
  const text = normalize(`${result.brand} ${result.name}`);
  const brand = normalize(expected.brand);
  const name = normalize(expected.name);
  return text.includes(brand) && text.includes(name);
}

function matchesTerms(result, terms) {
  const text = resultSearchText(result);
  return terms.every((term) => text.includes(normalize(term)));
}

function scoreCase(results, testCase) {
  const topK = Math.max(1, Math.min(testCase.topK ?? 3, results.length || 1));
  const topResults = results.slice(0, topK);
  const top1 = topResults[0] ?? null;
  let passed = false;
  let matchedAt = null;
  let match = null;

  if (testCase.kind === "exact") {
    for (let i = 0; i < topResults.length; i += 1) {
      const result = topResults[i];
      if (matchesExact(result, testCase.expected)) {
        passed = true;
        matchedAt = i + 1;
        match = result;
        break;
      }
    }
  } else {
    for (let i = 0; i < topResults.length; i += 1) {
      const result = topResults[i];
      if (matchesTerms(result, testCase.requiredTerms)) {
        passed = true;
        matchedAt = i + 1;
        match = result;
        break;
      }
    }
  }

  const quality = passed
    ? matchedAt === 1
      ? 1
      : matchedAt === 2
        ? 0.75
        : 0.5
    : 0;

  return {
    ...testCase,
    passed,
    matchedAt,
    quality,
    top1,
    match,
    topResults,
  };
}

function formatResult(result) {
  if (!result) return "(no result)";
  return `${result.brand} | ${result.name} [${result.score?.toFixed?.(2) ?? result.score}]`;
}

async function main() {
  const { baseUrl, failUnder, json } = parseArgs(process.argv);
  const summary = {
    baseUrl,
    total: CASES.length,
    passed: 0,
    exactPassed: 0,
    vibePassed: 0,
    score: 0,
    results: [],
  };

  for (const testCase of CASES) {
    const url = `${baseUrl.replace(/\/$/, "")}/api/rag/query?q=${encodeURIComponent(testCase.query)}&limit=${testCase.topK ?? 3}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RAG API failed for "${testCase.query}" with HTTP ${response.status}`);
    }
    const data = await response.json();
    const scored = scoreCase(data.results ?? [], testCase);
    summary.results.push(scored);
    if (scored.passed) {
      summary.passed += 1;
      summary.score += scored.quality;
      if (scored.kind === "exact") summary.exactPassed += 1;
      else summary.vibePassed += 1;
    }
  }

  const overall = summary.score / CASES.length;
  const report = {
    baseUrl: summary.baseUrl,
    total: summary.total,
    passed: summary.passed,
    exactPassed: summary.exactPassed,
    vibePassed: summary.vibePassed,
    score: Number(overall.toFixed(3)),
    failUnder,
    results: summary.results.map((item) => ({
      id: item.id,
      kind: item.kind,
      query: item.query,
      passed: item.passed,
      matchedAt: item.matchedAt,
      top1: formatResult(item.top1),
      match: formatResult(item.match),
    })),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`RAG eval against ${report.baseUrl}`);
    console.log(`Score: ${report.score} | Passed: ${report.passed}/${report.total} | Exact: ${report.exactPassed}/${CASES.filter((c) => c.kind === "exact").length} | Vibe: ${report.vibePassed}/${CASES.filter((c) => c.kind === "vibe").length}`);
    console.log("");
    for (const row of report.results) {
      const status = row.passed ? "PASS" : "FAIL";
      const where = row.matchedAt ? `top${row.matchedAt}` : "no-hit";
      console.log(`[${status}] ${row.id} (${row.kind}, ${where})`);
      console.log(`  query: ${row.query}`);
      console.log(`  top1:  ${row.top1}`);
      if (row.match && row.match !== row.top1) {
        console.log(`  match: ${row.match}`);
      }
    }
  }

  if (overall < failUnder) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
