import { addNotes, ensureDeckPath, type NewNote } from "./store";
import type { NoteKind } from "./types";

const RAW: [string, NoteKind, string, string, string][] = [
  ["UG Courses::MATH 122", "basic", "d/dx (xⁿ) = ?", "n·xⁿ⁻¹  (power rule)", "derivatives"],
  ["UG Courses::MATH 122", "basic", "∫ (1/x) dx = ?", "ln|x| + C", "integration"],
  ["UG Courses::MATH 122", "basic", "Product rule for (uv)′", "u′v + uv′", "derivatives"],
  ["UG Courses::MATH 122", "basic", "Quotient rule for (u/v)′", "(u′v − uv′) / v²", "derivatives trap"],
  ["UG Courses::MATH 122", "cloze", "The derivative of sin x is {{c1::cos x}} and the derivative of cos x is {{c2::−sin x::sign!}}.", "Watch the minus sign on cos x.", "derivatives trap"],
  ["UG Courses::MATH 122", "basic", "Chain rule: d/dx f(g(x))", "f′(g(x)) · g′(x)", "derivatives"],
  ["UG Courses::STAT 112", "basic", "Mean of a data set", "Sum of all values ÷ number of values", "descriptive"],
  ["UG Courses::STAT 112", "cloze", "Variance is the {{c1::square}} of the {{c2::standard deviation}}.", "", "descriptive"],
  ["UG Courses::STAT 112", "basic", "P(A ∪ B) = ?", "P(A) + P(B) − P(A ∩ B)", "probability"],
  ["UG Courses::STAT 112", "rev", "Mutually exclusive events", "Events that cannot happen at the same time: P(A ∩ B) = 0", "probability"],
  ["UG Courses::ECON 102", "basic", "Law of demand", "As price rises, quantity demanded falls (ceteris paribus)", "micro"],
  ["UG Courses::ECON 102", "basic", "GDP by the expenditure approach", "C + I + G + (X − M)", "macro"],
  ["UG Courses::ECON 102", "cloze", "Inflation is a sustained rise in the {{c1::general price level}} over time.", "", "macro"],
  ["UG Courses::ACTU 203", "basic", "Accumulated value with compound interest", "A = P(1 + i)ⁿ", "interest"],
  ["UG Courses::ACTU 203", "cloze", "The discount factor v = {{c1::1/(1+i)}}, so the PV of 1 due in n years is {{c2::vⁿ}}.", "", "interest trap"],
  ["Programming::JavaScript", "type", "Array method that adds an item to the END of an array", "push", "arrays"],
  ["Programming::JavaScript", "basic", "What does === check?", "Value AND type (strict equality)", "basics trap"],
];

export function loadSampleDecks(): number {
  const items: NewNote[] = RAW.map(([deck, kind, front, back, tags]) => ({
    deckId: ensureDeckPath(deck), kind, front, back, tags: tags.split(" "),
  }));
  return addNotes(items);
}
