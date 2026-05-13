#!/usr/bin/env node

import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "data", "rag", "eval-manifest.json");
const topicsPath = path.join(repoRoot, "data", "rag", "eval-topics.tsv");
const qrelsPath = path.join(repoRoot, "data", "rag", "eval.qrels");

function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing eval manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
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
      qrelLines.push(
        [
          qid,
          0,
          `${judgment.brand} :: ${judgment.name}`,
          judgment.grade ?? 0,
          testCase.intent ?? "",
        ].join("\t")
      );
      if (Array.isArray(judgment.aliases)) {
        for (const alias of judgment.aliases) {
          qrelLines.push(
            [
              qid,
              0,
              `${judgment.brand} :: ${alias}`,
              judgment.grade ?? 0,
              testCase.intent ?? "",
            ].join("\t")
          );
        }
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
