export type FragranticaCandidate = {
  name: string;
  brand: string;
  url: string;
};

type FragranticaSearchResponse = {
  results?: FragranticaCandidate[];
  error?: string;
};

type FragranticaScrapeResponse = {
  name?: string;
  brand?: string;
  error?: string;
};

export async function searchFragranticaCandidates(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<FragranticaCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const res = await fetchImpl(`/api/scrape/search?q=${encodeURIComponent(trimmed)}`);
  const data = (await res.json()) as FragranticaSearchResponse;
  if (!res.ok) {
    throw new Error(data.error || "Fragrantica search failed.");
  }

  return data.results ?? [];
}

export async function scrapeFragranticaCandidate(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ name: string; brand: string }> {
  const res = await fetchImpl(`/api/scrape?url=${encodeURIComponent(url)}`);
  const data = (await res.json()) as FragranticaScrapeResponse;
  if (!res.ok) {
    throw new Error(data.error || "Scraping failed.");
  }

  return {
    name: data.name ?? "",
    brand: data.brand ?? "",
  };
}
