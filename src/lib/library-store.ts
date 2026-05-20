export type OnboardingChoice = "new" | "returning";

export interface SavedRecommendation {
  doc_id: string;
  query: string;
  brand: string;
  name: string;
  official_url: string;
  url: string;
  source_type: string;
  rating_value: string;
  rating_count: string;
  accords: string[];
  notes: string[];
  release_signal: string;
  snippet: string;
  score: number;
  created_at: string;
}

export interface ChatHistoryEntry {
  query: string;
  summary: string;
  created_at: string;
  results: SavedRecommendation[];
}

const ONBOARDING_KEY = "freshlinen:onboarding-choice";
const CHAT_HISTORY_KEY = "freshlinen:chat-history";
const SAVED_RECOMMENDATIONS_KEY = "freshlinen:saved-recommendations";

function readJson<T>(storage: Storage | null, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(storage: Storage | null, key: string, value: T) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / storage errors.
  }
}

export function readOnboardingChoice(storage: Storage | null): OnboardingChoice | null {
  const value = readJson<string | null>(storage, ONBOARDING_KEY, null);
  return value === "new" || value === "returning" ? value : null;
}

export function writeOnboardingChoice(storage: Storage | null, choice: OnboardingChoice) {
  writeJson(storage, ONBOARDING_KEY, choice);
}

export function loadChatHistory(storage: Storage | null): ChatHistoryEntry[] {
  return readJson<ChatHistoryEntry[]>(storage, CHAT_HISTORY_KEY, []);
}

export function saveChatHistory(storage: Storage | null, entry: ChatHistoryEntry) {
  const existing = loadChatHistory(storage);
  const next = [entry, ...existing].slice(0, 12);
  writeJson(storage, CHAT_HISTORY_KEY, next);
}

export function loadSavedRecommendations(storage: Storage | null): SavedRecommendation[] {
  return readJson<SavedRecommendation[]>(storage, SAVED_RECOMMENDATIONS_KEY, []);
}

export function saveRecommendation(storage: Storage | null, recommendation: SavedRecommendation) {
  const existing = loadSavedRecommendations(storage);
  const next = [recommendation, ...existing.filter((item) => item.doc_id !== recommendation.doc_id)].slice(0, 24);
  writeJson(storage, SAVED_RECOMMENDATIONS_KEY, next);
}
