import taxonomy from "../../data/rag/scent-taxonomy.json";

export const SEMANTIC_CONCEPTS = Array.isArray(taxonomy.concepts) ? taxonomy.concepts : [];
export const CONCEPT_SPECIFICITY =
  taxonomy.specificity && typeof taxonomy.specificity === "object" ? taxonomy.specificity : {};
export const BEGINNER_PROMPTS = Array.isArray(taxonomy.beginner_prompts) ? taxonomy.beginner_prompts : [];
