"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadChatHistory,
  loadSavedRecommendations,
  readOnboardingChoice,
  saveChatHistory,
  saveRecommendation,
  writeOnboardingChoice,
  type ChatHistoryEntry,
  type OnboardingChoice,
  type SavedRecommendation,
} from "@/lib/library-store";

type RagResult = {
  doc_id: string;
  source_type: string;
  brand: string;
  name: string;
  url: string;
  official_url: string;
  rating_value: string;
  rating_count: string;
  accords: string[];
  notes: string[];
  release_signal: string;
  score: number;
  matched_terms: string[];
  snippet: string;
  quality_score: number;
};

type RagResponse = {
  query: string;
  limit: number;
  corpus_size: number;
  indexed_size: number;
  results: RagResult[];
  error?: string;
};

type ChatMessage =
  | {
      id: string;
      role: "assistant";
      title?: string;
      text: string;
      results?: RagResult[];
      query?: string;
    }
  | {
      id: string;
      role: "user";
      text: string;
    };

const NEW_USER_STEPS = [
  {
    key: "likes",
    label: "What do you usually like?",
    helper: "Think broad families: fresh woods, vanilla, rose, incense, citrus, musk.",
    chips: ["clean woods", "vanilla", "rose", "incense", "citrus", "musks"],
  },
  {
    key: "dislikes",
    label: "What do you want to avoid?",
    helper: "Tell me what turns you off, even if it is very specific.",
    chips: ["too sweet", "powdery", "aquatic", "fruity", "synthetic", "smoky"],
  },
  {
    key: "occasion",
    label: "What are you dressing for?",
    helper: "The same scent can feel right for work, dates, heat, or evenings out.",
    chips: ["everyday", "office", "date night", "cold weather", "heat", "special occasion"],
  },
] as const;

const QUICK_PROMPTS = [
  "Teach me what I like.",
  "I want 3 perfumes for work.",
  "Give me something cleaner than my usual taste.",
  "Show me something warm, dark, and expensive.",
];

const FOLLOWUP_PROMPTS = [
  "Make it more airy.",
  "Less sweet, still interesting.",
  "More dramatic.",
  "I want only three options.",
];

function storageLabel(userId: string | null | undefined) {
  return userId ? "local" : "session";
}

function persistResult(result: RagResult, query: string): SavedRecommendation {
  return {
    doc_id: result.doc_id,
    query,
    brand: result.brand,
    name: result.name,
    official_url: result.official_url,
    url: result.url,
    source_type: result.source_type,
    rating_value: result.rating_value,
    rating_count: result.rating_count,
    accords: result.accords,
    notes: result.notes,
    release_signal: result.release_signal,
    snippet: result.snippet,
    score: result.score,
    created_at: new Date().toISOString(),
  };
}

function ResultCard({
  result,
  query,
  onSave,
  alreadySaved,
}: {
  result: RagResult;
  query: string;
  onSave: () => void;
  alreadySaved: boolean;
}) {
  const href = result.official_url || result.url;

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/80 shadow-[0_14px_40px_rgba(68,44,28,0.08)]">
      <div className="flex items-start justify-between gap-3 border-b border-stone-200/70 px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-600">
            {result.source_type.replace(/_/g, " ")}
          </div>
          <h3 className="mt-1 text-base font-semibold text-stone-950">
            {result.brand}
            <span className="mx-1 text-stone-400">/</span>
            {result.name}
          </h3>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {result.score.toFixed(1)}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <p className="text-sm leading-relaxed text-stone-700">{result.snippet}</p>

        <div className="flex flex-wrap gap-2 text-xs">
          {result.accords.slice(0, 4).map((accord) => (
            <span key={accord} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
              {accord}
            </span>
          ))}
          {result.notes.slice(0, 4).map((note) => (
            <span key={note} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
              {note}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
          {result.rating_value ? <span>Rating {result.rating_value}</span> : null}
          {result.rating_count ? <span>{result.rating_count} votes</span> : null}
          {result.release_signal ? <span>{result.release_signal}</span> : null}
          {result.matched_terms.length > 0 ? (
            <span>Matched: {result.matched_terms.join(", ")}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
          >
            Open source
          </a>
          <button
            type="button"
            onClick={onSave}
            className="rounded-full bg-stone-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
          >
            {alreadySaved ? "Saved to library" : "Save to library"}
          </button>
          <span className="self-center text-[11px] uppercase tracking-[0.26em] text-stone-400">
            From query: {query}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ChatAssistant({ surface = "home" }: { surface?: "home" | "rag" }) {
  const { userId, isLoaded } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "session" | null>(null);
  const [accessChoice, setAccessChoice] = useState<OnboardingChoice | null>(null);
  const [stage, setStage] = useState<"gate" | "onboarding" | "ready">("gate");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({ likes: "", dislikes: "", occasion: "" });
  const [stepValue, setStepValue] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [savedRecommendations, setSavedRecommendations] = useState<SavedRecommendation[]>([]);

  useEffect(() => {
    if (!isLoaded) return;

    const nextStorageMode = storageLabel(userId);
    const storage = typeof window === "undefined"
      ? null
      : nextStorageMode === "local"
        ? window.localStorage
        : window.sessionStorage;

    const choice = readOnboardingChoice(storage);
    setStorageMode(nextStorageMode);
    setAccessChoice(choice);
    setChatHistory(loadChatHistory(storage));
    setSavedRecommendations(loadSavedRecommendations(storage));
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        text:
          surface === "home"
            ? "Tell me what you want to smell like, and I will return three perfumes that fit."
            : "Search the corpus like a conversation. Ask for a vibe, a note family, or a perfume you want to move toward.",
      },
    ]);
    setStage(choice === "new" ? "onboarding" : choice === "returning" ? "ready" : "gate");
    setStepIndex(0);
    setAnswers({ likes: "", dislikes: "", occasion: "" });
    setStepValue("");
    setQuery("");
    setError("");
    setLoading(false);
    setHydrated(true);
  }, [isLoaded, userId, surface]);

  const currentStorage = useMemo(() => {
    if (typeof window === "undefined" || !storageMode) return null;
    return storageMode === "local" ? window.localStorage : window.sessionStorage;
  }, [storageMode]);

  const currentStep = NEW_USER_STEPS[stepIndex];
  const quickPrompts =
    stage === "onboarding" ? NEW_USER_STEPS[stepIndex]?.chips ?? QUICK_PROMPTS : QUICK_PROMPTS;
  const recentPrompts = chatHistory.slice(0, 3).map((item) => item.query).filter(Boolean);

  function appendMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function startNewUserFlow() {
    const storage = currentStorage;
    if (storage) {
      writeOnboardingChoice(storage, "new");
    }
    setAccessChoice("new");
    setStage("onboarding");
    setStepIndex(0);
    setStepValue("");
    setAnswers({ likes: "", dislikes: "", occasion: "" });
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        text: "Let’s build your taste profile first. I’ll ask three focused questions, then we’ll move into open chat.",
      },
    ]);
  }

  function startReturningFlow() {
    const storage = currentStorage;
    if (storage) {
      writeOnboardingChoice(storage, "returning");
    }
    setAccessChoice("returning");
    setStage("ready");
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        text:
          surface === "home"
            ? "Good. Tell me the vibe, perfume, or note profile you want, and I’ll narrow it to three."
            : "Ready. Ask for a search, a recommendation, or a scent direction and I will pull three options.",
      },
    ]);
  }

  function saveHistoryEntry(queryText: string, results: RagResult[]) {
    const storage = currentStorage;
    if (!storage) return;
    const entry: ChatHistoryEntry = {
      query: queryText,
      summary: results.length
        ? `${results[0].brand} / ${results[0].name} and ${Math.max(results.length - 1, 0)} more`
        : "No matches returned.",
      created_at: new Date().toISOString(),
      results: results.map((result) => persistResult(result, queryText)),
    };
    saveChatHistory(storage, entry);
    setChatHistory(loadChatHistory(storage));
  }

  function saveToLibrary(result: RagResult, queryText: string) {
    const storage = currentStorage;
    if (!storage) return;
    saveRecommendation(storage, persistResult(result, queryText));
    setSavedRecommendations(loadSavedRecommendations(storage));
  }

  async function runQuery(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2 || loading) return;

    setLoading(true);
    setError("");
    setQuery(trimmed);
    appendMessage({ id: `user-${Date.now()}`, role: "user", text: trimmed });

    try {
      const res = await fetch(`/api/rag/query?q=${encodeURIComponent(trimmed)}&limit=3`);
      const data = (await res.json()) as RagResponse;
      if (!res.ok) {
        const message = data.error || "RAG query failed.";
        setError(message);
        appendMessage({ id: `assistant-error-${Date.now()}`, role: "assistant", text: message });
        return;
      }

      const topResults = data.results?.slice(0, 3) ?? [];
      const summary =
        topResults.length > 0
          ? `I found ${topResults.length} options that fit "${trimmed}".`
          : `I could not find a clean match for "${trimmed}", but we can tighten the prompt.`;

      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        title: topResults.length > 0 ? "We think you might like" : "Try again",
        text: summary,
        results: topResults,
        query: trimmed,
      });

      if (topResults.length > 0) {
        saveHistoryEntry(trimmed, topResults);
      }
      setQuery("");
    } catch {
      const message = "Network error.";
      setError(message);
      appendMessage({ id: `assistant-network-${Date.now()}`, role: "assistant", text: message });
    } finally {
      setLoading(false);
    }
  }

  function submitOnboardingStep() {
    const trimmed = stepValue.trim();
    if (!trimmed) return;

    const nextAnswers = { ...answers };
    const key = NEW_USER_STEPS[stepIndex].key;
    nextAnswers[key] = trimmed;
    setAnswers(nextAnswers);

    if (stepIndex < NEW_USER_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
      setStepValue("");
      return;
    }

    const storage = currentStorage;
    if (storage) {
      writeOnboardingChoice(storage, "new");
    }
    setAccessChoice("new");
    setStage("ready");
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        title: "Taste profile set",
        text: `You like ${nextAnswers.likes}. You want to avoid ${nextAnswers.dislikes}. For ${nextAnswers.occasion}, I will keep the first three suggestions disciplined and relevant.`,
      },
    ]);
    setStepValue("");
  }

  function handleChip(chip: string) {
    if (stage === "onboarding") {
      setStepValue(chip);
      return;
    }
    setQuery(chip);
    void runQuery(chip);
  }

  const hasOnboardingSummary =
    stage === "ready" &&
    accessChoice === "new" &&
    answers.likes.length > 0 &&
    answers.dislikes.length > 0 &&
    answers.occasion.length > 0;

  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center px-4 py-10 text-stone-500">
        Loading assistant...
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-[calc(100vh-8rem)] max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <div className="absolute inset-0 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(17,24,39,0.08),transparent_30%)]" />

      {stage === "gate" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/72 px-4 backdrop-blur-xl">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2.5rem] border border-white/20 bg-[linear-gradient(180deg,rgba(255,248,239,0.96),rgba(244,236,225,0.96))] shadow-[0_40px_120px_rgba(0,0,0,0.25)]">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-8 sm:p-10 lg:p-12">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
                  First run
                </p>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 sm:text-5xl">
                  Tell me what you know, or let me teach you.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-stone-700">
                  The assistant starts with the conversation. If you are new, I&apos;ll ask three
                  structured questions and build a taste profile before we search.
                </p>
              </div>
              <div className="border-t border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,240,231,0.92))] p-6 sm:p-8 lg:border-l lg:border-t-0">
                <div className="rounded-[1.8rem] border border-white/80 bg-white/80 p-5 shadow-[0_14px_36px_rgba(44,36,28,0.08)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
                    Choose a path
                  </div>
                  <div className="mt-4 grid gap-3">
                    <button
                      type="button"
                      onClick={startNewUserFlow}
                      className="rounded-[1.4rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.24),rgba(255,255,255,0.96))] px-5 py-4 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="text-lg font-semibold text-stone-950">I&apos;m new</div>
                      <div className="mt-1 text-sm leading-relaxed text-stone-600">
                        Teach me what I like with a short guided chat.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={startReturningFlow}
                      className="rounded-[1.4rem] border border-stone-300 bg-white px-5 py-4 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="text-lg font-semibold text-stone-950">I know what I like</div>
                      <div className="mt-1 text-sm leading-relaxed text-stone-600">
                        Jump straight into the assistant and start asking for matches.
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-[2.5rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,251,246,0.92),rgba(245,238,229,0.9))] p-5 shadow-[0_24px_90px_rgba(67,38,27,0.08)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700">
                {surface === "home" ? "Chat-first perfume concierge" : "Corpus chat"}
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 sm:text-5xl">
                The Common Nose
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-700">
                Ask for perfumes the way you would ask a stylist: by feeling, occasion, and
                direction. The assistant returns three options at a time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/library"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
              >
                <span className="text-base">⌂</span>
                Library
              </Link>
            </div>
          </div>

          {hasOnboardingSummary ? (
            <div className="mt-5 rounded-[1.6rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">Taste profile:</span> {answers.likes} ·{" "}
              {answers.dislikes} · {answers.occasion}
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-[2.8rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,249,242,0.96),rgba(248,242,234,0.92))] shadow-[0_30px_100px_rgba(42,26,17,0.1)]">
          <div className="border-b border-stone-200/70 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
                  Assistant
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Structured on-ramp, then open chat, then 3 ranked options.
                </p>
              </div>
              <div className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                {userId ? "Signed in memory" : "Session memory"}
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-6 sm:px-6">
            {messages.map((message) => (
              <div key={message.id} className="space-y-3">
                <div
                  className={`max-w-3xl rounded-[1.6rem] px-4 py-4 shadow-[0_14px_40px_rgba(58,40,28,0.06)] ${
                    message.role === "assistant"
                      ? "border border-white/80 bg-white/82 text-stone-800"
                      : "ml-auto border border-stone-300 bg-stone-950 text-white"
                  }`}
                >
                  {message.title ? (
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                      {message.title}
                    </div>
                  ) : null}
                  <p className={`mt-1 text-sm leading-relaxed ${message.role === "assistant" ? "text-stone-700" : "text-stone-100"}`}>
                    {message.text}
                  </p>
                </div>

                {message.results?.length ? (
                  <div className="grid gap-3">
                    {message.results.map((result) => (
                      <ResultCard
                        key={result.doc_id}
                        result={result}
                        query={message.query ?? query}
                        onSave={() => saveToLibrary(result, message.query ?? query)}
                        alreadySaved={savedRecommendations.some((saved) => saved.doc_id === result.doc_id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {stage === "onboarding" ? (
              <div className="rounded-[1.8rem] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,250,243,0.94),rgba(255,242,224,0.88))] p-4 shadow-[0_12px_35px_rgba(167,94,4,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
                      New user onboarding
                    </div>
                    <h2 className="mt-1 text-xl font-semibold text-stone-950">
                      {currentStep.label}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">
                      {currentStep.helper}
                    </p>
                  </div>
                  <div className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                    {stepIndex + 1}/3
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {currentStep.chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setStepValue(chip)}
                      className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-amber-300 hover:bg-amber-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={stepValue}
                    onChange={(e) => setStepValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitOnboardingStep();
                      }
                    }}
                    placeholder="Type an answer or click a chip..."
                    className="min-h-12 flex-1 rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 placeholder:text-stone-400 focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                  <button
                    type="button"
                    onClick={submitOnboardingStep}
                    className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runQuery();
              }}
              className="rounded-[1.8rem] border border-stone-300/80 bg-white/90 p-4 shadow-[0_12px_35px_rgba(58,40,28,0.06)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void runQuery();
                    }
                  }}
                  placeholder="Ask for a perfume, a vibe, or three options for a moment..."
                  rows={2}
                  className="min-h-[3.5rem] flex-1 resize-none rounded-[1.25rem] border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-950 placeholder:text-stone-400 focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
                <button
                  type="submit"
                  disabled={loading || query.trim().length < 2}
                  className="rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(23,23,23,1),rgba(68,64,60,1))] px-5 py-3 text-sm font-semibold text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Thinking..." : "Ask"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {quickPrompts.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChip(chip)}
                    className="rounded-full border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-amber-300 hover:bg-amber-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {recentPrompts.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="self-center text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">
                    Recent
                  </span>
                  {recentPrompts.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleChip(item)}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </form>

            {error ? (
              <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[2rem] border border-white/80 bg-white/70 p-5 shadow-[0_14px_40px_rgba(58,40,28,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
              Suggestions
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-700">
              The first three matches are the only ones that matter for now. Ask for fewer, or
              let me sharpen the result.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(surface === "home" ? FOLLOWUP_PROMPTS : QUICK_PROMPTS).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleChip(item)}
                  className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-amber-300 hover:bg-amber-50"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,241,233,0.92))] p-5 shadow-[0_14px_40px_rgba(58,40,28,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-600">
              Library memory
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[1.2rem] border border-stone-200 bg-white p-4">
                <div className="text-2xl font-black text-stone-950">{savedRecommendations.length}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-400">
                  Saved perfumes
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-stone-200 bg-white p-4">
                <div className="text-2xl font-black text-stone-950">{chatHistory.length}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-400">
                  Query threads
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm leading-relaxed text-stone-700">
              <span className="font-semibold text-stone-950">Memory rule:</span> saved state
              persists when you sign in. Anonymous sessions stay local to the browser session.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
