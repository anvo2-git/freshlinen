import fs from "fs";
import path from "path";
import Link from "next/link";

type Judgment = {
  brand: string;
  name: string;
  grade: number;
  aliases?: string[];
};

type EvalCase = {
  id: string;
  intent: string;
  query: string;
  target_rank?: number;
  min_grade?: number;
  success_policy?: string;
  judgments?: Judgment[];
  manual_review?: boolean;
  notes?: string;
};

type EvalManifest = {
  version: number;
  description: string;
  defaults?: {
    target_rank?: number;
    min_grade?: number;
    success_policy?: string;
  };
  cases: EvalCase[];
};

type EvalResultRow = {
  id: string;
  intent: string;
  query: string;
  passed: boolean;
  matchedAt: number | null;
  top1: string;
  match: string;
  manualReview?: boolean;
};

type EvalReport = {
  baseUrl: string;
  total: number;
  passed: number;
  exactPassed: number;
  vibePassed: number;
  comparisonPassed: number;
  manualReviewCases: number;
  score: number;
  failUnder: number;
  intentCounts: Record<string, number>;
  results: EvalResultRow[];
};

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "data", "rag", "eval-manifest.json");
const qrelsPath = path.join(repoRoot, "data", "rag", "eval.qrels");
const topicsPath = path.join(repoRoot, "data", "rag", "eval-topics.tsv");
const latestPath = path.join(repoRoot, "data", "rag", "eval-latest.json");

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function gradeLabel(grade: number): string {
  if (grade >= 3) return "high";
  if (grade >= 2) return "relevant";
  if (grade >= 1) return "partial";
  return "none";
}

export default function RagEvalPage() {
  const manifest = readJsonFile<EvalManifest>(manifestPath);
  const latest = readJsonFile<EvalReport>(latestPath);
  const qrelsText = fs.existsSync(qrelsPath) ? fs.readFileSync(qrelsPath, "utf8") : "";
  const topicsText = fs.existsSync(topicsPath) ? fs.readFileSync(topicsPath, "utf8") : "";

  if (!manifest) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-violet-950">RAG eval</h1>
        <p className="mt-3 text-violet-600">No manifest found at {manifestPath}.</p>
      </div>
    );
  }

  const caseCount = manifest.cases.length;
  const exactCount = manifest.cases.filter((c) => c.intent === "exact_lookup").length;
  const vibeCount = manifest.cases.filter((c) => c.intent === "vibe_search" || c.intent === "filter_search").length;
  const comparisonCount = manifest.cases.filter((c) => c.intent === "comparison").length;
  const manualReviewCount = manifest.cases.filter((c) => c.success_policy === "manual_review").length;
  const latestResults = latest?.results ?? [];
  const resultById = new Map(latestResults.map((row) => [row.id, row]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">Benchmark</p>
          <h1 className="text-4xl font-bold text-violet-950 mb-3">RAG eval</h1>
          <p className="max-w-3xl text-violet-600 leading-relaxed">
            Read-only view of the perfume retrieval benchmark. The manifest is the source of truth,
            and the latest saved run is stored in <code className="text-violet-900">data/rag/eval-latest.json</code>.
          </p>
        </div>
        <Link
          href="/rag"
          className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
        >
          Back to search
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        <div className="rounded-2xl border border-violet-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Latest score</div>
          <div className="mt-2 text-3xl font-bold text-violet-950">{latest ? latest.score.toFixed(3) : "—"}</div>
          <div className="mt-2 text-sm text-violet-500">
            {latest ? `${latest.passed}/${latest.total - latest.manualReviewCases} passed` : "No saved run yet"}
          </div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Cases</div>
          <div className="mt-2 text-3xl font-bold text-violet-950">{caseCount}</div>
          <div className="mt-2 text-sm text-violet-500">{exactCount} exact, {vibeCount} vibe/filter, {comparisonCount} compare</div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Judgments</div>
          <div className="mt-2 text-3xl font-bold text-violet-950">{manifest.cases.reduce((sum, c) => sum + (c.judgments?.length ?? 0), 0)}</div>
          <div className="mt-2 text-sm text-violet-500">Across {caseCount} topics</div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-white p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-violet-400">Manual review</div>
          <div className="mt-2 text-3xl font-bold text-violet-950">{manualReviewCount}</div>
          <div className="mt-2 text-sm text-violet-500">Negative / abstain cases</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-violet-950">Latest run</h2>
                <p className="text-sm text-violet-500">
                  {latest ? `Base URL ${latest.baseUrl}` : "Run `npm run rag-eval` with `--output data/rag/eval-latest.json` to populate this panel."}
                </p>
              </div>
              {latest ? (
                <div className="text-sm text-violet-600">
                  Compare {latest.comparisonPassed}/{comparisonCount} · Exact {latest.exactPassed}/{exactCount} · Vibe {latest.vibePassed}/{vibeCount}
                </div>
              ) : null}
            </div>

            {latest ? (
              <div className="mt-5 overflow-hidden rounded-xl border border-violet-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-violet-50 text-violet-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Case</th>
                      <th className="px-4 py-3 font-medium">Intent</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Top hit</th>
                      <th className="px-4 py-3 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.cases.map((testCase) => {
                      const row = resultById.get(testCase.id);
                      const judgmentCount = testCase.judgments?.length ?? 0;
                      return (
                        <tr key={testCase.id} className="border-t border-violet-100 align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium text-violet-950">{testCase.id}</div>
                            <div className="mt-1 text-xs text-violet-400">{testCase.query}</div>
                            <div className="mt-1 text-xs text-violet-400">
                              {testCase.target_rank ? `top ${testCase.target_rank}` : "top 5"} · {judgmentCount} judgments
                            </div>
                          </td>
                          <td className="px-4 py-3 text-violet-700">{testCase.intent}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                row?.manualReview
                                  ? "bg-amber-100 text-amber-800"
                                  : row?.passed
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {row?.manualReview ? "review" : row?.passed ? "pass" : "fail"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-violet-600">{row?.top1 || "—"}</td>
                          <td className="px-4 py-3 text-xs text-violet-600">{row?.match || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h2 className="text-xl font-semibold text-violet-950 mb-3">Notes</h2>
            <ul className="space-y-2 text-sm leading-relaxed text-violet-700">
              {manifest.description ? <li>{manifest.description}</li> : null}
              <li>
                Scores should be interpreted alongside the manual-review cases, since perfume language has incomplete judgments by design.
              </li>
              <li>
                Comparison tasks are scored at a wider window than exact lookups, because the benchmark is checking whether both sides of a comparison are surfaced.
              </li>
            </ul>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Manifest</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-violet-500">Version</dt>
                <dd className="font-medium text-violet-950">{manifest.version}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-violet-500">Topics file</dt>
                <dd className="font-medium text-violet-950">{fs.existsSync(topicsPath) ? "present" : "missing"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-violet-500">Qrels file</dt>
                <dd className="font-medium text-violet-950">{fs.existsSync(qrelsPath) ? "present" : "missing"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-violet-500">Manual review</dt>
                <dd className="font-medium text-violet-950">{formatPercent(manualReviewCount, caseCount)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">IR exports</h2>
            <p className="mt-3 text-sm leading-relaxed text-violet-700">
              The benchmark can be exported with <code className="text-violet-900">npm run rag-export</code>.
            </p>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Per-case relevance</h2>
            <div className="mt-4 space-y-3 text-sm">
              {manifest.cases.slice(0, 8).map((testCase) => (
                <div key={testCase.id} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-violet-950">{testCase.id}</span>
                    <span className="text-xs text-violet-400">{testCase.intent}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(testCase.judgments ?? []).map((j, index) => (
                      <span
                        key={`${testCase.id}-${index}`}
                        className="rounded-full bg-white px-2.5 py-1 text-xs text-violet-700"
                        title={`${j.brand} :: ${j.name}`}
                      >
                        {j.brand} / {j.name} · {gradeLabel(j.grade)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Latest links</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Link className="block text-violet-700 hover:text-violet-900" href="/rag">
                Open RAG search
              </Link>
              <Link className="block text-violet-700 hover:text-violet-900" href="/api/rag/query?q=Layton&limit=3">
                Query JSON endpoint
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {latest ? (
        <details className="mt-8 rounded-2xl border border-violet-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Raw latest run JSON
          </summary>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-violet-950 p-4 text-xs leading-relaxed text-violet-100">
            {JSON.stringify(latest, null, 2)}
          </pre>
        </details>
      ) : null}

      <details className="mt-6 rounded-2xl border border-violet-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
          Raw topics and qrels
        </summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <pre className="overflow-x-auto rounded-xl bg-violet-50 p-4 text-xs leading-relaxed text-violet-800">
            {topicsText}
          </pre>
          <pre className="overflow-x-auto rounded-xl bg-violet-50 p-4 text-xs leading-relaxed text-violet-800">
            {qrelsText}
          </pre>
        </div>
      </details>
    </div>
  );
}
