#!/usr/bin/env node

import fs from "fs";
import path from "path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_FAIL_UNDER = 0.7;
const MANIFEST_PATH = path.join(process.cwd(), "data", "rag", "eval-manifest.json");

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.RAG_BASE_URL || DEFAULT_BASE_URL,
    failUnder: DEFAULT_FAIL_UNDER,
    json: false,
    output: "",
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
    } else if (token === "--output") {
      args.output = argv[i + 1] || "";
      i += 1;
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

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing eval manifest: ${MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
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

function matchesJudgment(result, judgment) {
  const brand = normalize(judgment.brand);
  const name = normalize(judgment.name);
  const aliases = Array.isArray(judgment.aliases) ? judgment.aliases.map(normalize) : [];
  const text = normalize(`${result.brand} ${result.name}`);

  const directMatch =
    text.includes(brand) && text.includes(name) ||
    normalize(result.brand) === brand &&
      (normalize(result.name).includes(name) || name.includes(normalize(result.name)));

  if (directMatch) return true;

  return aliases.some((alias) => text.includes(alias));
}

function matchesTerms(result, terms) {
  const text = resultSearchText(result);
  return terms.every((term) => text.includes(normalize(term)));
}

function scoreCase(results, testCase, defaults) {
  const topK = Math.max(1, Math.min(testCase.target_rank ?? defaults.target_rank ?? 5, results.length || 1));
  const topResults = results.slice(0, topK);
  const top1 = topResults[0] ?? null;
  const judgments = Array.isArray(testCase.judgments) ? testCase.judgments : [];
  const minGrade = testCase.min_grade ?? defaults.min_grade ?? 2;
  const successPolicy = testCase.success_policy ?? defaults.success_policy ?? "any";
  const requiredTerms = Array.isArray(testCase.required_terms) ? testCase.required_terms : [];
  const matchedJudgments = [];

  for (let i = 0; i < topResults.length; i += 1) {
    const result = topResults[i];
    for (const judgment of judgments) {
      if (matchesJudgment(result, judgment)) {
        matchedJudgments.push({
          judgment,
          result,
          rank: i + 1,
          grade: judgment.grade ?? 0,
        });
      }
    }
  }

  const topGradeMatch = matchedJudgments
    .filter((item) => item.grade >= minGrade)
    .sort((a, b) => a.rank - b.rank || b.grade - a.grade)[0] ?? null;

  const termMatch = requiredTerms.length > 0 && topResults.some((result) => matchesTerms(result, requiredTerms));

  let passed = false;
  if (successPolicy === "manual_review") {
    passed = false;
  } else if (successPolicy === "top1") {
    passed = !!topGradeMatch && topGradeMatch.rank === 1;
  } else if (successPolicy === "all") {
    const requiredJudgments = judgments.filter((j) => (j.grade ?? 0) >= minGrade);
    passed = requiredJudgments.every((judgment) =>
      matchedJudgments.some(
        (item) =>
          item.grade >= minGrade &&
          item.judgment === judgment
      )
    );
  } else if (requiredTerms.length > 0 && judgments.length === 0) {
    passed = termMatch;
  } else {
    passed = !!topGradeMatch || termMatch;
  }

  const matchedAt = topGradeMatch?.rank ?? null;
  const match = topGradeMatch?.result ?? null;
  const quality = topGradeMatch
    ? ((topGradeMatch.grade / 3) * (topGradeMatch.rank === 1 ? 1 : topGradeMatch.rank === 2 ? 0.8 : 0.6))
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
  const { baseUrl, failUnder, json, output } = parseArgs(process.argv);
  const manifest = loadManifest();
  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
  const defaults = manifest.defaults || {};
  const summary = {
    baseUrl,
    total: cases.length,
    passed: 0,
    exactPassed: 0,
    vibePassed: 0,
    comparisonPassed: 0,
    negativeReviewed: 0,
    score: 0,
    results: [],
  };

  for (const testCase of cases) {
    const url = `${baseUrl.replace(/\/$/, "")}/api/rag/query?q=${encodeURIComponent(testCase.query)}&limit=${testCase.target_rank ?? defaults.target_rank ?? 5}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RAG API failed for "${testCase.query}" with HTTP ${response.status}`);
    }
    const data = await response.json();
    const scored = scoreCase(data.results ?? [], testCase, defaults);
    summary.results.push(scored);
    if (testCase.success_policy === "manual_review") {
      summary.negativeReviewed += 1;
    }
    if (scored.passed) {
      summary.passed += 1;
      summary.score += scored.quality;
      if (scored.intent === "exact_lookup") summary.exactPassed += 1;
      else if (scored.intent === "comparison") summary.comparisonPassed += 1;
      else summary.vibePassed += 1;
    }
  }

  const scoredCases = cases.filter((item) => item.success_policy !== "manual_review").length || 1;
  const overall = summary.score / scoredCases;
  const intentCounts = cases.reduce((acc, item) => {
    const key = item.intent || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const report = {
    baseUrl: summary.baseUrl,
    total: summary.total,
    passed: summary.passed,
    exactPassed: summary.exactPassed,
    vibePassed: summary.vibePassed,
    comparisonPassed: summary.comparisonPassed,
    manualReviewCases: summary.negativeReviewed,
    score: Number(overall.toFixed(3)),
    failUnder,
    intentCounts,
    results: summary.results.map((item) => ({
      id: item.id,
      intent: item.intent,
      query: item.query,
      passed: item.passed,
      matchedAt: item.matchedAt,
      top1: formatResult(item.top1),
      match: formatResult(item.match),
      manualReview: !!item.manual_review,
    })),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`RAG eval against ${report.baseUrl}`);
    console.log(`Score: ${report.score} | Passed: ${report.passed}/${report.total - report.manualReviewCases} | Exact: ${report.exactPassed}/${intentCounts.exact_lookup || 0} | Vibe: ${report.vibePassed}/${(intentCounts.vibe_search || 0) + (intentCounts.filter_search || 0)} | Compare: ${report.comparisonPassed}/${intentCounts.comparison || 0}`);
    console.log("");
    for (const row of report.results) {
      const status = row.manualReview ? "REVIEW" : row.passed ? "PASS" : "FAIL";
      const where = row.matchedAt ? `top${row.matchedAt}` : "no-hit";
      console.log(`[${status}] ${row.id} (${row.intent}, ${where})`);
      console.log(`  query: ${row.query}`);
      console.log(`  top1:  ${row.top1}`);
      if (row.match && row.match !== row.top1) {
        console.log(`  match: ${row.match}`);
      }
      if (row.manualReview) {
        console.log("  note: manual review only");
      }
    }
  }

  if (output) {
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (overall < failUnder) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
