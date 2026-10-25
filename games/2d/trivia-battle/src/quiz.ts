import bank from '../data/questions.json';

export interface QuestionText {
  q: string;
  a: string[];
}

export interface Question {
  id: string;
  category: string;
  correct: number;
  tr: QuestionText;
  en: QuestionText;
}

// Shared with `apps/realtime/src/matches/trivia.rs`; keep the numbers in step.
export const ROUNDS = 10;
export const QUESTION_MS = 15_000;
export const REVEAL_MS = 3_500;
export const LEAD_IN_MS = 3_000;
const BASE_POINTS = 100;
const SPEED_POINTS = 100;
const STREAK_BONUS = 20;
const STREAK_CAP = 5;

const questions = bank.questions as Question[];
const byId = new Map(questions.map((question) => [question.id, question]));

export function findQuestion(id: string): Question | undefined {
  return byId.get(id);
}

export function pickQuestions(category: string, random: () => number = Math.random): Question[] {
  const pool = questions.filter(
    (question) => category === 'mixed' || question.category === category,
  );
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = pool[i];
    const swap = pool[j];
    if (current && swap) {
      pool[i] = swap;
      pool[j] = current;
    }
  }
  return pool.slice(0, ROUNDS);
}

// Points for one answer; `streak` is the run of correct answers including this one.
export function pointsFor(correct: boolean, takenMs: number, streak: number): number {
  if (!correct) return 0;
  const left = Math.max(0, QUESTION_MS - takenMs) / QUESTION_MS;
  return (
    BASE_POINTS + Math.round(SPEED_POINTS * left) + STREAK_BONUS * Math.min(streak - 1, STREAK_CAP)
  );
}
