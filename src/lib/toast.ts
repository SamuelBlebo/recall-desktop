type Toast = { id: number; text: string };
let toasts: Toast[] = [];
const subs = new Set<() => void>();
let seq = 0;

export function toast(text: string, ms = 3200) {
  const t = { id: ++seq, text };
  toasts = [...toasts, t];
  subs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    subs.forEach((f) => f());
  }, ms);
}
export const getToasts = () => toasts;
export function subscribeToasts(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
