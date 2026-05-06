import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type BoardItem = {
  task: string;
  owner: string;
  branch?: string;
  status: string;
  notes: string;
  commit?: string;
};

export type BoardData = {
  title: string;
  subtitle: string;
  updated_at?: string;
  worktrees: Array<{
    agent: string;
    branch: string;
    worktree: string;
    status: string;
  }>;
  active: BoardItem[];
  backlog: BoardItem[];
  done: BoardItem[];
};

const sharedPath = "/Users/anvo/.codex/memories/freshlinen-agent-board.json";
const fallbackPath = join(process.cwd(), "data", "agent-board.json");

export async function loadBoard(): Promise<BoardData> {
  let raw: string;
  try {
    raw = await readFile(sharedPath, "utf8");
  } catch {
    raw = await readFile(fallbackPath, "utf8");
  }
  return JSON.parse(raw) as BoardData;
}

export function slugifyTask(task: string): string {
  return task
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findTask(board: BoardData, slug: string): { section: keyof Pick<BoardData, "active" | "backlog" | "done">; item: BoardItem } | null {
  for (const section of ["active", "backlog", "done"] as const) {
    for (const item of board[section]) {
      if (slugifyTask(item.task) === slug) {
        return { section, item };
      }
    }
  }
  return null;
}

export function findTaskCandidates(board: BoardData, slug: string): Array<{ section: keyof Pick<BoardData, "active" | "backlog" | "done">; item: BoardItem }> {
  const candidates: Array<{ section: keyof Pick<BoardData, "active" | "backlog" | "done">; item: BoardItem }> = [];
  const normalizedSlug = slug.replace(/^-+|-+$/g, "");

  for (const section of ["active", "backlog", "done"] as const) {
    for (const item of board[section]) {
      const itemSlug = slugifyTask(item.task);
      if (
        itemSlug === normalizedSlug ||
        itemSlug.includes(normalizedSlug) ||
        normalizedSlug.includes(itemSlug) ||
        itemSlug.slice(1) === normalizedSlug ||
        itemSlug === normalizedSlug.slice(1)
      ) {
        candidates.push({ section, item });
      }
    }
  }

  return candidates;
}
