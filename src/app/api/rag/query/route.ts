import { NextRequest, NextResponse } from "next/server";
import { queryRag } from "@/lib/rag";
import { formatRagResponse } from "@/lib/rag-ai";
import type { Perfume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseLimit(value: string | null): number {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 5;
  return Math.max(1, Math.min(parsed, 20));
}

async function readBody(request: NextRequest): Promise<{
  query?: string;
  limit?: number;
  seed_ids?: number[];
  favorite_ids?: number[];
  seed_perfumes?: Perfume[];
  favorite_perfumes?: Perfume[];
  include_favorites?: boolean;
  ranking_preference?: "balanced" | "popular" | "niche";
}> {
  try {
    const body = (await request.json()) as {
      query?: string;
      limit?: number;
      seed_ids?: number[];
      favorite_ids?: number[];
      seed_perfumes?: Perfume[];
      favorite_perfumes?: Perfume[];
      include_favorites?: boolean;
      ranking_preference?: "balanced" | "popular" | "niche";
    };
    return body ?? {};
  } catch {
    return {};
  }
}

function parseIds(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const seedIds = parseIds(request.nextUrl.searchParams.get("seed_ids"));
  const favoriteIds = parseIds(request.nextUrl.searchParams.get("favorite_ids"));
  const includeFavorites = request.nextUrl.searchParams.get("include_favorites") !== "0";
  const rankingPreference = request.nextUrl.searchParams.get("ranking_preference");

  if (query.trim().length < 2) {
    return NextResponse.json({ error: "Query too short." }, { status: 400 });
  }

  const result = queryRag(query, limit, {
    seedIds,
    favoriteIds,
    includeFavorites,
    rankingPreference:
      rankingPreference === "popular" || rankingPreference === "niche" ? rankingPreference : "balanced",
  });
  const ai = await formatRagResponse({
    query: result.query,
    intent: result.intent,
    results: result.results,
    beginnerHint: result.beginner_hint,
    matchedConcepts: result.matched_concepts,
    includeFavorites,
    seedCount: seedIds.length,
    favoriteCount: favoriteIds.length,
    blendQuery: result.blend_query ?? undefined,
  });
  return NextResponse.json({
    ...result,
    answer: ai.answer,
    research_summary: ai.research_summary,
    follow_up: ai.follow_up,
    confidence: ai.confidence,
    llm_used: Boolean(ai.model_used),
    llm_model: ai.model_used ?? "",
    research_used: ai.research_performed,
    research_model: ai.research_model_used ?? "",
  });
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const query = (body.query ?? "").trim();
  const limit = Math.max(1, Math.min(body.limit ?? 5, 20));
  const seedIds = body.seed_ids ?? [];
  const favoriteIds = body.favorite_ids ?? [];
  const seedPerfumes = body.seed_perfumes ?? [];
  const favoritePerfumes = body.favorite_perfumes ?? [];
  const includeFavorites = body.include_favorites ?? true;
  const rankingPreference = body.ranking_preference ?? "balanced";

  if (query.length < 2) {
    return NextResponse.json({ error: "Query too short." }, { status: 400 });
  }

  const result = queryRag(query, limit, {
    seedIds,
    favoriteIds,
    seedPerfumes,
    favoritePerfumes,
    includeFavorites,
    rankingPreference: rankingPreference === "popular" || rankingPreference === "niche" ? rankingPreference : "balanced",
  });
  const ai = await formatRagResponse({
    query: result.query,
    intent: result.intent,
    results: result.results,
    beginnerHint: result.beginner_hint,
    matchedConcepts: result.matched_concepts,
    includeFavorites,
    seedCount: seedPerfumes.length || seedIds.length,
    favoriteCount: favoritePerfumes.length || favoriteIds.length,
    blendQuery: result.blend_query ?? undefined,
    researchNotes: "",
  });
  return NextResponse.json({
    ...result,
    answer: ai.answer,
    research_summary: ai.research_summary,
    follow_up: ai.follow_up,
    confidence: ai.confidence,
    llm_used: Boolean(ai.model_used),
    llm_model: ai.model_used ?? "",
    research_used: ai.research_performed,
    research_model: ai.research_model_used ?? "",
  });
}
