export type GuideMode = "perfume" | "vibe" | "shopping" | "new";
export type GuideBudget = "under_100" | "100_200" | "200_plus" | "no_limit" | "skip";
export type GuidePriority = "easy" | "high_end" | "performance" | "unique" | "skip";

export type GuideChoice = {
  label: string;
  description: string;
  value: string;
  query?: string;
};

export type GuideQuestion =
  | {
      key: "mode";
      title: string;
      prompt: string;
      kind: "choice";
      options: GuideChoice[];
    }
  | {
      key: "perfume";
      title: string;
      prompt: string;
      kind: "text";
      placeholder: string;
    }
  | {
      key: "vibe";
      title: string;
      prompt: string;
      kind: "choice";
      options: GuideChoice[];
    }
  | {
      key: "budget";
      title: string;
      prompt: string;
      kind: "choice";
      options: GuideChoice[];
    }
  | {
      key: "priority";
      title: string;
      prompt: string;
      kind: "choice";
      options: GuideChoice[];
    };

export interface GuideState {
  mode?: GuideMode;
  perfumeText: string;
  vibe?: string;
  budget?: GuideBudget;
  priority?: GuidePriority;
  includeFavorites: boolean;
}

export const GUIDE_MODE_OPTIONS: GuideChoice[] = [
  {
    label: "I know a perfume",
    description: "Start from a fragrance you already like and add a twist.",
    value: "perfume",
  },
  {
    label: "I know a vibe",
    description: "Start with words like fresh, smoky, sweet, or clean.",
    value: "vibe",
  },
  {
    label: "Help me shop",
    description: "I want a good buy and need a little direction.",
    value: "shopping",
  },
  {
    label: "I’m new",
    description: "Walk me through it one small step at a time.",
    value: "new",
  },
];

export const GUIDE_VIBE_OPTIONS: GuideChoice[] = [
  { label: "Fresh", description: "Clean, airy, easy to wear", value: "fresh clean", query: "fresh clean" },
  { label: "Sweet", description: "Cozy, smooth, comforting", value: "sweet cozy", query: "sweet cozy" },
  { label: "Smoky", description: "Dark, resinous, mysterious", value: "smoky dark", query: "smoky dark" },
  { label: "Woody", description: "Polished, dry, grounded", value: "woody polished", query: "woody polished" },
  { label: "Floral", description: "Soft, pretty, elegant", value: "floral powdery", query: "floral powdery" },
  { label: "Citrus", description: "Bright, sparkling, upbeat", value: "citrus bright", query: "citrus bright" },
  { label: "Green", description: "Leafy, airy, natural", value: "green airy", query: "green airy" },
  { label: "Spicy", description: "Warm, peppery, textured", value: "spicy warm", query: "spicy warm" },
  { label: "Not sure", description: "Skip this step for now", value: "skip", query: "" },
];

export const GUIDE_BUDGET_OPTIONS: GuideChoice[] = [
  { label: "Under $100", description: "Keep it affordable", value: "under_100", query: "under $100" },
  { label: "$100–200", description: "Mid-range sweet spot", value: "100_200", query: "$100 to $200" },
  { label: "$200+", description: "More premium options", value: "200_plus", query: "$200+" },
  { label: "No limit", description: "Show me the best fit", value: "no_limit", query: "no budget limit" },
  { label: "No budget", description: "Skip this step for now", value: "skip", query: "" },
];

export const GUIDE_PRIORITY_OPTIONS: GuideChoice[] = [
  { label: "Easy to wear", description: "Safe, versatile, crowd-pleasing", value: "easy", query: "easy to wear" },
  { label: "High-end", description: "Luxury, polished, elevated", value: "high_end", query: "high-end" },
  { label: "Performance", description: "Louder, longer-lasting, stronger", value: "performance", query: "strong performance" },
  { label: "Distinctive", description: "Unusual, niche, more character", value: "unique", query: "distinctive niche" },
  { label: "No preference", description: "Skip this step for now", value: "skip", query: "" },
];

const budgetLabels: Record<GuideBudget, string> = {
  under_100: "under $100",
  "100_200": "$100–200",
  "200_plus": "$200+",
  no_limit: "no limit",
  skip: "skip",
};

const priorityLabels: Record<GuidePriority, string> = {
  easy: "easy to wear",
  high_end: "high-end",
  performance: "strong performance",
  unique: "distinctive",
  skip: "skip",
};

export function createGuideState(): GuideState {
  return {
    perfumeText: "",
    includeFavorites: true,
  };
}

export function getGuideQuestion(state: GuideState): GuideQuestion | null {
  const hasVibe = Boolean(state.vibe && state.vibe !== "skip");
  const hasBudget = Boolean(state.budget && state.budget !== "skip");
  const hasPriority = Boolean(state.priority && state.priority !== "skip");

  if (!state.mode) {
    return {
      key: "mode",
      title: "Start here",
      prompt: "What would be most helpful right now?",
      kind: "choice",
      options: GUIDE_MODE_OPTIONS,
    };
  }

  if (state.mode === "perfume" && !state.perfumeText.trim()) {
    return {
      key: "perfume",
      title: "Pick a reference",
      prompt: "Tell me one perfume you already like. I’ll use it as the anchor.",
      kind: "text",
      placeholder: "e.g. Layton, Naxos, Herod",
    };
  }

  if (!hasVibe) {
    return {
      key: "vibe",
      title: state.mode === "perfume" ? "Add a twist" : "Pick a direction",
      prompt:
        state.mode === "perfume"
          ? "What should we add or shift? Choose one style direction, or skip if you just want a close match."
          : "Which scent direction sounds closest to what you want?",
      kind: "choice",
      options: GUIDE_VIBE_OPTIONS,
    };
  }

  if (!hasBudget) {
    return {
      key: "budget",
      title: "Set a budget",
      prompt: "How much do you want to spend?",
      kind: "choice",
      options: GUIDE_BUDGET_OPTIONS,
    };
  }

  if (!hasPriority) {
    return {
      key: "priority",
      title: "What matters most?",
      prompt: "If two perfumes fit, what should we favor?",
      kind: "choice",
      options: GUIDE_PRIORITY_OPTIONS,
    };
  }

  return null;
}

export function guideReady(state: GuideState): boolean {
  const hasVibe = Boolean(state.vibe && state.vibe !== "skip");
  const hasBudget = Boolean(state.budget && state.budget !== "skip");
  const hasPriority = Boolean(state.priority && state.priority !== "skip");
  return Boolean(
    state.mode &&
      ((state.mode === "perfume" && state.perfumeText.trim()) ||
        hasVibe ||
        hasBudget ||
        hasPriority)
  );
}

export function buildGuideQuery(state: GuideState): string {
  const pieces: string[] = [];

  if (state.mode === "perfume" && state.perfumeText.trim()) {
    pieces.push(`smells like ${state.perfumeText.trim()}`);
    if (state.vibe && state.vibe !== "skip") {
      pieces.push(`but ${state.vibe}`);
    }
  } else if (state.mode === "shopping") {
    pieces.push("what should I buy");
    if (state.vibe && state.vibe !== "skip") {
      pieces.push(`for ${state.vibe}`);
    }
  } else if (state.mode === "new") {
    pieces.push("beginner perfume recommendation");
    if (state.vibe && state.vibe !== "skip") {
      pieces.push(state.vibe);
    }
  } else if (state.vibe && state.vibe !== "skip") {
    pieces.push(state.vibe);
  }

  if (state.budget && state.budget !== "skip") {
    pieces.push(`"${budgetLabels[state.budget]}"`);
  }
  if (state.priority && state.priority !== "skip") {
    pieces.push(priorityLabels[state.priority]);
  }

  if (pieces.length === 0) {
    return "what should I buy";
  }

  return pieces.join(" ");
}

export function summarizeGuideState(state: GuideState): string[] {
  const summary: string[] = [];
  if (state.mode) {
    summary.push(
      state.mode === "perfume"
        ? "Seed from a perfume you already like"
        : state.mode === "vibe"
          ? "Start from a scent vibe"
          : state.mode === "shopping"
            ? "Shopping help"
            : "Beginner mode"
    );
  }
  if (state.perfumeText.trim()) summary.push(`Reference: ${state.perfumeText.trim()}`);
  if (state.vibe && state.vibe !== "skip") summary.push(`Direction: ${state.vibe}`);
  if (state.budget && state.budget !== "skip") summary.push(`Budget: ${budgetLabels[state.budget]}`);
  if (state.priority && state.priority !== "skip") summary.push(`Priority: ${priorityLabels[state.priority]}`);
  summary.push(state.includeFavorites ? "Favorites included" : "Favorites excluded");
  return summary;
}
