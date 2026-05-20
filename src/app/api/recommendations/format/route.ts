import { NextRequest, NextResponse } from "next/server";
import { formatRecommendationResponse } from "@/lib/rag-ai";
import type { Perfume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

async function readBody(request: NextRequest): Promise<{
  include_favorites?: boolean;
  seed_count?: number;
  favorite_count?: number;
  seed_perfumes?: Perfume[];
  favorite_perfumes?: Perfume[];
  groups?: Array<{
    seedId: number;
    seedName: string;
    items: Array<{
      perfume: Perfume;
      similarity: number;
    }>;
  }>;
  vote_count?: number;
}> {
  try {
    return (await request.json()) as {
      include_favorites?: boolean;
      seed_count?: number;
      favorite_count?: number;
      seed_perfumes?: Perfume[];
      favorite_perfumes?: Perfume[];
      groups?: Array<{
        seedId: number;
        seedName: string;
        items: Array<{
          perfume: Perfume;
          similarity: number;
        }>;
      }>;
      vote_count?: number;
    };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const result = await formatRecommendationResponse({
    includeFavorites: body.include_favorites ?? true,
    seedCount: body.seed_count ?? 0,
    favoriteCount: body.favorite_count ?? 0,
    seedPerfumes: body.seed_perfumes ?? [],
    favoritePerfumes: body.favorite_perfumes ?? [],
    groups: body.groups ?? [],
    voteCount: body.vote_count ?? 0,
  });

  return NextResponse.json({
    ...result,
    llm_used: Boolean(result.model_used),
    llm_model: result.model_used ?? "",
    research_used: result.research_performed,
    research_model: result.research_model_used ?? "",
  });
}
