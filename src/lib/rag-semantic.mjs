import { BEGINNER_PROMPTS as TAXONOMY_BEGINNER_PROMPTS, SEMANTIC_CONCEPTS } from "./rag-taxonomy.mjs";

export const BEGINNER_PROMPTS = TAXONOMY_BEGINNER_PROMPTS;

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function includesPhrase(haystack, needle) {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle.length > 0 && normalizedHaystack.includes(normalizedNeedle);
}

function uniqueByLabel(prompts) {
  const seen = new Set();
  return prompts.filter((prompt) => {
    const key = prompt.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGuidanceQuery(normalizedQuery, tokenCount) {
  return (
    tokenCount <= 3 ||
    /(?:help|guide|choose|buy|recommend|not sure|new to perfume|what should i buy|what do i like|i don't know|i do not know|i'm new|i am new|what should|something nice|something easy|what is a good perfume)/.test(
      normalizedQuery
    )
  );
}

export function buildSemanticQuerySignal(query) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  const matchedConcepts = SEMANTIC_CONCEPTS.filter((concept) =>
    concept.aliases.some((alias) => includesPhrase(normalizedQuery, alias))
  );
  const boostTerms = Array.from(
    new Set(matchedConcepts.flatMap((concept) => concept.docTerms).map((term) => normalize(term)).filter(Boolean))
  );

  const matchedLabels = matchedConcepts.map((concept) => concept.label);
  const beginnerHint =
    matchedLabels.length > 0
      ? `I read this as ${matchedLabels.slice(0, 3).join(", ")}. If that feels right, you can narrow it by budget, season, or how sweet, smoky, metallic, or aldehydic you want it.`
      : "If you’re new to perfume, pick a feeling first: fresh/clean, aromatic/herbal, aquatic/salty, sweet/vanilla, creamy/lactonic, smoky/incense, woody/cedar, floral/iris, metallic/polished, aldehydic/crisp, animalic/sensual, or musky/skin-like.";

  const suggestedPrompts = uniqueByLabel(
    matchedConcepts.length > 0
      ? [
          ...matchedConcepts.map((concept) => ({
            label: concept.label,
            description: concept.plainLanguage,
            query: concept.starterQuery,
            family: concept.family,
          })),
          ...BEGINNER_PROMPTS.filter(
            (prompt) => !matchedConcepts.some((concept) => concept.family === prompt.family || concept.label === prompt.label)
          ).slice(0, 4),
        ]
      : BEGINNER_PROMPTS
  );

  return {
    matchedConcepts,
    boostTerms,
    beginnerHint: isGuidanceQuery(normalizedQuery, queryTokens.length)
      ? beginnerHint
      : matchedConcepts.length > 0
        ? beginnerHint
        : "",
    suggestedPrompts,
    needsGuidance: isGuidanceQuery(normalizedQuery, queryTokens.length),
  };
}
