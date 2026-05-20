"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccordPill } from "@/components/AccordPill";
import { PerfumeCard } from "@/components/PerfumeCard";
import { useApp } from "@/lib/context";
import { loadCatalog, loadLookup } from "@/lib/data";
import {
  buildBeginnerQuizProfile,
  QUIZ_QUESTIONS,
  rankBeginnerQuizResults,
  summarizeBeginnerQuizProfile,
  type BeginnerQuizProfile,
  type QuizStepKey,
} from "@/lib/quiz";
import type { Perfume } from "@/lib/types";

type AnswerMap = Record<QuizStepKey, string[]>;

function createEmptyAnswers(): AnswerMap {
  return {
    want: [],
    avoid: [],
    tone: [],
    priority: [],
  };
}

function getQuestionOptions(stepKey: QuizStepKey) {
  return QUIZ_QUESTIONS.find((question) => question.key === stepKey)?.options ?? [];
}

function getFamiliesForValues(stepKey: QuizStepKey, values: string[]) {
  const options = getQuestionOptions(stepKey);
  const families = new Set<string>();
  for (const value of values) {
    const option = options.find((item) => item.value === value);
    if (!option) continue;
    for (const family of option.families) {
      families.add(family);
    }
  }
  return families;
}

function getFilteredAvoidOptions(wantValues: string[]) {
  const wantFamilies = getFamiliesForValues("want", wantValues);
  return getQuestionOptions("avoid").filter((option) => {
    if (option.value === "skip") return true;
    if (wantFamilies.size === 0) return true;
    return !option.families.some((family) => wantFamilies.has(family));
  });
}

function sanitizeAnswers(answers: AnswerMap): AnswerMap {
  const allowedAvoidValues = new Set(getFilteredAvoidOptions(answers.want).map((option) => option.value));
  return {
    ...answers,
    avoid: (answers.avoid ?? []).filter((value) => allowedAvoidValues.has(value)),
  };
}

export default function QuizPage() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(createEmptyAnswers);
  const [showResults, setShowResults] = useState(false);
  const [profile, setProfile] = useState<BeginnerQuizProfile | null>(null);
  const [summaryLines, setSummaryLines] = useState<string[]>([]);
  const [resultPerfumes, setResultPerfumes] = useState<Perfume[]>([]);
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [lookup, setLookup] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadCatalog(), loadLookup()]).then(([c, l]) => {
      setCatalog(c);
      setLookup(l);
      setLoading(false);
    });
  }, []);

  const currentQuestion = QUIZ_QUESTIONS[currentQ];
  const visibleOptions = useMemo(
    () =>
      currentQuestion?.key === "avoid"
        ? getFilteredAvoidOptions(answers.want)
        : currentQuestion?.options ?? [],
    [answers.want, currentQuestion?.key, currentQuestion?.options]
  );
  const visibleOptionValues = useMemo(() => new Set(visibleOptions.map((option) => option.value)), [visibleOptions]);
  const currentSelections = useMemo(() => {
    const stepKey = currentQuestion?.key ?? "want";
    const selections = answers[stepKey] ?? [];
    if (stepKey === "avoid") {
      return selections.filter((value) => visibleOptionValues.has(value));
    }
    return selections;
  }, [answers, currentQuestion?.key, visibleOptionValues]);

  const topWantAccords = useMemo(() => profile?.wantAccords.slice(0, 6) ?? [], [profile]);

  function toggleMultiOption(stepKey: QuizStepKey, optionValue: string, maxSelections?: number) {
    setAnswers((prev) => {
      const current = prev[stepKey] ?? [];
      const exists = current.includes(optionValue);
      const next = exists ? current.filter((value) => value !== optionValue) : [...current, optionValue];
      if (!exists && typeof maxSelections === "number" && next.length > maxSelections) {
        return prev;
      }
      return { ...prev, [stepKey]: next };
    });
  }

  function finishQuiz(nextAnswers: AnswerMap) {
    const sanitized = sanitizeAnswers(nextAnswers);
    const nextProfile = buildBeginnerQuizProfile(sanitized);
    const accords = nextProfile.wantAccords.length > 0 ? nextProfile.wantAccords : nextProfile.toneAccords;
    setProfile(nextProfile);
    setSummaryLines(summarizeBeginnerQuizProfile(nextProfile));
    dispatch({ type: "SET_QUIZ_ACCORDS", accords: accords.slice(0, 5) });

    const ranked = rankBeginnerQuizResults(nextProfile, catalog, lookup, 6);
    setResultPerfumes(ranked.map((result) => result.perfume));
    setShowResults(true);
  }

  function advanceAfterSingle(stepKey: QuizStepKey, value: string) {
    const nextValues = value === "skip" ? [] : [value];
    const nextAnswers = sanitizeAnswers({ ...answers, [stepKey]: nextValues });
    setAnswers(nextAnswers);

    if (currentQ + 1 < QUIZ_QUESTIONS.length) {
      setCurrentQ(currentQ + 1);
    } else {
      finishQuiz(nextAnswers);
    }
  }

  function advanceMulti(clearCurrent = false) {
    const nextAnswers = sanitizeAnswers(
      clearCurrent ? { ...answers, [currentQuestion.key]: [] } : { ...answers }
    );
    setAnswers(nextAnswers);
    if (currentQ + 1 < QUIZ_QUESTIONS.length) {
      setCurrentQ(currentQ + 1);
    } else {
      finishQuiz(nextAnswers);
    }
  }

  function goBack() {
    if (currentQ === 0) return;
    setCurrentQ((prev) => prev - 1);
  }

  function restart() {
    setCurrentQ(0);
    setAnswers(createEmptyAnswers());
    setShowResults(false);
    setProfile(null);
    setSummaryLines([]);
    setResultPerfumes([]);
  }

  function addToSeeds(perfumeId: number) {
    dispatch({ type: "ADD_SEED", perfumeId });
  }

  function goToRecs() {
    router.push("/recommendations");
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-violet-500">
        Loading catalog...
      </div>
    );
  }

  if (showResults && profile) {
    const selectedAvoid = profile.avoidLabels;
    const toneLabel = profile.toneLabel;
    const priorityLabel = profile.priorityLabel;

    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="font-sans font-bold text-3xl font-medium text-violet-900 mb-2">
          Your Starting Point
        </h1>
        <p className="text-violet-500 mb-6">
          I used what you want, what you explicitly do not want, and your wear-style preferences to
          rank beginner-friendly perfumes.
        </p>

        <div className="space-y-3 mb-6">
          {(summaryLines.length > 0
            ? summaryLines
            : ["You can still get useful results even if you skipped a few steps."]
          ).map((line) => (
            <div key={line} className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-violet-700">
              {line}
            </div>
          ))}
        </div>

        {topWantAccords.length > 0 && (
          <div className="mb-8">
            <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-3">
              Main scent signals
            </h2>
            <div className="flex flex-wrap gap-2">
              {topWantAccords.map((accord) => (
                <AccordPill key={accord} accord={accord} large />
              ))}
            </div>
          </div>
        )}

        {(selectedAvoid.length > 0 || toneLabel || priorityLabel) && (
          <div className="mb-8 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex flex-wrap gap-2">
              {selectedAvoid.length > 0 && (
                <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-violet-700">
                  Avoiding: {selectedAvoid.join(", ")}
                </span>
              )}
              {toneLabel && (
                <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-violet-700">
                  Noticeability: {toneLabel}
                </span>
              )}
              {priorityLabel && (
                <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-violet-700">
                  Priority: {priorityLabel}
                </span>
              )}
            </div>
          </div>
        )}

        <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-4">
          Perfumes that fit your answer
        </h2>
        <div className="grid gap-3 mb-8">
          {resultPerfumes.map((p) => (
            <PerfumeCard
              key={p.id}
              perfume={p}
              action={
                <button
                  onClick={() => addToSeeds(p.id)}
                  className="text-xs px-3 py-1.5 rounded-md bg-violet-900 text-white hover:bg-violet-700 transition-colors"
                >
                  + Seed
                </button>
              }
            />
          ))}
        </div>

        <div className="rounded-2xl border border-violet-200 bg-white p-4 mb-8">
          <p className="text-sm text-violet-600 leading-relaxed">
            I ranked these by matching your wanted scent families first, then penalized your no-go
            list, then adjusted for how subtle or bold you want the perfume to feel.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={goToRecs}
            className="px-5 py-2.5 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Get Recommendations
          </button>
          <button
            onClick={restart}
            className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
          >
            Retake Quiz
          </button>
          <a
            href="/build"
            className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
          >
            Fine-tune in Scent Builder
          </a>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-violet-400 font-medium">
            {currentQ + 1} / {QUIZ_QUESTIONS.length}
          </span>
          <div className="flex-1 h-1 bg-violet-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-900 rounded-full transition-all duration-300"
              style={{ width: `${((currentQ + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-white p-5 mb-5">
          <p className="text-sm text-violet-500 mb-2">
            I’ll keep this beginner-friendly. You can skip anything you’re unsure about.
          </p>
          <h1 className="font-sans font-bold text-2xl md:text-3xl font-medium text-violet-900">
            {currentQuestion.title}
          </h1>
          <p className="text-sm text-violet-500 mt-2">{currentQuestion.prompt}</p>
        </div>
      </div>

      <div className="grid gap-3">
        {currentQuestion.key === "avoid" && visibleOptions.length === 0 && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-700">
            You already covered most of the major groups in the first step, so I&apos;m skipping
            overlapping avoid choices here. You can tap Skip this step if you want to move on.
          </div>
        )}
        {visibleOptions.map((option) => {
          const selected = currentSelections.includes(option.value);
          const disabled =
            currentQuestion.kind === "multi" &&
            !selected &&
            typeof currentQuestion.maxSelections === "number" &&
            currentSelections.length >= currentQuestion.maxSelections;

          return (
            <button
              key={option.value}
              onClick={() => {
                if (currentQuestion.kind === "multi") {
                  toggleMultiOption(currentQuestion.key, option.value, currentQuestion.maxSelections);
                } else {
                  advanceAfterSingle(currentQuestion.key, option.value);
                }
              }}
              disabled={disabled}
              className={`text-left border rounded-lg p-5 transition-all ${
                selected
                  ? "border-violet-700 bg-violet-50 shadow-sm"
                  : "bg-white border-violet-200 hover:border-violet-400 hover:shadow-sm"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="font-medium text-violet-900">{option.label}</div>
              <div className="text-sm text-violet-500 mt-0.5">{option.description}</div>
            </button>
          );
        })}
      </div>

      {currentQuestion.kind === "multi" && (
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            onClick={() => advanceMulti(false)}
            className="px-5 py-2.5 rounded-lg bg-violet-900 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Continue
          </button>
          <button
            onClick={() => advanceMulti(true)}
            className="px-5 py-2.5 rounded-lg border border-violet-300 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
          >
            Skip this step
          </button>
          {currentQ > 0 && (
            <button
              onClick={goBack}
              className="px-5 py-2.5 rounded-lg border border-violet-200 text-violet-500 text-sm hover:bg-violet-50 transition-colors"
            >
              Back
            </button>
          )}
        </div>
      )}

      {currentQuestion.kind === "single" && currentQ > 0 && (
        <div className="mt-6">
          <button
            onClick={goBack}
            className="px-5 py-2.5 rounded-lg border border-violet-200 text-violet-500 text-sm hover:bg-violet-50 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
