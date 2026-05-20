import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeginnerQuizProfile } from "./quiz";
import type { ChatHistoryEntry, OnboardingChoice, SavedRecommendation } from "./library-store";

export interface UserProfileRow {
  user_id: string;
  onboarding_choice: OnboardingChoice | null;
  taste_profile: BeginnerQuizProfile | null;
  include_favorites_default: boolean;
  ranking_preference: BeginnerQuizProfile["rankingPreference"] | "balanced" | "popular" | "niche";
  last_query: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadRow {
  id: string;
  user_id: string;
  title: string;
  surface: string;
  summary: string | null;
  include_favorites: boolean;
  ranking_preference: string;
  seed_ids: unknown;
  taste_profile: BeginnerQuizProfile | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SavedRecommendationRow {
  user_id: string;
  doc_id: string;
  thread_id: string | null;
  query: string | null;
  brand: string;
  name: string;
  official_url: string | null;
  url: string | null;
  source_type: string | null;
  rating_value: string | null;
  rating_count: string | null;
  accords: string[] | null;
  notes: string[] | null;
  release_signal: string | null;
  snippet: string | null;
  score: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function mapSavedRecommendation(row: SavedRecommendationRow): SavedRecommendation {
  return {
    doc_id: row.doc_id,
    query: row.query ?? "",
    brand: row.brand,
    name: row.name,
    official_url: row.official_url ?? "",
    url: row.url ?? "",
    source_type: row.source_type ?? "",
    rating_value: row.rating_value ?? "",
    rating_count: row.rating_count ?? "",
    accords: row.accords ?? [],
    notes: row.notes ?? [],
    release_signal: row.release_signal ?? "",
    snippet: row.snippet ?? "",
    score: row.score ?? 0,
    created_at: row.created_at,
  };
}

function mapChatHistoryEntry(thread: ChatThreadRow, messages: ChatMessageRow[]): ChatHistoryEntry {
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find((message) => message.role === "assistant");
  const resultPayload = assistantMessage?.metadata?.results;
  const results = Array.isArray(resultPayload)
    ? resultPayload.map((item) => item as SavedRecommendation)
    : [];

  return {
    query: userMessage?.content || thread.title || "Conversation",
    summary: thread.summary || assistantMessage?.content || "Saved chat thread.",
    created_at: thread.last_message_at || thread.created_at,
    results,
  };
}

export async function loadUserProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as UserProfileRow | null;
}

export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: Partial<UserProfileRow> & Pick<UserProfileRow, "ranking_preference">,
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        onboarding_choice: profile.onboarding_choice ?? null,
        taste_profile: profile.taste_profile ?? null,
        include_favorites_default: profile.include_favorites_default ?? true,
        ranking_preference: profile.ranking_preference,
        last_query: profile.last_query ?? null,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as UserProfileRow | null;
}

export async function createChatThread(
  supabase: SupabaseClient,
  params: {
    userId: string;
    title: string;
    surface: string;
    summary?: string | null;
    includeFavorites?: boolean;
    rankingPreference?: string;
    seedIds?: unknown;
    tasteProfile?: BeginnerQuizProfile | null;
  },
) {
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      user_id: params.userId,
      title: params.title,
      surface: params.surface,
      summary: params.summary ?? null,
      include_favorites: params.includeFavorites ?? true,
      ranking_preference: params.rankingPreference ?? "balanced",
      seed_ids: params.seedIds ?? [],
      taste_profile: params.tasteProfile ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ChatThreadRow | null;
}

export async function updateChatThread(
  supabase: SupabaseClient,
  threadId: string,
  patch: Partial<Pick<ChatThreadRow, "title" | "summary" | "surface" | "include_favorites" | "ranking_preference" | "seed_ids" | "taste_profile" | "last_message_at">>,
) {
  const { data, error } = await supabase
    .from("chat_threads")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.surface !== undefined ? { surface: patch.surface } : {}),
      ...(patch.include_favorites !== undefined ? { include_favorites: patch.include_favorites } : {}),
      ...(patch.ranking_preference !== undefined ? { ranking_preference: patch.ranking_preference } : {}),
      ...(patch.seed_ids !== undefined ? { seed_ids: patch.seed_ids } : {}),
      ...(patch.taste_profile !== undefined ? { taste_profile: patch.taste_profile } : {}),
      ...(patch.last_message_at !== undefined ? { last_message_at: patch.last_message_at } : {}),
    })
    .eq("id", threadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ChatThreadRow | null;
}

export async function appendChatMessage(
  supabase: SupabaseClient,
  params: {
    threadId: string;
    userId: string;
    role: ChatMessageRow["role"];
    content: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: params.threadId,
      user_id: params.userId,
      role: params.role,
      content: params.content,
      metadata: params.metadata ?? {},
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ChatMessageRow | null;
}

export async function loadRecentChatHistory(supabase: SupabaseClient, userId: string, limit = 12) {
  const threads = await loadRecentChatThreads(supabase, userId, limit);

  const history: ChatHistoryEntry[] = [];
  for (const thread of threads) {
    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(8);

    if (messagesError) throw messagesError;
    history.push(mapChatHistoryEntry(thread, (messages ?? []) as ChatMessageRow[]));
  }

  return history;
}

export async function loadRecentChatThreads(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
) {
  const { data: threads, error: threadsError } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (threadsError) throw threadsError;
  return (threads ?? []) as ChatThreadRow[];
}

export async function loadRecentSavedRecommendations(
  supabase: SupabaseClient,
  userId: string,
  limit = 24,
) {
  const { data, error } = await supabase
    .from("saved_recommendations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => mapSavedRecommendation(row as SavedRecommendationRow));
}

export async function upsertSavedRecommendation(
  supabase: SupabaseClient,
  params: SavedRecommendation & { userId: string; threadId?: string | null; metadata?: Record<string, unknown> | null },
) {
  const { data, error } = await supabase
    .from("saved_recommendations")
    .upsert(
      {
        user_id: params.userId,
        doc_id: params.doc_id,
        thread_id: params.threadId ?? null,
        query: params.query,
        brand: params.brand,
        name: params.name,
        official_url: params.official_url,
        url: params.url,
        source_type: params.source_type,
        rating_value: params.rating_value,
        rating_count: params.rating_count,
        accords: params.accords,
        notes: params.notes,
        release_signal: params.release_signal,
        snippet: params.snippet,
        score: params.score,
        metadata: params.metadata ?? {},
      },
      { onConflict: "user_id,doc_id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as SavedRecommendationRow | null;
}

export function summarizeThreadTitle(query: string) {
  return query.slice(0, 60).trim() || "New conversation";
}
