import { NextRequest, NextResponse } from "next/server";
import { queryRag } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseLimit(value: string | null): number {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 5;
  return Math.max(1, Math.min(parsed, 20));
}

async function readBody(request: NextRequest): Promise<{ query?: string; limit?: number; ranking_preference?: string }> {
  try {
    const body = (await request.json()) as { query?: string; limit?: number; ranking_preference?: string };
    return body ?? {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const rankingPreference = request.nextUrl.searchParams.get("ranking_preference");

  if (query.trim().length < 2) {
    return NextResponse.json({ error: "Query too short." }, { status: 400 });
  }

  const result = queryRag(query, limit, {
    rankingPreference:
      rankingPreference === "popular" || rankingPreference === "niche" ? rankingPreference : "balanced",
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const query = (body.query ?? "").trim();
  const limit = Math.max(1, Math.min(body.limit ?? 5, 20));
  const rankingPreference = body.ranking_preference;

  if (query.length < 2) {
    return NextResponse.json({ error: "Query too short." }, { status: 400 });
  }

  const result = queryRag(query, limit, {
    rankingPreference:
      rankingPreference === "popular" || rankingPreference === "niche" ? rankingPreference : "balanced",
  });
  return NextResponse.json(result);
}
