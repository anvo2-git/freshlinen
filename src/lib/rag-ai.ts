import { displayPerfumeName, displayPerfumeTitle } from "./perfume-display";
import type { RagQueryResponse, RagResult } from "./rag";

type OpenAiChoice = {
  message?: {
    content?: string | null;
  };
};

type OpenAiResponse = {
  choices?: OpenAiChoice[];
};

export interface RagAIPayload {
  query: string;
  intent: RagQueryResponse["intent"];
  results: RagResult[];
  beginnerHint: string;
  matchedConcepts: string[];
  includeFavorites: boolean;
  seedCount: number;
  favoriteCount: number;
  blendQuery?: RagQueryResponse["blend_query"];
  researchNotes?: string;
}

export interface RagAIResponse {
  answer: string;
  follow_up?: string;
  research_summary?: string;
  confidence?: "high" | "medium" | "low";
  research_performed: boolean;
  model_used?: string;
  research_model_used?: string;
}

export interface RecommendationGroupInput {
  seedId: number;
  seedName: string;
  items: Array<{
    perfume: {
      id: number;
      n: string;
      b: string;
      g: string;
      r: number;
      rc: number;
      aw: Record<string, number>;
    };
    similarity: number;
  }>;
}

export interface RecommendationAIPayload {
  includeFavorites: boolean;
  seedCount: number;
  favoriteCount: number;
  seedPerfumes: Array<{
    id: number;
    n: string;
    b: string;
    g: string;
    r: number;
    rc: number;
    aw: Record<string, number>;
  }>;
  favoritePerfumes: Array<{
    id: number;
    n: string;
    b: string;
    g: string;
    r: number;
    rc: number;
    aw: Record<string, number>;
  }>;
  groups: RecommendationGroupInput[];
  voteCount: number;
}

export interface RecommendationAIResponse {
  answer: string;
  follow_up?: string;
  research_summary?: string;
  confidence?: "high" | "medium" | "low";
  research_performed: boolean;
  model_used?: string;
  research_model_used?: string;
}

const DEFAULT_GENERATION_MODEL = process.env.OPENAI_RAG_MODEL || "gpt-5.5";
const DEFAULT_RESEARCH_MODEL = process.env.OPENAI_RAG_RESEARCH_MODEL || "gpt-4o-search-preview";

function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}

function formatResultsForPrompt(results: RagResult[]): string {
  if (results.length === 0) return "[]";
  return JSON.stringify(
    results.slice(0, 6).map((result) => ({
      brand: result.brand,
      name: displayPerfumeTitle(result.brand, result.name),
      score: result.score,
      source_type: result.source_type,
      accords: result.accords.slice(0, 6),
      notes: result.notes.slice(0, 6),
      release_signal: result.release_signal,
      rationale: result.rationale,
      snippet: result.snippet,
    })),
    null,
    2
  );
}

function buildResearchPrompt(payload: RagAIPayload): string {
  const targets = payload.results.slice(0, 2).map((result) => `${result.brand} / ${displayPerfumeTitle(result.brand, result.name)}`);
  return [
    "You are doing targeted web research for perfume recommendation support.",
    "Research only the explicitly named perfumes below.",
    "Prefer accessible official or retailer sources. If a source is blocked, say so and move on.",
    "Do not invent facts or infer price/positioning without support.",
    "Return JSON only with this shape:",
    "{",
    '  "items": [',
    "    {",
    '      "brand": "string",',
    '      "name": "string",',
    '      "positioning": "string",',
    '      "price": "string",',
    '      "concentration": "string",',
    '      "launch_year": "string",',
    '      "house_notes": ["string"],',
    '      "sources": ["string"],',
    '      "confidence": "high|medium|low",',
    '      "blocked": "string" ',
    "    }",
    "  ]",
    "}",
    "",
    `User query: ${truncate(payload.query, 300)}`,
    `Targets: ${targets.join("; ") || "none"}`,
    `Why it matters: ${payload.intent === "comparison" ? "compare positioning and feel" : "support recommendation and high-end / niche interpretation"}`,
  ].join("\n");
}

function buildRecommendationResearchPrompt(payload: RecommendationAIPayload): string {
  const names = [
    ...payload.seedPerfumes.map((perfume) => `${perfume.b} / ${displayPerfumeTitle(perfume.b, perfume.n)}`),
    ...payload.groups.flatMap((group) =>
      group.items.slice(0, 2).map((item) => `${item.perfume.b} / ${displayPerfumeTitle(item.perfume.b, item.perfume.n)}`)
    ),
  ];
  return [
    "You are doing targeted web research for perfume recommendation support.",
    "Research only the explicitly named perfumes below.",
    "Prefer accessible official or retailer sources. If a source is blocked, say so and move on.",
    "Do not invent facts or infer price/positioning without support.",
    "Return JSON only with this shape:",
    "{",
    '  "items": [',
    "    {",
    '      "brand": "string",',
    '      "name": "string",',
    '      "positioning": "string",',
    '      "price": "string",',
    '      "concentration": "string",',
    '      "launch_year": "string",',
    '      "house_notes": ["string"],',
    '      "sources": ["string"],',
    '      "confidence": "high|medium|low",',
    '      "blocked": "string" ',
    "    }",
    "  ]",
    "}",
    "",
    `Why it matters: support recommendation framing, high-end / niche interpretation, and tradeoffs.`,
    `Favorites included: ${payload.includeFavorites ? "yes" : "no"}`,
    `Seed count: ${payload.seedCount}`,
    `Favorite count: ${payload.favoriteCount}`,
    `Vote count: ${payload.voteCount}`,
    `Targets: ${Array.from(new Set(names)).join("; ") || "none"}`,
  ].join("\n");
}

function buildGenerationPrompt(payload: RagAIPayload): string {
  const blendQueryLine = payload.blendQuery
    ? `Blend query: anchor=${payload.blendQuery.reference_text}; modifier=${payload.blendQuery.modifier_text}`
    : "Blend query: none";
  return [
    "You are formatting a perfume retrieval answer for a user.",
    "Use the retrieved corpus results as the primary source of truth.",
    "Use the research notes only as supporting context.",
    "Do not change the ranking of the retrieved results.",
    "Do not invent perfume facts, prices, or notes.",
    "If the evidence is weak, say so plainly.",
    "If Favorites are excluded, respect that.",
    "If the user sounds new to perfume, keep the language beginner-friendly.",
    "Return JSON only with this shape:",
    "{",
    '  "answer": "string",',
    '  "follow_up": "string",',
    '  "research_summary": "string",',
    '  "confidence": "high|medium|low"',
    "}",
    "",
    `User query: ${truncate(payload.query, 300)}`,
    `Intent: ${payload.intent}`,
    `Seeds: ${payload.seedCount}`,
    `Favorites included: ${payload.includeFavorites ? "yes" : "no"}`,
    `Favorite count: ${payload.favoriteCount}`,
    `Matched concepts: ${payload.matchedConcepts.join(", ") || "none"}`,
    `Beginner hint: ${payload.beginnerHint || "none"}`,
    blendQueryLine,
    "",
    "Retrieved results (ordered):",
    formatResultsForPrompt(payload.results),
    "",
    "Research notes:",
    payload.researchNotes?.trim() || "none",
  ].join("\n");
}

function buildRecommendationGenerationPrompt(
  payload: RecommendationAIPayload,
  researchNotes: string
): string {
  return [
    "You are formatting a perfume recommendation answer for a user.",
    "Use the ranked recommendations as the primary source of truth.",
    "Use the research notes only as supporting context.",
    "Do not change the ranking.",
    "Do not invent perfume facts, prices, or notes.",
    "If the evidence is weak, say so plainly.",
    "If Favorites are excluded, respect that.",
    "Return JSON only with this shape:",
    "{",
    '  "answer": "string",',
    '  "follow_up": "string",',
    '  "research_summary": "string",',
    '  "confidence": "high|medium|low"',
    "}",
    "",
    `Favorites included: ${payload.includeFavorites ? "yes" : "no"}`,
    `Seed count: ${payload.seedCount}`,
    `Favorite count: ${payload.favoriteCount}`,
    `Vote count: ${payload.voteCount}`,
    "Session Seeds:",
    JSON.stringify(
      payload.seedPerfumes.map((perfume) => ({
        brand: perfume.b,
        name: displayPerfumeTitle(perfume.b, perfume.n),
        rating: perfume.r,
      })),
      null,
      2
    ),
    "",
    "Included Favorites:",
    JSON.stringify(
      payload.favoritePerfumes.map((perfume) => ({
        brand: perfume.b,
        name: displayPerfumeTitle(perfume.b, perfume.n),
        rating: perfume.r,
      })),
      null,
      2
    ),
    "",
    "Recommendation groups:",
    JSON.stringify(
      payload.groups.map((group) => ({
        seed: `${group.seedName}`,
        items: group.items.slice(0, 5).map((item) => ({
          brand: item.perfume.b,
          name: displayPerfumeTitle(item.perfume.b, item.perfume.n),
          similarity: Number(item.similarity.toFixed(3)),
        })),
      })),
      null,
      2
    ),
    "",
    "Research notes:",
    researchNotes.trim() || "none",
  ].join("\n");
}

function extractJsonText(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

async function callOpenAI(
  model: string,
  prompt: string,
  temperature: number
): Promise<string | null> {
  if (!hasOpenAIKey()) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Be precise, concise, and faithful to the provided evidence. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.trim() || null;
}

function safeParse(content: string | null): Record<string, unknown> | null {
  if (!content) return null;
  try {
    return JSON.parse(extractJsonText(content)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fallbackAnswer(payload: RagAIPayload): RagAIResponse {
  const top = payload.results[0];
  const answer = payload.blendQuery && top
    ? `Closest match for ${payload.blendQuery.reference_text} + ${payload.blendQuery.modifier_text}: ${displayPerfumeTitle(top.brand, top.name)}. Anchor: ${payload.blendQuery.reference_text}. Modifier: ${payload.blendQuery.modifier_text}. ${top.rationale}`
    : top
      ? `Best match: ${displayPerfumeTitle(top.brand, top.name)}. ${top.rationale}`
      : payload.beginnerHint || "No strong matches surfaced. Try a perfume name, a few notes, or a narrower vibe.";
  return {
    answer,
    follow_up: payload.beginnerHint || "",
    research_summary: "",
    confidence: top ? "medium" : "low",
    research_performed: false,
    model_used: "",
    research_model_used: "",
  };
}

export async function formatRagResponse(payload: RagAIPayload): Promise<RagAIResponse> {
  const base = fallbackAnswer(payload);
  if (!hasOpenAIKey()) return base;

  let researchNotes = "";
  let researchPerformed = false;

  const shouldResearch =
    payload.results.length > 0 &&
    (payload.intent === "comparison" ||
      payload.intent === "alternative" ||
      /(?:high-end|high end|price|budget|niche|designer|luxury|expensive|prestige)/i.test(payload.query));

  if (shouldResearch) {
    try {
      const researchPrompt = buildResearchPrompt(payload);
      const researchContent = await callOpenAI(DEFAULT_RESEARCH_MODEL, researchPrompt, 0);
      const parsed = safeParse(researchContent);
      if (parsed && Array.isArray(parsed.items)) {
        researchPerformed = true;
        researchNotes = JSON.stringify(parsed.items, null, 2);
      }
    } catch {
      researchNotes = "";
    }
  }

  try {
    const generationPrompt = buildGenerationPrompt({
      ...payload,
      blendQuery: payload.blendQuery,
      researchNotes,
    });
    const generationContent = await callOpenAI(DEFAULT_GENERATION_MODEL, generationPrompt, 0.2);
    const parsed = safeParse(generationContent);
    if (parsed) {
      const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : base.answer;
      const followUp = typeof parsed.follow_up === "string" ? parsed.follow_up.trim() : "";
      const researchSummary = typeof parsed.research_summary === "string" ? parsed.research_summary.trim() : researchNotes;
      const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : base.confidence;

      return {
        answer,
        follow_up: followUp,
        research_summary: researchSummary,
        confidence,
        research_performed: researchPerformed,
        model_used: DEFAULT_GENERATION_MODEL,
        research_model_used: researchPerformed ? DEFAULT_RESEARCH_MODEL : "",
      };
    }
  } catch {
    // Fall through to the deterministic answer.
  }

  return {
    ...base,
    research_summary: researchNotes,
    research_performed: researchPerformed,
    model_used: DEFAULT_GENERATION_MODEL,
    research_model_used: researchPerformed ? DEFAULT_RESEARCH_MODEL : "",
  };
}

export async function formatRecommendationResponse(
  payload: RecommendationAIPayload
): Promise<RecommendationAIResponse> {
  const base: RecommendationAIResponse = {
    answer: payload.seedCount > 0
      ? "These recommendations are ranked by accord similarity to your session Seeds."
      : "Add up to 3 Seeds to generate recommendations.",
    follow_up: "",
    research_summary: "",
    confidence: payload.seedCount > 0 ? "medium" : "low",
    research_performed: false,
    model_used: "",
    research_model_used: "",
  };

  if (!hasOpenAIKey()) return base;

  let researchNotes = "";
  let researchPerformed = false;

  try {
    const researchPrompt = buildRecommendationResearchPrompt(payload);
    const researchContent = await callOpenAI(DEFAULT_RESEARCH_MODEL, researchPrompt, 0);
    const parsed = safeParse(researchContent);
    if (parsed && Array.isArray(parsed.items)) {
      researchPerformed = true;
      researchNotes = JSON.stringify(parsed.items, null, 2);
    }
  } catch {
    researchNotes = "";
  }

  try {
    const generationPrompt = buildRecommendationGenerationPrompt(payload, researchNotes);
    const generationContent = await callOpenAI(DEFAULT_GENERATION_MODEL, generationPrompt, 0.2);
    const parsed = safeParse(generationContent);
    if (parsed) {
      const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : base.answer;
      const followUp = typeof parsed.follow_up === "string" ? parsed.follow_up.trim() : "";
      const researchSummary = typeof parsed.research_summary === "string" ? parsed.research_summary.trim() : researchNotes;
      const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : base.confidence;
      return {
        answer,
        follow_up: followUp,
        research_summary: researchSummary,
        confidence,
        research_performed: researchPerformed,
        model_used: DEFAULT_GENERATION_MODEL,
        research_model_used: researchPerformed ? DEFAULT_RESEARCH_MODEL : "",
      };
    }
  } catch {
    // Fall through.
  }

  return {
    ...base,
    research_summary: researchNotes,
    research_performed: researchPerformed,
    model_used: DEFAULT_GENERATION_MODEL,
    research_model_used: researchPerformed ? DEFAULT_RESEARCH_MODEL : "",
  };
}
