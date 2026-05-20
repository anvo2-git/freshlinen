"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { AppState, AppAction } from "./types";

const initialState: AppState = {
  seeds: [],
  votes: [],
  quizAccords: null,
  scrapedPerfumes: [],
  personalNotes: {},
};

function syncSeedArrays(state: AppState, seeds: AppState["seeds"]): AppState {
  return { ...state, seeds };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SEED":
      if (state.seeds.length >= 3) return state;
      if (state.seeds.some((p) => p.perfumeId === action.perfumeId)) return state;
      return syncSeedArrays(state, [...state.seeds, { perfumeId: action.perfumeId }]);

    case "REMOVE_SEED":
      return syncSeedArrays(
        state,
        state.seeds.filter((p) => p.perfumeId !== action.perfumeId)
      );

    case "SET_VOTE": {
      const existing = state.votes.findIndex((v) => v.perfumeId === action.perfumeId);
      const newVotes = [...state.votes];
      if (existing >= 0) {
        newVotes[existing] = { perfumeId: action.perfumeId, vote: action.vote };
      } else {
        newVotes.push({ perfumeId: action.perfumeId, vote: action.vote });
      }
      return { ...state, votes: newVotes };
    }

    case "REMOVE_VOTE":
      return { ...state, votes: state.votes.filter((v) => v.perfumeId !== action.perfumeId) };

    case "SET_QUIZ_ACCORDS":
      return { ...state, quizAccords: action.accords };

    case "ADD_SCRAPED_PERFUME":
      return { ...state, scrapedPerfumes: [...state.scrapedPerfumes, action.perfume] };

    case "SET_PERSONAL_NOTE":
      return {
        ...state,
        personalNotes: { ...state.personalNotes, [action.perfumeId]: action.note },
      };

    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
