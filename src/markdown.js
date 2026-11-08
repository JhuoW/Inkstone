import MarkdownIt from "markdown-it";
import { configureMarkdownParser } from "./markdown-options.js";
import {
  prepareDiagramSource,
  restoreDiagramLabels,
} from "./diagram-compatibility.js";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import mark from "markdown-it-mark";
import { full as emoji } from "markdown-it-emoji";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/contrib/mhchem";
import hljs from "highlight.js";
import { renderMathJax } from "./mathjax.js";
import { readDocumentConfig } from "./document-config.js";
import { normalizeSource, wordStatistics } from "./source.js";

export { wordStatistics as countWords };
export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
let activeAssetOptions;
DOMPurify.addHook("uponSanitizeAttribute", (node, attribute) => {
  if (!activeAssetOptions) return;
  const tag = node.tagName?.toLowerCase();
  if (
    (attribute.attrName === "src" &&
      ["img", "video", "audio", "source", "track"].includes(tag)) ||
    (attribute.attrName === "poster" && tag === "video")
  ) {
    attribute.attrValue = resolveAsset(
      attribute.attrValue,
      activeAssetOptions.basePath,
      activeAssetOptions.imageRoot,
    );
  }
});
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "IFRAME") {
    node.setAttribute("sandbox", "allow-scripts allow-presentation");
    node.setAttribute("loading", "lazy");
  }
});
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

function mathPlugin(md) {
  md.inline.ruler.before("escape", "math_parentheses", (state, silent) => {
    if (!state.src.startsWith("\\(", state.pos)) return false;
    const end = state.src.indexOf("\\)", state.pos + 2);
    if (end < 0) return false;
    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = state.src.slice(state.pos + 2, end);
      token.meta = { from: state.pos, to: end + 2, delimiter: 2 };
    }
    state.pos = end + 2;
    return true;
  });
  md.inline.ruler.after("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    if (
      state.src[start] !== "$" ||
      state.src[start + 1] === "$" ||
      /\s/.test(state.src[start + 1] || " ")
    )
      return false;
    let end = start + 1;
    while ((end = state.src.indexOf("$", end)) >= 0) {
      if (state.src[end - 1] === "\\") {
        end++;
        continue;
      }
      if (/\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] || ""))
        return false;
      if (state.src.slice(start + 1, end).includes("\n")) return false;
      if (!silent) {
        const token = state.push("math_inline", "math", 0);
        token.content = state.src.slice(start + 1, end);
        token.meta = { from: start, to: end + 1, delimiter: 1 };
      }
      state.pos = end + 1;
      return true;
    }
    return false;
  });
  md.block.ruler.before(
    "fence",
    "math_block",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const line = state.src.slice(start, state.eMarks[startLine]);
      const closing = line.startsWith("$$")
        ? "$$"
        : line.startsWith("\\[")
          ? "\\]"
          : null;
      if (!closing) return false;
      if (silent) return true;
      let content = "";
      let next = startLine + 1;
      if (line.length > 3 && line.trimEnd().endsWith(closing))
        content = line.trimEnd().slice(2, -2);
      else {
        content = line.slice(2);
        while (next < endLine) {
          const value = state.src.slice(
            state.bMarks[next] + state.tShift[next],
            state.eMarks[next],
          );
          if (value.trimEnd().endsWith(closing)) {
            content += "\n" + value.trimEnd().slice(0, -2);
            next++;
            break;
          }
          content += "\n" + value;
          next++;
        }
      }
      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, next];
      state.line = next;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  const renderMath = (tokens, idx, options, env) => {
    const token = tokens[idx];
    const displayMode = token.type === "math_block";
    const label = token.content.match(/\\label\{([^}]+)\}/)?.[1];
    let code = token.content.replace(/\\label\{[^}]+\}/g, "");
    code = code.replace(
      /\\(eqref|ref)\{([^}]+)\}/g,
      (_, kind, key) =>
        `\\text{${kind === "eqref" ? "(" : ""}${env.equationLabels?.[key] ?? "?"}${kind === "eqref" ? ")" : ""}}`,
    );
    let rendered;
    try {
      rendered = katex.renderToString(code, {
        displayMode,
        throwOnError: true,
        strict: "ignore",
        trust: false,
        output: "htmlAndMathml",
        macros: env.options?.mathMacros || {},
      });
    } catch (katexError) {
      try {
        rendered = `<span class="mathjax-fallback" data-engine="mathjax3" aria-label="${escapeHTML(token.content)}">${renderMathJax(code, { displayMode, macros: env.options?.mathMacros || {} })}</span>`;
      } catch (error) {
        const errorHTML = `<${displayMode ? "div" : "span"} class="math-error" title="${escapeHTML(katexError.message)}">${escapeHTML(token.content)}<small>${escapeHTML(error.message || katexError.message)}</small></${displayMode ? "div" : "span"}>`;
        return displayMode
          ? errorHTML
          : `<span class="math-inline">${errorHTML}</span>`;
      }
    }
    if (!displayMode) return `<span class="math-inline">${rendered}</span>`;
    const count = ++env.equationCounter;
    const explicitTag = /\\tag\*?\{[^}]+\}/.test(token.content);
    const number = explicitTag
      ? null
      : (env.equationLabels?.[label] ??
        (env.options?.mathNumbering ? count : null));
    return `<div class="math-display"${label ? ` id="equation-${escapeHTML(slug(label))}"` : ""}>${rendered}${number ? `<span class="equation-number">(${escapeHTML(number)})</span>` : ""}</div>`;
  };
  md.renderer.rules.math_inline = renderMath;
  md.renderer.rules.math_block = renderMath;
}

function extensions(md) {
  md.block.ruler.before(
    "paragraph",
    "table_of_contents",
    (state, startLine, _endLine, silent) => {
      const line = state.src.slice(
        state.bMarks[startLine] + state.tShift[startLine],
        state.eMarks[startLine],
      );
      if (!/^(?:\[toc\]|\[\[_TOC_\]\])$/i.test(line.trim())) return false;
      if (silent) return true;
      const token = state.push("table_of_contents", "", 0);
      token.block = true;
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.renderer.rules.table_of_contents = () => "<p>[TOC]</p>";
  md.block.ruler.before(
    "fence",
    "frontmatter",
    (state, startLine, endLine, silent) => {
      if (
        startLine !== 0 ||
        state.src.slice(state.bMarks[0], state.eMarks[0]).trim() !== "---"
      )
        return false;
      let next = 1;
      while (
        next < endLine &&
        !/^(---|\.\.\.)\s*$/.test(
          state.src.slice(state.bMarks[next], state.eMarks[next]),
        )
      )
        next++;
      if (next === endLine) return false;
      if (silent) return true;
      const token = state.push("frontmatter", "", 0);
      token.content = state.getLines(1, next, 0, false);
      token.map = [0, next + 1];
      token.block = true;
      state.line = next + 1;
      return true;
    },
  );
  md.renderer.rules.frontmatter = (tokens, idx) =>
    `<details class="frontmatter"><summary>YAML · metadata</summary><pre>${escapeHTML(tokens[idx].content)}</pre></details>\n`;
  md.core.ruler.after("inline", "inkstone_extensions", (state) => {
    const ids = new Map();
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type === "heading_open") {
        const content = state.tokens[i + 1];
        const base = slug(content.content) || "section";
        const n = ids.get(base) || 0;
        ids.set(base, n + 1);
        token.attrSet("id", base + (n ? `-${n}` : ""));
      }
      if (
        token.type === "blockquote_open" &&
        state.tokens[i + 2]?.type === "inline"
      ) {
        const inline = state.tokens[i + 2];
        const alert = inline.content.match(
          /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n|\s*$)/i,
        );
        if (alert) {
          token.attrSet(
            "class",
            `markdown-alert markdown-alert-${alert[1].toLowerCase()}`,
          );
          inline.content = inline.content.slice(alert[0].length);
          inline.children = state.md.parseInline(
            inline.content,
            state.env,
          )[0].children;
          const title = new state.Token("html_inline", "", 0);
          title.content = `<strong class="alert-title">${alert[1]}</strong>`;
          inline.children.unshift(title);
        }
      }
    }
  });
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0].toLowerCase();
    if (language === "math")
      return md.renderer.rules.math_block(
        [{ ...token, type: "math_block" }],
        0,
        options,
        env,
      );
    if (["mermaid", "flow", "flowchart", "sequence"].includes(language))
      return `<div class="diagram" data-kind="${language}"><pre class="diagram-source">${escapeHTML(token.content)}</pre><span class="diagram-loading">${env.options?.locale === "zh-CN" ? "正在绘制图表…" : "Rendering diagram…"}</span></div>\n`;
    const rendered = defaultFence(tokens, idx, options, env, self);
    return `<div class="code-block${env.options?.lineNumbers ? " code-line-numbers" : ""}${env.options?.codeWrap === false ? " code-no-wrap" : ""}" data-language="${escapeHTML(language || "text")}">${rendered}</div>`;
  };
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet("src");
    if (src)
      token.attrSet(
        "src",
        resolveAsset(src, env.options?.basePath, env.options?.imageRoot),
      );
    token.attrSet("loading", "lazy");
    const rendered = defaultImage(tokens, idx, options, env, self);
    if (src) token.attrSet("src", src);
    return rendered;
  };
}

const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
  typographer: false,
  highlight(code, language) {
    try {
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : escapeHTML(code);
      return highlighted
        .split("\n")
        .map((line) => `<span class="code-line">${line || " "}</span>`)
        .join("\n");
    } catch {
      return escapeHTML(code);
    }
  },
})
  .use(footnote)
  .use(sub)
  .use(sup)
  .use(mark)
  .use(emoji)
  .use(taskLists, { enabled: true, label: true })
  .use(mathPlugin)
  .use(extensions);
const footnoteReference = md.renderer.rules.footnote_ref;
md.renderer.rules.footnote_ref = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const label = token.meta.label || env.footnotes?.list?.[token.meta.id]?.label;
  const title = env.footnoteDefinitions?.[label];
  return footnoteReference(tokens, index, options, env, self).replace(
    "<a ",
    `<a${title ? ` title="${escapeHTML(title)}"` : ""} `,
  );
};

export function resolveAsset(src, basePath, imageRoot) {
  if (!src || /^(?:https?:|data:|blob:|inkstone-asset:|#)/i.test(src))
    return src;
  if (
    /^[a-z][a-z\d+.-]*:/i.test(src) &&
    !/^[a-z]:[\\/]/i.test(src) &&
    !src.startsWith("file:")
  )
    return "";
  let path = src.replace(/^file:\/\//, "");
  try {
    path = decodeURIComponent(path);
  } catch {}
  if (imageRoot && !/^file:|^[a-z]:[\\/]/i.test(src)) {
    if (/^https?:\/\//i.test(imageRoot)) {
      try {
        return new URL(path.replace(/^\/+/, ""), imageRoot.replace(/\/?$/, "/"))
          .href;
      } catch {
        return "";
      }
    }
    if (
      /^[a-z][a-z\d+.\-]*:/i.test(imageRoot) &&
      !/^(?:file:|[a-z]:[\\/])/i.test(imageRoot)
    )
      return "";
    const root = imageRoot.replace(/^file:\/\//, "").replace(/\\/g, "/");
    path = root.replace(/\/$/, "") + "/" + path.replace(/^\/+/, "");
  }
  if (!path.startsWith("/") && !/^[a-z]:[\\/]/i.test(path)) {
    if (!basePath) return src;
    const directory = basePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
    path = `${directory}/${path}`;
  }
  path = path.replace(/\\/g, "/");
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return `inkstone-asset://local/?path=${encodeURIComponent(parts.join("/"))}`;
}

export function getOutline(text, options = {}) {
  configureMarkdownParser(md, options);
  const normalized = normalizeSource(text);
  const lines = normalized.split("\n");
  const offsets = [];
  let from = 0;
  for (const line of lines) {
    offsets.push(from);
    from += line.length + 1;
  }
  const tokens = md.parse(normalized, {});
  const result = [];
  for (let i = 0; i < tokens.length; i++)
    if (tokens[i].type === "heading_open") {
      const inline = tokens[i + 1];
      result.push({
        level: Number(tokens[i].tag.slice(1)),
        text:
          inline.children
            ?.filter((token) => !["html_inline"].includes(token.type))
            .map((token) => token.content)
            .join("") || inline.content,
        id: tokens[i].attrGet("id"),
        line: (tokens[i].map?.[0] || 0) + 1,
        from: offsets[tokens[i].map?.[0] || 0],
      });
    }
  return result;
}

function createEnvironment(text, options = {}) {
  const equationLabels = {};
  const footnoteDefinitions = Object.fromEntries(
    [...text.matchAll(/^\[\^([^\]]+)\]:\s*(.*)$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  return {
    options: { ...options, ...readDocumentConfig(text) },
    equationLabels,
    equationCounter: 0,
    footnoteDefinitions,
  };
}
function assignEquationLabels(tokens, environment) {
  const labels = {};
  let number = 0;
  for (const token of tokens)
    if (
      token.type === "math_block" ||
      (token.type === "fence" && token.info.trim() === "math")
    ) {
      number++;
      const label = token.content.match(/\\label\{([^}]+)\}/)?.[1];
      const tag = token.content.match(/\\tag\*?\{([^}]+)\}/)?.[1];
      if (label) labels[label] = tag || number;
    }
  environment.equationLabels = labels;
}
function finishHTML(html, options, outline) {
  const toc = `<nav class="table-of-contents" aria-label="Table of contents"><ul>${outline.map((item) => `<li style="margin-left:${(item.level - 1) * 16}px"><a href="#${escapeHTML(item.id)}">${escapeHTML(item.text)}</a></li>`).join("")}</ul></nav>`;
  html = html.replace(/<p>(?:\[(?:toc|TOC)\]|\[\[_TOC_\]\])<\/p>/g, toc);
  html = html.replace(
    /<iframe\b([^>]*)>/gi,
    (_, attributes) =>
      `<iframe${attributes.replace(/\s+(?:sandbox|loading)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")} sandbox="allow-scripts allow-presentation" loading="lazy">`,
  );
  const previousOptions = activeAssetOptions;
  activeAssetOptions = options;
  try {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: [
        "iframe",
        "video",
        "audio",
        "source",
        "track",
        "math",
        "semantics",
        "annotation",
      ],
      ADD_ATTR: [
        "allowfullscreen",
        "frameborder",
        "controls",
        "autoplay",
        "loop",
        "muted",
        "playsinline",
        "target",
        "loading",
        "sandbox",
        "kind",
        "srclang",
        "label",
        "default",
      ],
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data|blob|inkstone-asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ["script", "object", "embed", "form", "style"],
      FORBID_ATTR: ["srcdoc"],
    });
  } finally {
    activeAssetOptions = previousOptions;
  }
}
export function renderMarkdown(text, options = {}) {
  configureMarkdownParser(md, options, {
    target: options.renderTarget || "editor",
  });
  md.set({
    typographer: Boolean(options.smartPunctuation),
  });
  const normalized = normalizeSource(text);
  const env = createEnvironment(normalized, options);
  const tokens = md.parse(normalized, env);
  assignEquationLabels(tokens, env);
  return finishHTML(
    md.renderer.render(tokens, md.options, env),
    env.options,
    options.outline || getOutline(normalized, options),
  );
}
export function renderBlockMarkdown(block, options = {}) {
  configureMarkdownParser(md, options);
  // Render the original document's parsed tokens, preserving global references, labels and IDs.
  const env = {
    ...block.environment,
    options: { ...options },
    equationCounter: block.equationOffset || 0,
  };
  if (block.environment.options.imageRoot)
    env.options.imageRoot = block.environment.options.imageRoot;
  let html = md.renderer.render(block.tokens, md.options, env);
  if (block.type === "footnote_definition")
    html = `<section class="footnotes"><ol start="${block.footnoteNumber}">${html}</ol></section>`;
  return finishHTML(html, env.options, options.outline || []);
}

// The parser knows the exact delimiters. Rendered glyphs and SVG paths do not
// have a reversible relationship to TeX, so pointer editing must use these spans.
export function inlineMathRanges(block) {
  const ranges = [];
  let searched = 0;
  for (const inline of block.tokens || []) {
    if (inline.type !== "inline") continue;
    const lines = inline.content.split("\n");
    const mapping = [];
    let contentOffset = 0,
      sourceOffset = searched;
    for (const line of lines) {
      const found = block.text.indexOf(line, sourceOffset);
      if (found < 0) break;
      mapping.push({
        from: contentOffset,
        to: contentOffset + line.length,
        source: found,
      });
      contentOffset += line.length + 1;
      sourceOffset = found + line.length + 1;
    }
    searched = Math.max(searched, sourceOffset - 1);
    const position = (offset) => {
      const line = mapping.find(
        (line) => offset >= line.from && offset <= line.to,
      );
      return line ? block.from + line.source + offset - line.from : null;
    };
    for (const token of inline.children || []) {
      if (token.type !== "math_inline" || !token.meta) continue;
      const from = position(token.meta.from),
        to = position(token.meta.to);
      if (from == null || to == null) continue;
      ranges.push({
        from,
        to,
        contentFrom: from + token.meta.delimiter,
        contentTo: to - token.meta.delimiter,
        token,
      });
    }
  }
  return ranges;
}

export function renderInlineMath(token, block, options = {}) {
  const env = { ...block.environment, options };
  return finishHTML(
    md.renderer.rules.math_inline([token], 0, md.options, env),
    options,
    [],
  );
}

/** Source ranges and shared parse context for top-level, selection-safe editing blocks. */
export function parseBlocks(text, options = {}) {
  configureMarkdownParser(md, options, {
    target: options.renderTarget || "editor",
  });
  md.set({
    typographer: Boolean(options.smartPunctuation),
  });
  const lines = text.split("\n");
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const environment = createEnvironment(text, options);
  const tokens = md.parse(text, environment);
  assignEquationLabels(tokens, environment);
  const blocks = [];
  let current = null;
  let equationOffset = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "footnote_block_open") break;
    if (
      !token.map ||
      token.level !== 0 ||
      token.nesting === -1 ||
      token.type === "inline"
    )
      continue;
    const from = offsets[token.map[0]];
    const last = Math.min(lines.length - 1, token.map[1] - 1);
    const to = offsets[last] + lines[last].length;
    if (from == null || to <= from || (current && from < current.to)) continue;
    let tokenEnd = index + 1;
    if (token.nesting === 1) {
      while (
        tokenEnd < tokens.length &&
        !(tokens[tokenEnd].level === 0 && tokens[tokenEnd].nesting === -1)
      )
        tokenEnd++;
      tokenEnd++;
    }
    const blockTokens = tokens.slice(index, tokenEnd);
    current = {
      from,
      to,
      type: token.type,
      line: token.map[0] + 1,
      text: text.slice(from, to),
      tokens: blockTokens,
      environment,
      equationOffset,
    };
    equationOffset += blockTokens.filter(
      (item) =>
        item.type === "math_block" ||
        (item.type === "fence" && item.info.trim() === "math"),
    ).length;
    if (token.type === "heading_open") {
      current.headingId = token.attrGet("id");
      current.headingLevel = Number(token.tag.slice(1));
      current.headingText =
        tokens[index + 1]?.children
          ?.filter((item) => item.type !== "html_inline")
          .map((item) => item.content)
          .join("") ||
        tokens[index + 1]?.content ||
        "";
    }
    blocks.push(current);
  }
  // markdown-it moves footnote bodies to the end; map them back to their original source locations.
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "footnote_open" || !token.meta.label) continue;
    const label = token.meta.label;
    const line = lines.findIndex((value) => value.startsWith(`[^${label}]:`));
    if (line < 0) continue;
    let endLine = line + 1;
    while (
      endLine < lines.length &&
      (/^(?: {4}|\t)/.test(lines[endLine]) ||
        (!lines[endLine].trim() &&
          /^(?: {4}|\t)/.test(lines[endLine + 1] || "")))
    )
      endLine++;
    let tokenEnd = index + 1;
    while (
      tokenEnd < tokens.length &&
      tokens[tokenEnd].type !== "footnote_close"
    )
      tokenEnd++;
    const from = offsets[line],
      to = offsets[endLine - 1] + lines[endLine - 1].length;
    if (!blocks.some((block) => from < block.to && to > block.from))
      blocks.push({
        from,
        to,
        type: "footnote_definition",
        line: line + 1,
        text: text.slice(from, to),
        tokens: tokens.slice(index, tokenEnd + 1),
        environment,
        footnoteNumber: token.meta.id + 1,
      });
  }
  return blocks.sort((a, b) => a.from - b.from);
}

export function reparseParagraph(block, text, options = {}) {
  if (block.type !== "paragraph_open" || /\[\^|^\s*\[.*\]:/m.test(text))
    return null;
  const environment = {
    ...block.environment,
    options,
    references: { ...block.environment.references },
    footnotes: undefined,
  };
  configureMarkdownParser(md, options, {
    target: options.renderTarget || "editor",
  });
  md.set({
    typographer: Boolean(options.smartPunctuation),
  });
  const tokens = md.parse(text, environment);
  if (
    tokens.length !== 3 ||
    tokens[0].type !== "paragraph_open" ||
    tokens[1].type !== "inline" ||
    tokens[2].type !== "paragraph_close"
  )
    return null;
  return {
    ...block,
    text,
    to: block.from + text.length,
    tokens,
    environment: block.environment,
  };
}

let mermaidPromise;
let zenumlPromise;
let legacyPromise;
let diagramId = 0;
export async function hydrateDiagrams(container, options = {}) {
  const elements = [
    ...container.querySelectorAll(".diagram:not([data-rendered])"),
  ];
  if (!elements.length) return;

  for (const element of elements) {
    if (!element.isConnected) continue;
    element.dataset.rendered = "pending";
    let source = element.querySelector(".diagram-source")?.textContent || "";
    const kind = element.dataset.kind;
    try {
      if (kind === "sequence" || kind === "flow" || kind === "flowchart") {
        legacyPromise ||= import("./legacy-diagrams.js");
        const { renderLegacyDiagram } = await legacyPromise;
        const svg = await renderLegacyDiagram(kind, source, options);
        if (!element.isConnected) continue;
        element.innerHTML = svg;
        element.dataset.rendered = "true";
        element.dataset.engine =
          kind === "sequence" ? "js-sequence-diagrams" : "flowchart.js";
        continue;
      }
      mermaidPromise ||= import("mermaid").then((module) => module.default);
      const mermaid = await mermaidPromise;
      if (/^\s*zenuml\b/m.test(source)) {
        zenumlPromise ||= import("@mermaid-js/mermaid-zenuml").then((module) =>
          mermaid.registerExternalDiagrams([module.default]),
        );
        await zenumlPromise;
      }
      const prepared = prepareDiagramSource(source);
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: options.theme === "dark" ? "dark" : "neutral",
        fontFamily: "sans-serif",
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        sequence: { useMaxWidth: true },
      });
      const { svg, bindFunctions } = await mermaid.render(
        `inkstone-diagram-${++diagramId}`,
        prepared.source,
      );
      if (!element.isConnected) continue;
      element.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        FORBID_TAGS: ["script", "iframe", "object", "embed"],
        ADD_TAGS: ["foreignObject"],
        ADD_ATTR: ["dominant-baseline"],
      });
      restoreDiagramLabels(element, prepared.labels);
      element.dataset.rendered = "true";
      bindFunctions?.(element);
    } catch (error) {
      element.dataset.rendered = "error";
      element.classList.add("diagram-error");
      element.querySelector(".diagram-loading")?.remove();
      const message = document.createElement("small");
      message.textContent = `${options.locale === "zh-CN" ? "图表" : "Diagram"}: ${error.message || error}`;
      element.append(message);
    }
  }
}

export const exportCSS = `
.markdown-body{font-family:Georgia,"Noto Serif CJK SC","Songti SC",serif;font-size:16px;line-height:1.8;color:#252a32;overflow-wrap:anywhere}
.markdown-body h1,.markdown-body h2,.markdown-body h3{line-height:1.3;break-after:avoid}.markdown-body h1{font-size:2.2em}.markdown-body h2{font-size:1.65em;border-bottom:1px solid #ddd;padding-bottom:.25em}
.markdown-body img,.markdown-body video{max-width:100%;height:auto}.markdown-body table{border-collapse:collapse;width:100%;margin:1em 0}.markdown-body td,.markdown-body th{border:1px solid #d9dfe3;padding:.4em .7em}.markdown-body th{background:#f2f5f6}
.markdown-body pre{white-space:pre-wrap;background:#f3f5f7;padding:1em;border-radius:6px}.markdown-body code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.88em}.markdown-body :not(pre)>code{background:#eef1f3;padding:.15em .3em;border-radius:3px}
.markdown-body blockquote{border-left:3px solid #89a6aa;margin-left:0;padding-left:1.2em;color:#65747c}.markdown-body a{color:#157a83;text-decoration:underline}.markdown-body .task-list-item{list-style:none}.task-list-item-checkbox{margin-right:.5em;accent-color:#157a83}
.mathjax-fallback{display:inline-block;vertical-align:middle}.mathjax-fallback>svg{max-width:100%;height:auto}.markdown-body .math-display{position:relative;overflow-x:auto;padding:.6em 1.8em}.equation-number{position:absolute;right:0;top:50%;transform:translateY(-50%)}.math-error,.diagram-error{color:#a72835;background:#fff2f1;padding:.6em}.math-error small,.diagram-error small{display:block;white-space:pre-wrap;font-family:monospace;font-size:11px}
.markdown-body .diagram{text-align:center;overflow:auto;margin:1em 0}.markdown-body .diagram svg{max-width:100%;height:auto}.diagram[data-rendered=true] .diagram-source{display:none}.diagram-loading{font-size:12px;color:#71828b}
.markdown-body .markdown-alert{border-left-color:#3f83cf;background:#f0f6fc;padding:.7em 1em}.alert-title{display:block;color:#316ba7}.markdown-alert-warning,.markdown-alert-caution{border-left-color:#c68a19!important}.frontmatter{font:12px/1.6 monospace;opacity:.65;border:1px dashed #adb9be;padding:.5em}.frontmatter summary{cursor:pointer}
.code-block{position:relative}.code-block:before{content:attr(data-language);position:absolute;right:10px;top:4px;font:10px/1.4 sans-serif;color:#7b8993}.code-line-numbers code{counter-reset:code-line}.code-line-numbers .code-line:before{counter-increment:code-line;content:counter(code-line);display:inline-block;width:2em;padding-right:1em;text-align:right;opacity:.4;user-select:none}.table-of-contents ul{list-style:none;padding:0}.table-of-contents a{text-decoration:none}mark{background:#fff0a4}hr{border:0;border-top:1px solid #d8dfe2;margin:2em 0}
@media print{.markdown-body{font-size:11pt}a{color:inherit!important;text-decoration:none!important}.code-block,figure,table,pre,.math-display,.diagram{break-inside:avoid}thead{display:table-header-group}.page-break{break-after:page}.diagram-loading{display:none}}
`;
