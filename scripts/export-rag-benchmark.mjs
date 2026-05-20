#!/usr/bin/env node

import fs from "fs";
import { loadCorpus, loadManifest, resolveJudgmentDocs } from "./rag-benchmark-common.mjs";
const topicsPath = "data/rag/eval-topics.tsv";
const qrelsPath = "data/rag/eval.qrels";

function main() {
  const manifest = loadManifest();
  const corpus = loadCorpus();
  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];

  const topicLines = [
    "# qid\ttopic\tintent\ttarget_rank\tmin_grade\tsuccess_policy\tquery\tnotes",
  ];
  const qrelLines = [
    "# qid\titer\tdocno\trel\tintent",
  ];

  for (const testCase of cases) {
    const qid = String(testCase.id);
    topicLines.push(
      [
        qid,
        testCase.id,
        testCase.intent ?? "",
        testCase.target_rank ?? "",
        testCase.min_grade ?? "",
        testCase.success_policy ?? "",
        JSON.stringify(testCase.query ?? ""),
        JSON.stringify(testCase.notes ?? ""),
      ].join("\t")
    );

    const judgments = Array.isArray(testCase.judgments) ? testCase.judgments : [];
    for (const judgment of judgments) {
      const resolvedDocs = resolveJudgmentDocs(corpus, judgment);
      if (resolvedDocs.length === 0 && testCase.success_policy !== "manual_review") {
        throw new Error(`Unresolved benchmark judgment: ${testCase.id} :: ${judgment.brand} | ${judgment.name}`);
      }
      const uniqueDocs = Array.from(new Set(resolvedDocs.map((doc) => doc.url)));
      for (const docno of uniqueDocs) {
        qrelLines.push(
          [
            qid,
            0,
            docno,
            judgment.grade ?? 0,
            testCase.intent ?? "",
          ].join("\t")
        );
      }
    }
  }

  fs.writeFileSync(topicsPath, `${topicLines.join("\n")}\n`, "utf8");
  fs.writeFileSync(qrelsPath, `${qrelLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        topicsPath,
        qrelsPath,
        topics: cases.length,
        qrels: qrelLines.length - 1,
      },
      null,
      2
    )
  );
}

main();
