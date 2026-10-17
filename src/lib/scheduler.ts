import { fsrs, generatorParameters, Rating, type Card as FCard, type FSRS, type Grade as FGrade } from "ts-fsrs";
import { REVIEW, type Card, type Grade, type Settings } from "./types";

let f: FSRS = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

export function configureScheduler(s: Settings) {
  f = fsrs(
    generatorParameters({
      request_retention: s.retention,
      enable_fuzz: s.fuzz,
      maximum_interval: 36500,
    }),
  );
}

const toF = (c: Card): FCard => ({
  due: new Date(c.due),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsedDays,
  scheduled_days: c.scheduledDays,
  learning_steps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.lastReview ? new Date(c.lastReview) : undefined,
});

const fromF = (c: Card, x: FCard): Card => ({
  ...c,
  due: x.due.getTime(),
  stability: x.stability,
  difficulty: x.difficulty,
  elapsedDays: x.elapsed_days,
  scheduledDays: x.scheduled_days,
  learningSteps: x.learning_steps,
  reps: x.reps,
  lapses: x.lapses,
  state: x.state as Card["state"],
  lastReview: x.last_review ? x.last_review.getTime() : null,
});

/**
 * Applies an answer. Grade 0 = Skip ("I don't know it at all"):
 * scheduled like Again, memory strength reset to the minimum, and the card is
 * flagged so it returns at the END of the current session.
 */
export function answer(c: Card, grade: Grade, now: number): Card {
  const rating = (grade === 0 ? Rating.Again : grade) as FGrade;
  const res = f.next(toF(c), new Date(now), rating);
  const next = fromF(c, res.card);
  next.skipped = grade === 0;
  if (grade === 0) next.stability = Math.min(next.stability, f.parameters.w[0]);
  return next;
}

/** Time until next due for each button, for the labels above Again/Hard/Good/Easy. */
export function previewIntervals(c: Card, now: number): Record<1 | 2 | 3 | 4, number> {
  const p = f.repeat(toF(c), new Date(now));
  const g = (r: Rating) => p[r as FGrade].card.due.getTime() - now;
  return { 1: g(Rating.Again), 2: g(Rating.Hard), 3: g(Rating.Good), 4: g(Rating.Easy) };
}

/** Probability (0–1) you would recall this card right now. Null if never reviewed. */
export function recallChance(c: Card, now: number): number | null {
  if (c.state !== REVIEW || !c.lastReview) return null;
  return f.get_retrievability(toF(c), new Date(now), false);
}

/** Current interval in days for a review card. */
export const intervalDays = (c: Card) => (c.state === REVIEW ? c.scheduledDays : 0);
