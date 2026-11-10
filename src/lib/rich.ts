import katex from "katex";
import "katex/dist/katex.min.css";

// Card text can mix plain text, HTML from imports (<br>, <b>, <sup>, &nbsp;…), light Markdown
// (**bold**, `code`) and LaTeX. rich() turns any mix into safe HTML: tags are rebuilt from an
// allowlist with no attributes (except img src), everything else is escaped.

// $$…$$ and \[…\] are display math; \(…\) and $…$ are inline. A lone $ only opens math when
// followed by a non-space and closes before a non-digit, so "costs $5 or $10" stays plain text.
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?=\S)((?:\\\$|[^$])+?)(?<=\S)\$(?!\d)/g;

// private-use characters mark cloze spans and math slots while the text is being processed
export const CZ_ON = "\uE000", CZ_OFF = "\uE001", CZ_HIDE = "\uE002", CZ_HIDE_END = "\uE003";
const MATH_OPEN = "\uE010", MATH_CLOSE = "\uE011";
const MARKERS = /[\uE000-\uE003]/g;

const BLOCK = ["div", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"];
const INLINE = ["b", "strong", "i", "em", "u", "s", "strike", "sup", "sub", "code", "mark", "small", "big", "span", "font"];
const VOID = ["br", "hr", "img"];
const ALLOWED = new Set([...BLOCK, ...INLINE, ...VOID]);
const RENAME: Record<string, string> = { font: "span", big: "span", strike: "s" };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m,
  );

/** Escapes text but keeps entities that are already there (&nbsp;, &lt; …). */
const escText = (s: string) =>
  s.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const markdown = (s: string) =>
  s.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, "<b>$1</b>").replace(/`([^`\n]+)`/g, "<code>$1</code>");

/** Any tags and entities in a TeX snippet go back to the characters the user meant. */
const toTex = (s: string) => decode(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(MARKERS, "");

function sanitize(src: string): string {
  src = src.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const TAG = /<(\/?)([a-z][a-z0-9]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi;
  const open: string[] = [];
  let out = "", last = 0;
  for (const m of src.matchAll(TAG)) {
    out += markdown(escText(src.slice(last, m.index)));
    last = m.index + m[0].length;
    const raw = m[2].toLowerCase();
    if (!ALLOWED.has(raw)) continue;
    const tag = RENAME[raw] ?? raw;
    if (raw === "img") {
      const s = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const url = s ? decode(s[1] ?? s[2] ?? s[3]) : "";
      if (/^(https?:|data:image\/)/i.test(url)) out += `<img src="${escText(url)}" alt="">`;
    } else if (VOID.includes(tag)) out += `<${tag}>`;
    else if (!m[1]) (open.push(tag), (out += `<${tag}>`));
    else {
      // close only tags we opened, so a stray </div> can't break out of the card
      const i = open.lastIndexOf(tag);
      if (i < 0) continue;
      while (open.length > i) out += `</${open.pop()}>`;
    }
  }
  out += markdown(escText(src.slice(last)));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

const BLOCK_EDGE = new RegExp(`<br>(?=\\s*</?(?:${BLOCK.join("|")}|hr)>)|(?<=</?(?:${BLOCK.join("|")}|hr)>\\s*)<br>`, "g");

/** Safe HTML for a card field. Expects cloze already turned into CZ_* markers. */
export function rich(text: string): string {
  const tex: { body: string; display: boolean }[] = [];
  let s = String(text ?? "").replace(/\r\n?/g, "\n");
  s = s.replace(MATH, (m, dd, db, ip, id) => {
    const body = toTex(dd ?? db ?? ip ?? id);
    if (!body.trim()) return m;
    tex.push({ body, display: dd != null || db != null });
    return MATH_OPEN + (tex.length - 1) + MATH_CLOSE;
  });
  s = sanitize(s).replace(/\n/g, "<br>").replace(BLOCK_EDGE, "");
  s = s.replace(new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, "g"), (_m, i) => {
    const { body, display } = tex[Number(i)];
    const out = katex.renderToString(body, { displayMode: display, throwOnError: false });
    return display ? `<div class="math-d">${out}</div>` : out;
  });
  return s
    .replace(new RegExp(CZ_ON, "g"), '<span class="cz on">').replace(new RegExp(CZ_OFF, "g"), "</span>")
    .replace(new RegExp(CZ_HIDE, "g"), '<span class="cz">[').replace(new RegExp(CZ_HIDE_END, "g"), "]</span>");
}

/** One-line plain text for lists, search and type-in comparison. */
export const plain = (text: string) =>
  decode(
    String(text ?? "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>|<\/(div|p|li|tr)>/gi, " ")
      .replace(/<\/?[a-z][^<>]*>/gi, "")
      .replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1"),
  )
    .replace(MARKERS, "").replace(/\s+/g, " ").trim();
