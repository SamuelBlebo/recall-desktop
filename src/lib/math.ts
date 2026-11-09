import katex from "katex";
import "katex/dist/katex.min.css";

// $$…$$ and \[…\] are display math; \(…\) and $…$ are inline. A lone $ only opens math when
// followed by a non-space and closes before a non-digit, so "costs $5 or $10" stays plain text.
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?=\S)((?:\\\$|[^$])+?)(?<=\S)\$(?!\d)/g;

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Card HTML back to the TeX the user typed: drops our <br>/<span> tags and undoes escaping. */
const toTex = (html: string) =>
  html.replace(/<br>/g, " ").replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENT[e]);

/** Replaces LaTeX in already-escaped card HTML with KaTeX markup. */
export function renderMath(html: string): string {
  if (!/[$\\]/.test(html)) return html;
  return html.replace(MATH, (m, dd, db, ip, id) => {
    const display = dd != null || db != null;
    const tex = toTex(dd ?? db ?? ip ?? id);
    if (!tex.trim()) return m;
    const out = katex.renderToString(tex, { displayMode: display, throwOnError: false });
    return display ? `<div class="math-d">${out}</div>` : out;
  });
}
