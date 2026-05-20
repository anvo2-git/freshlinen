import { ACCORD_FAMILIES } from "./accords";
import type { Perfume } from "./types";

export type QuizStepKey = "want" | "avoid" | "tone" | "priority";
export type QuizTone = "quiet" | "balanced" | "noticeable" | "bold" | "skip";
export type QuizPriority = "easy" | "high_end" | "performance" | "distinctive" | "skip";
export type QuizRankingPreference = "balanced" | "popular" | "niche";

export interface QuizChoice {
  label: string;
  description: string;
  value: string;
  families: string[];
}

export interface QuizQuestion {
  key: QuizStepKey;
  title: string;
  prompt: string;
  kind: "multi" | "single";
  maxSelections?: number;
  options: QuizChoice[];
}

export interface BeginnerQuizProfile {
  wantLabels: string[];
  avoidLabels: string[];
  wantFamilies: string[];
  avoidFamilies: string[];
  wantAccords: string[];
  avoidAccords: string[];
  tone: QuizTone;
  toneLabel: string | null;
  toneFamilies: string[];
  toneAccords: string[];
  priority: QuizPriority;
  priorityLabel: string | null;
  rankingPreference: QuizRankingPreference;
}

export interface BeginnerQuizResult {
  perfume: Perfume;
  score: number;
}

const WANT_OPTIONS: QuizChoice[] = [
  { label: "Fresh / clean", description: "Laundry, shower gel, cool air, and easy brightness.", value: "fresh_clean", families: ["Fresh", "Citrus", "Musky"] },
  { label: "Sweet / cozy", description: "Vanilla, soft sugar, warm and comforting.", value: "sweet_cozy", families: ["Warm & Sweet"] },
  { label: "Soft / pretty", description: "Powder, makeup, skin musk, and polished softness.", value: "soft_pretty", families: ["Floral", "Musky"] },
  { label: "Woody / polished", description: "Wood, pencil shavings, dry texture, and smooth edges.", value: "woody_polished", families: ["Woody"] },
  { label: "Floral / elegant", description: "Rose, jasmine, iris, petals, and graceful softness.", value: "floral_elegant", families: ["Floral"] },
  { label: "Smoky / dark", description: "Incense, leather, tobacco, resin, and depth.", value: "smoky_dark", families: ["Smoky", "Leather"] },
  { label: "Citrus / bright", description: "Bergamot, lemon, sparkle, and lift.", value: "citrus_bright", families: ["Citrus", "Fresh"] },
  { label: "Green / airy", description: "Leaves, herbs, natural air, and a little crispness.", value: "green_airy", families: ["Earthy", "Aromatic", "Fresh"] },
  { label: "Spicy / warm", description: "Pepper, cinnamon, texture, and gentle heat.", value: "spicy_warm", families: ["Spicy", "Warm & Sweet"] },
  { label: "Animalic / sensual", description: "Skin musk, intimacy, and a more lived-in feel.", value: "animalic_sensual", families: ["Musky", "Smoky"] },
];

const toneFamilies: Record<Exclude<QuizTone, "skip">, string[]> = {
  quiet: ["Fresh", "Citrus", "Musky", "Floral", "Aromatic", "Earthy"],
  balanced: ["Fresh", "Citrus", "Woody", "Floral", "Musky", "Aromatic"],
  noticeable: ["Woody", "Warm & Sweet", "Spicy", "Floral", "Citrus"],
  bold: ["Smoky", "Leather", "Woody", "Warm & Sweet", "Spicy", "Musky"],
};

const toneLabels: Record<Exclude<QuizTone, "skip">, string> = {
  quiet: "quiet / close to skin",
  balanced: "balanced / noticeable",
  noticeable: "noticeable / present",
  bold: "bold / statement",
};

const priorityLabels: Record<Exclude<QuizPriority, "skip">, string> = {
  easy: "easy to wear",
  high_end: "high-end",
  performance: "strong performance",
  distinctive: "distinctive",
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    key: "want",
    title: "What do you want to smell like?",
    prompt: "Pick up to 2 directions. If you are unsure, just leave it blank and continue.",
    kind: "multi",
    maxSelections: 2,
    options: WANT_OPTIONS,
  },
  {
    key: "avoid",
    title: "What do you explicitly not want to smell like?",
    prompt: "Pick up to 2 things you want me to avoid.",
    kind: "multi",
    maxSelections: 2,
    options: WANT_OPTIONS,
  },
  {
    key: "tone",
    title: "How noticeable should it be?",
    prompt: "This helps me adjust the ranking. Choose the closest fit.",
    kind: "single",
    options: [
      { label: "Quiet / close to skin", description: "Subtle, soft, and easy to keep near you.", value: "quiet", families: toneFamilies.quiet },
      { label: "Balanced / noticeable", description: "Present, but still easy to wear.", value: "balanced", families: toneFamilies.balanced },
      { label: "Noticeable / present", description: "Clear enough for people to notice.", value: "noticeable", families: toneFamilies.noticeable },
      { label: "Bold / statement", description: "Bigger, richer, and more assertive.", value: "bold", families: toneFamilies.bold },
      { label: "Not sure", description: "Skip this step for now.", value: "skip", families: [] },
    ],
  },
  {
    key: "priority",
    title: "If two perfumes fit, what should we favor?",
    prompt: "This is the final tiebreaker.",
    kind: "single",
    options: [
      { label: "Easy to wear", description: "Safe, smooth, and beginner-friendly.", value: "easy", families: ["Fresh", "Citrus", "Musky", "Floral", "Aromatic"] },
      { label: "High-end", description: "Polished, elevated, and a bit more refined.", value: "high_end", families: ["Woody", "Floral", "Musky", "Aromatic"] },
      { label: "Strong performance", description: "Richer, denser, and more long-wearing.", value: "performance", families: ["Smoky", "Leather", "Warm & Sweet", "Spicy", "Woody"] },
      { label: "Distinctive", description: "More niche and less obvious.", value: "distinctive", families: ["Smoky", "Leather", "Woody", "Earthy", "Aromatic"] },
      { label: "No preference", description: "Skip this step.", value: "skip", families: [] },
    ],
  },
];

function expandFamilies(families: string[]): string[] {
  const accords = new Set<string>();
  for (const family of families) {
    for (const accord of ACCORD_FAMILIES[family] ?? []) {
      accords.add(accord);
    }
  }
  return [...accords];
}

function lookupChoiceFamilies(question: QuizQuestion, values: string[]): string[] {
  const families = new Set<string>();
  for (const value of values) {
    const choice = question.options.find((option) => option.value === value);
    if (!choice) continue;
    for (const family of choice.families) {
      families.add(family);
    }
  }
  return [...families];
}

function lookupChoiceLabels(question: QuizQuestion, values: string[]): string[] {
  const labels: string[] = [];
  for (const value of values) {
    const choice = question.options.find((option) => option.value === value);
    if (choice) labels.push(choice.label);
  }
  return labels;
}

function popularitySignal(perfume: Perfume): number {
  const rating = Number.isFinite(perfume.r) ? Math.max(0, Math.min(perfume.r, 5)) / 5 : 0;
  const count = Number.isFinite(perfume.rc) ? Math.min(1, Math.log1p(Math.max(0, perfume.rc)) / 10) : 0;
  return rating * 0.6 + count * 0.4;
}

function familySignal(perfume: Perfume, families: string[]): number {
  if (families.length === 0) return 0;

  let total = 0;
  for (const family of families) {
    const accords = ACCORD_FAMILIES[family] ?? [];
    if (accords.length === 0) continue;
    let familyTotal = 0;
    for (const accord of accords) {
      familyTotal += perfume.aw[accord.toLowerCase()] ?? 0;
    }
    total += familyTotal / accords.length;
  }

  return total / families.length;
}

function countMatchedFamilies(perfume: Perfume, families: string[]): string[] {
  const matched: string[] = [];
  for (const family of families) {
    if (familySignal(perfume, [family]) > 0) {
      matched.push(family);
    }
  }
  return matched;
}

function toneBoost(perfume: Perfume, tone: QuizTone): number {
  if (tone === "skip") return 0;
  const quiet = familySignal(perfume, toneFamilies.quiet);
  const balanced = familySignal(perfume, toneFamilies.balanced);
  const noticeable = familySignal(perfume, toneFamilies.noticeable);
  const bold = familySignal(perfume, toneFamilies.bold);

  if (tone === "quiet") return quiet * 0.22 - bold * 0.14;
  if (tone === "balanced") return balanced * 0.14;
  if (tone === "noticeable") return noticeable * 0.18 + bold * 0.05;
  return bold * 0.22 - quiet * 0.1;
}

function priorityBoost(perfume: Perfume, priority: QuizPriority, rankingPreference: QuizRankingPreference): number {
  const popularity = popularitySignal(perfume);

  if (rankingPreference === "popular") return popularity * 22;
  if (rankingPreference === "niche") return (1 - popularity) * 18;

  if (priority === "easy") return popularity * 18;
  if (priority === "high_end") return popularity * 10 + familySignal(perfume, ["Woody", "Floral", "Musky", "Aromatic"]) * 0.05;
  if (priority === "performance") return familySignal(perfume, toneFamilies.bold) * 0.08;
  if (priority === "distinctive") return (1 - popularity) * 14;
  return 0;
}

export function getQuestionOptions(stepKey: QuizStepKey): QuizChoice[] {
  return QUIZ_QUESTIONS.find((question) => question.key === stepKey)?.options ?? [];
}

export function getFilteredAvoidOptions(wantValues: string[]): QuizChoice[] {
  const wantFamilies = new Set(lookupChoiceFamilies(QUIZ_QUESTIONS[0], wantValues));
  return getQuestionOptions("avoid").filter((option) => {
    if (option.value === "skip") return true;
    if (wantFamilies.size === 0) return true;
    return !option.families.some((family) => wantFamilies.has(family));
  });
}

export function sanitizeQuizAnswers(answers: Record<QuizStepKey, string[]>): Record<QuizStepKey, string[]> {
  const allowedAvoidValues = new Set(getFilteredAvoidOptions(answers.want).map((option) => option.value));
  return {
    ...answers,
    avoid: (answers.avoid ?? []).filter((value) => allowedAvoidValues.has(value)),
  };
}

export function buildBeginnerQuizProfile(answers: Record<QuizStepKey, string[]>): BeginnerQuizProfile {
  const wantValues = answers.want ?? [];
  const avoidValues = answers.avoid ?? [];
  const toneValue = (answers.tone?.[0] as QuizTone | undefined) ?? "skip";
  const priorityValue = (answers.priority?.[0] as QuizPriority | undefined) ?? "skip";

  const wantLabels = lookupChoiceLabels(QUIZ_QUESTIONS[0], wantValues);
  const avoidLabels = lookupChoiceLabels(QUIZ_QUESTIONS[1], avoidValues);
  const wantFamilies = lookupChoiceFamilies(QUIZ_QUESTIONS[0], wantValues);
  const avoidFamilies = lookupChoiceFamilies(QUIZ_QUESTIONS[1], avoidValues);
  const toneFamiliesSelected = lookupChoiceFamilies(QUIZ_QUESTIONS[2], toneValue === "skip" ? [] : [toneValue]);

  const wantAccords = expandFamilies(wantFamilies);
  const avoidAccords = expandFamilies(avoidFamilies);
  const toneAccords = expandFamilies(toneFamiliesSelected);

  let rankingPreference: QuizRankingPreference = "balanced";
  if (priorityValue === "easy") rankingPreference = "popular";
  if (priorityValue === "distinctive") rankingPreference = "niche";

  return {
    wantLabels,
    avoidLabels,
    wantFamilies,
    avoidFamilies,
    wantAccords,
    avoidAccords,
    tone: toneValue,
    toneLabel: toneValue === "skip" ? null : toneLabels[toneValue],
    toneFamilies: toneFamiliesSelected,
    toneAccords,
    priority: priorityValue,
    priorityLabel: priorityValue === "skip" ? null : priorityLabels[priorityValue],
    rankingPreference,
  };
}

export function summarizeBeginnerQuizProfile(profile: BeginnerQuizProfile): string[] {
  const summary: string[] = [];
  if (profile.wantLabels.length > 0) summary.push(`Want: ${profile.wantLabels.join(", ")}`);
  if (profile.avoidLabels.length > 0) summary.push(`Avoid: ${profile.avoidLabels.join(", ")}`);
  if (profile.toneLabel) summary.push(`Noticeability: ${profile.toneLabel}`);
  if (profile.priorityLabel) summary.push(`Priority: ${profile.priorityLabel}`);
  return summary;
}

export function buildBeginnerQuizQuery(profile: BeginnerQuizProfile): string {
  const pieces: string[] = [];
  if (profile.wantFamilies.length > 0) pieces.push(`want ${profile.wantFamilies.join(" and ")}`);
  if (profile.avoidFamilies.length > 0) pieces.push(`avoid ${profile.avoidFamilies.join(" and ")}`);
  if (profile.tone !== "skip") pieces.push(profile.toneLabel ?? "");
  if (profile.priority !== "skip") pieces.push(profile.priorityLabel ?? "");
  return pieces.filter(Boolean).length > 0 ? pieces.filter(Boolean).join(" ") : "beginner perfume recommendation";
}

function buildCandidatePool(profile: BeginnerQuizProfile, catalog: Perfume[], lookup: Record<string, number[]>): Set<number> {
  const ids = new Set<number>();
  const seedAccords = [...profile.wantAccords, ...profile.toneAccords];

  for (const accord of seedAccords) {
    for (const id of lookup[accord] ?? []) {
      if (id < catalog.length) ids.add(id);
    }
  }

  if (ids.size === 0) {
    const fallbackFamilies = profile.tone !== "skip"
      ? profile.toneFamilies
      : ["Fresh", "Citrus", "Floral", "Woody", "Warm & Sweet", "Spicy", "Musky", "Earthy", "Aromatic", "Smoky"];
    for (const family of fallbackFamilies) {
      for (const accord of ACCORD_FAMILIES[family] ?? []) {
        for (const id of lookup[accord] ?? []) {
          if (id < catalog.length) ids.add(id);
        }
      }
    }
  }

  if (ids.size === 0) {
    for (let i = 0; i < catalog.length; i += 1) ids.add(i);
  }

  return ids;
}

export function rankBeginnerQuizResults(
  profile: BeginnerQuizProfile,
  catalog: Perfume[],
  lookup: Record<string, number[]>,
  limit: number = 6
): BeginnerQuizResult[] {
  const candidateIds = buildCandidatePool(profile, catalog, lookup);
  const results: Array<{ perfume: Perfume; score: number }> = [];

  for (const id of candidateIds) {
    const perfume = catalog[id];
    if (!perfume) continue;

    let wantScore = 0;
    for (const accord of profile.wantAccords) {
      wantScore += perfume.aw[accord.toLowerCase()] ?? 0;
    }

    let avoidScore = 0;
    for (const accord of profile.avoidAccords) {
      avoidScore += perfume.aw[accord.toLowerCase()] ?? 0;
    }

    const matchedWant = countMatchedFamilies(perfume, profile.wantFamilies);
    const matchedAvoid = countMatchedFamilies(perfume, profile.avoidFamilies);

    const score =
      wantScore * 0.12 +
      matchedWant.length * 20 +
      toneBoost(perfume, profile.tone) +
      priorityBoost(perfume, profile.priority, profile.rankingPreference) -
      avoidScore * 0.18 -
      matchedAvoid.length * 34;

    results.push({ perfume, score });
  }

  results.sort((a, b) => b.score - a.score || b.perfume.r - a.perfume.r || b.perfume.rc - a.perfume.rc);
  return results.slice(0, limit).map(({ perfume, score }) => ({ perfume, score }));
}

