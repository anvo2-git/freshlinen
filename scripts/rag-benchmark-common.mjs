#!/usr/bin/env node

import fs from "fs";
import path from "path";

const GENDER_SUFFIXES = ["for women and men", "for women", "for men"];
const MANIFEST_PATH = path.join(process.cwd(), "data", "rag", "eval-manifest.json");
const CORPUS_PATH = path.join(process.cwd(), "data", "rag", "perfume-documents.jsonl");

export function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeBrand(value) {
  return normalize(value);
}

export function canonicalizeName(name, brand = "") {
  let value = normalize(name);
  for (const suffix of GENDER_SUFFIXES) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length).trim();
    }
  }

  const normalizedBrand = canonicalizeBrand(brand);
  if (normalizedBrand) {
    if (value.endsWith(normalizedBrand)) {
      value = value.slice(0, -normalizedBrand.length).trim();
    }
    if (value.startsWith(`${normalizedBrand} `)) {
      value = value.slice(normalizedBrand.length).trim();
    }
  }

  return value.trim();
}

export function canonicalDocKey(doc) {
  return `${canonicalizeBrand(doc.brand)} :: ${canonicalizeName(doc.name, doc.brand)}`;
}

export function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing eval manifest: ${MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

export function loadCorpus() {
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(`Missing perfume corpus: ${CORPUS_PATH}`);
  }

  return fs
    .readFileSync(CORPUS_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function resolveJudgmentDocs(corpus, judgment) {
  const targetBrand = canonicalizeBrand(judgment.brand);
  const targetName = canonicalizeName(judgment.name, judgment.brand);
  return corpus.filter((doc) => canonicalDocKey(doc) === `${targetBrand} :: ${targetName}`);
}
