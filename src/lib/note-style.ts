export type NoteTone = {
  bg: string;
  fg: string;
  border: string;
  family: string;
};

const NOTE_TONES: Array<{ test: RegExp; tone: NoteTone }> = [
  { test: /\b(citrus|lemon|lime|bergamot|orange|grapefruit|mandarin|neroli|yuzu)\b/i, tone: { bg: "#fef9c3", fg: "#854d0e", border: "#f59e0b", family: "Citrus" } },
  { test: /\b(rose|jasmine|iris|violet|tuberose|lily|peony|floral|orange blossom|muguet)\b/i, tone: { bg: "#fce7f3", fg: "#9d174d", border: "#ec4899", family: "Floral" } },
  { test: /\b(wood|cedar|sandalwood|vetiver|oud|patchouli|moss|earth|leaf|green|cypress|pine)\b/i, tone: { bg: "#ecfccb", fg: "#3f6212", border: "#84cc16", family: "Woody / Green" } },
  { test: /\b(vanilla|amber|tonka|benzoin|caramel|gourmand|honey|coconut|coffee|sweet|praline)\b/i, tone: { bg: "#fde8c8", fg: "#92400e", border: "#f59e0b", family: "Sweet / Gourmand" } },
  { test: /\b(spice|spicy|cinnamon|pepper|cardamom|nutmeg|clove|ginger|saffron)\b/i, tone: { bg: "#fee2e2", fg: "#991b1b", border: "#ef4444", family: "Spicy" } },
  { test: /\b(leather|suede|animalic|castoreum|civet)\b/i, tone: { bg: "#f5f5f4", fg: "#57534e", border: "#a8a29e", family: "Leather / Animalic" } },
  { test: /\b(smoke|smoky|incense|tobacco|resin|styrax|labdanum|benzoin|myrrh|frankincense)\b/i, tone: { bg: "#e7e5e4", fg: "#44403c", border: "#78716c", family: "Smoky / Resinous" } },
  { test: /\b(musk|musky|powder|powdery|aldehydic|skin|cashmeran|heliotrope)\b/i, tone: { bg: "#f3f4f6", fg: "#4b5563", border: "#9ca3af", family: "Musky / Powdery" } },
  { test: /\b(aquatic|marine|ozonic|salty|mineral|watery|briny|oceanic|coastal|seawater|surf|tide)\b/i, tone: { bg: "#dbeafe", fg: "#1d4ed8", border: "#60a5fa", family: "Aquatic / Airy" } },
  { test: /\b(aromatic|herbal|lavender|sage|rosemary|mint|thyme|basil|artemisia|tea|fougere)\b/i, tone: { bg: "#dcfce7", fg: "#166534", border: "#22c55e", family: "Aromatic / Herbal" } },
  { test: /\b(fruity|fruit|peach|apple|pear|berry|plum|lychee|mango|pineapple|blackcurrant)\b/i, tone: { bg: "#ffedd5", fg: "#c2410c", border: "#fb923c", family: "Fruity" } },
  { test: /\b(earthy|mossy|patchouli|vetiver|dirt|soil|oakmoss|lichen|fern)\b/i, tone: { bg: "#f0fdf4", fg: "#166534", border: "#86efac", family: "Earthy" } },
];

const DEFAULT_TONE: NoteTone = {
  bg: "#f8fafc",
  fg: "#475569",
  border: "#cbd5e1",
  family: "Other",
};

export function getNoteTone(note: string): NoteTone {
  return NOTE_TONES.find((entry) => entry.test.test(note))?.tone ?? DEFAULT_TONE;
}

export function getNoteFamily(note: string): string {
  return getNoteTone(note).family;
}
