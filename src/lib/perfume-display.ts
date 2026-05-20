import { getNoteFamily } from "@/lib/note-style";

const GENDER_SUFFIXES = ["for women and men", "for men and women", "for women", "for men"] as const;
const GENDER_SUFFIX_RE = /\s*(?:for women and men|for men and women|for women|for men)\s*$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function stripPerfumeSuffix(value: string): string {
  return value.replace(GENDER_SUFFIX_RE, "").replace(/\s+/g, " ").trim();
}

export function displayPerfumeName(value: string): string {
  const cleaned = stripPerfumeSuffix(value);
  return cleaned || value.trim();
}

export function displayPerfumeTitle(brand: string, name: string): string {
  const cleanedName = stripPerfumeSuffix(name);
  const cleanedBrand = brand.trim().replace(/\s+/g, " ");
  if (cleanedName && cleanedBrand) {
    const lowerName = cleanedName.toLowerCase();
    const lowerBrand = cleanedBrand.toLowerCase();
    if (lowerName.endsWith(lowerBrand)) {
      const stripped = cleanedName.slice(0, cleanedName.length - cleanedBrand.length).trim();
      if (stripped) return stripped;
    }
  }

  return cleanedName || displayPerfumeName(name);
}

export function displayPerfumeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\b(Catalog description|Perfume|Brand|Gender|Main accords|Notes|Accords|Top notes|Middle notes|Base notes|Top note|Middle note|Base note|Official tags|Price|Release signal|Description)\s*:\s*/gi, "\n$1: ")
    .replace(/\b(Top notes|Middle notes|Base notes|Top note|Middle note|Base note)\s+(are|is)\s+/gi, "\n$1: ")
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

export function splitPerfumeList(value: string): string[] {
  return value
    .split(/[,;·|/]+/)
    .map((part) =>
      part
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .trim()
    )
    .filter((part) => part.length > 0);
}

function buildIdentityFragments(brand: string, name: string): string[] {
  const cleanedBrand = brand.trim().replace(/\s+/g, " ");
  const cleanedName = stripPerfumeSuffix(name);
  const variants = unique([
    cleanedBrand,
    name.trim().replace(/\s+/g, " "),
    cleanedName,
    displayPerfumeTitle(brand, name),
    `${cleanedBrand} ${cleanedName}`.trim(),
    `${cleanedName} ${cleanedBrand}`.trim(),
  ].filter((value) => value.length > 2));
  return variants;
}

function softTruncate(value: string, maxLength = 260): string {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return lastSpace > 120 ? sliced.slice(0, lastSpace).trim() : sliced.trim();
}

export function cleanPerfumeSnippet(value: string, brand = "", name = ""): string {
  let text = displayPerfumeText(value);
  if (!text) return "";

  const suffixPattern = `(?:${GENDER_SUFFIXES.map(escapeRegExp).join("|")})`;
  for (const fragment of buildIdentityFragments(brand, name)) {
    const escaped = escapeRegExp(fragment);
    text = text.replace(new RegExp(`\\b${escaped}(?:\\s*${suffixPattern})?`, "ig"), " ");
    text = text.replace(new RegExp(`(?:\\s*${suffixPattern})?\\b${escaped}\\b`, "ig"), " ");
    text = text.replace(new RegExp(escaped, "ig"), " ");
  }

  text = text.replace(/\b(?:official product|perfume|brand|gender|main accords|notes|description|catalog description|top notes|middle notes|base notes|official tags|price|release signal)\s*:\s*/gi, "\n");
  text = text.replace(/\s+\|\s+/g, "\n");
  text = text.replace(/\s{2,}/g, " ");

  const lines = text
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .trim()
    )
    .filter(Boolean)
    .filter((line) => !/^(official product|perfume|brand|gender|main accords|notes|description|catalog description|top notes|middle notes|base notes|official tags|price|release signal)\b/i.test(line));

  const excerpt = lines.length > 0 ? lines.slice(0, 2).join(" · ") : text.trim();
  return softTruncate(excerpt);
}

export interface PerfumeSectionRow {
  label: string;
  items: string[];
}

export interface PerfumeBodyStructure {
  overview: string;
  accords: string[];
  noteRows: PerfumeSectionRow[];
}

function extractListLine(line: string, header: string): string[] | null {
  const match = line.match(new RegExp(`^${header}\\s*:\\s*(.+)$`, "i"));
  if (!match) return null;
  return splitPerfumeList(match[1]);
}

function extractTextLine(line: string, header: string): string | null {
  const match = line.match(new RegExp(`^${header}\\s*:\\s*(.+)$`, "i"));
  if (!match) return null;
  return match[1].trim();
}

function sectionLabelForHeader(header: string): string {
  const normalized = header.toLowerCase();
  if (normalized.includes("top notes")) return "Top notes";
  if (normalized.includes("middle notes")) return "Middle notes";
  if (normalized.includes("base notes")) return "Base notes";
  if (normalized === "notes") return "Notes";
  return header;
}

function familyOrder(label: string): number {
  const order = [
    "Citrus",
    "Floral",
    "Woody / Green",
    "Sweet / Gourmand",
    "Spicy",
    "Leather / Animalic",
    "Smoky / Resinous",
    "Musky / Powdery",
    "Aquatic / Airy",
    "Aromatic / Herbal",
    "Fruity",
    "Earthy",
    "Leather / Animalic",
    "Other",
  ];
  const idx = order.indexOf(label);
  return idx >= 0 ? idx : order.length - 1;
}

export function groupPerfumeNotes(notes: string[]): PerfumeSectionRow[] {
  const buckets = new Map<string, string[]>();
  for (const note of notes) {
    const clean = note.trim();
    if (!clean) continue;
    const family = getNoteFamily(clean);
    const current = buckets.get(family) ?? [];
    current.push(clean);
    buckets.set(family, current);
  }

  return [...buckets.entries()]
    .sort((a, b) => familyOrder(a[0]) - familyOrder(b[0]))
    .map(([label, items]) => ({ label, items }));
}

export function extractPerfumeBodyStructure(value: string, brand = "", name = ""): PerfumeBodyStructure {
  const text = displayPerfumeText(value);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const accords: string[] = [];
  const noteRows: PerfumeSectionRow[] = [];
  const overviewLines: string[] = [];
  const descriptionLines: string[] = [];
  let activeNoteRow: PerfumeSectionRow | null = null;

  for (const line of lines) {
    const catalogDescription = extractTextLine(line, "Catalog description") ?? extractTextLine(line, "Description");
    if (catalogDescription) {
      descriptionLines.push(catalogDescription);
      continue;
    }

    if (/^perfume\s*:/i.test(line) || /^brand\s*:/i.test(line) || /^gender\s*:/i.test(line) || /^official tags\s*:/i.test(line) || /^price\s*:/i.test(line) || /^release signal\s*:/i.test(line)) {
      continue;
    }

    const accordList = extractListLine(line, "Accords") ?? extractListLine(line, "Main accords");
    if (accordList) {
      accords.push(...accordList);
      activeNoteRow = null;
      continue;
    }

    const noteHeaders = ["Top notes", "Middle notes", "Base notes", "Notes"];
    let matched = false;
    for (const header of noteHeaders) {
      const noteList = extractListLine(line, header);
      if (!noteList) continue;
      noteRows.push({ label: sectionLabelForHeader(header), items: noteList });
      activeNoteRow = noteRows[noteRows.length - 1] ?? null;
      matched = true;
      break;
    }
    if (matched) continue;

    if (activeNoteRow && /^[a-z]/i.test(line) && line.includes(",")) {
      activeNoteRow.items.push(...splitPerfumeList(line));
      continue;
    }

    overviewLines.push(line);
  }

  const overviewSource = descriptionLines.length > 0 ? descriptionLines.join(" ") : overviewLines.join("\n");
  const overview = cleanPerfumeSnippet(overviewSource, brand, name);
  const uniqueAccords = Array.from(new Set(accords.filter(Boolean)));
  const uniqueRows = noteRows.map((row) => ({ label: row.label, items: Array.from(new Set(row.items.filter(Boolean))) }));

  return {
    overview,
    accords: uniqueAccords,
    noteRows: uniqueRows,
  };
}
