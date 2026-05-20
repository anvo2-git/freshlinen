export type FragranticaCandidate = {
  name: string;
  brand: string;
  url: string;
  source?: "fragrantica" | "duckduckgo" | "bing";
};

function decodeDuckDuckGoUrl(href: string): string {
  try {
    const normalized = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(normalized);
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : normalized;
  } catch {
    return href;
  }
}

function extractBrandFromFragranticaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const brandMatch = parsed.pathname.match(/\/perfume\/([^/]+)\//i);
    return brandMatch?.[1]?.replace(/-/g, " ") ?? "";
  } catch {
    return "";
  }
}

function isFragranticaPerfumeUrl(url: string): boolean {
  return /fragrantica\.[a-z.]+\/perfume\/[^/]+\/[^/]+-\d+\.html/i.test(url);
}

function scoreCandidateText(query: string, candidate: FragranticaCandidate): number {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  const haystack = `${candidate.name} ${candidate.brand} ${candidate.url}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (candidate.name.toLowerCase().includes(query.toLowerCase())) score += 3;
  return score;
}

export function extractDuckDuckGoFragranticaCandidates(
  html: string,
  query = ""
): FragranticaCandidate[] {
  const seen = new Set<string>();
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/gi)];
  const candidates: FragranticaCandidate[] = [];
  for (const match of matches) {
    const rawHref = match[1] ?? "";
    const url = decodeDuckDuckGoUrl(rawHref);
    if (!isFragranticaPerfumeUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const titleMatch = html.slice(match.index ?? 0).match(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
    const title = (titleMatch?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    candidates.push({
      name: title || url.split("/").pop()?.replace(/-\d+\.html$/i, "").replace(/-/g, " ") || "",
      brand: extractBrandFromFragranticaUrl(url),
      url,
      source: "duckduckgo",
    });
  }

  if (!query.trim() || candidates.length < 2) {
    return candidates;
  }

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidateText(query, candidate),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map(({ candidate }) => candidate);
}

export function decodeDuckDuckGoFragranticaUrl(href: string): string {
  return decodeDuckDuckGoUrl(href);
}
