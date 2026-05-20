export interface Perfume {
  id: number;
  n: string;   // name
  b: string;   // brand
  g: string;   // gender
  r: number;   // rating
  rc: number;  // rating count
  aw: Record<string, number>; // accord weights (0-100)
}

export interface Seed {
  perfumeId: number;
}

export interface Vote {
  perfumeId: number;
  vote: "up" | "down";
}

export interface PersonalNote {
  notes: string;
  rating: number | null;
}

export interface AppState {
  seeds: Seed[];
  votes: Vote[];
  quizAccords: string[] | null;
  scrapedPerfumes: Perfume[];
  personalNotes: Record<number, PersonalNote>;
}

export type AppAction =
  | { type: "ADD_SEED"; perfumeId: number }
  | { type: "REMOVE_SEED"; perfumeId: number }
  | { type: "SET_VOTE"; perfumeId: number; vote: "up" | "down" }
  | { type: "REMOVE_VOTE"; perfumeId: number }
  | { type: "SET_QUIZ_ACCORDS"; accords: string[] }
  | { type: "ADD_SCRAPED_PERFUME"; perfume: Perfume }
  | { type: "SET_PERSONAL_NOTE"; perfumeId: number; note: PersonalNote };
