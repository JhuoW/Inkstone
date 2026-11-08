const commandGlyphs = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ϵ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "ϕ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Omega: "Ω",
  times: "×",
  cdot: "⋅",
  pm: "±",
  div: "÷",
  infty: "∞",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
};
const glyphKey = (value) =>
  value.normalize("NFKD").replace(/−/g, "-").replace(/[∗⋆]/g, "*");
const commandText = (name) =>
  Object.hasOwn(commandGlyphs, name)
    ? commandGlyphs[name]
    : name.length === 1 && !/[A-Za-z\s,;:!]/u.test(name)
      ? name
      : null;
const nonGlyphCommands = new Set([
  "\\sqrt",
  "\\left",
  "\\right",
  "\\mathrm",
  "\\mathbf",
  "\\mathit",
  "\\mathsf",
  "\\mathtt",
  "\\mathcal",
  "\\mathbb",
  "\\mathfrak",
  "\\mathnormal",
  "\\boldsymbol",
  "\\text",
  "\\textnormal",
  "\\textrm",
  "\\textsf",
  "\\texttt",
  "\\displaystyle",
  "\\textstyle",
  "\\scriptstyle",
  "\\scriptscriptstyle",
  "\\quad",
  "\\qquad",
  "\\enspace",
  "\\,",
  "\\;",
  "\\:",
  "\\!",
  "\\ ",
]);

function sourceGlyphs(source) {
  const glyphs = [];
  for (let index = 0; index < source.length;) {
    const from = index;
    if (source[index] === "\\") {
      const command = /^\\([A-Za-z]+|.)/u.exec(source.slice(index));
      if (!command) {
        index++;
        continue;
      }
      index += command[0].length;
      const name = command[1];
      const text = commandText(name);
      if (text) glyphs.push({ key: glyphKey(text), from, to: index });
      continue;
    }
    const text = String.fromCodePoint(source.codePointAt(index));
    index += text.length;
    if (!/[\s{}^_]/u.test(text))
      glyphs.push({ key: glyphKey(text), from, to: index });
  }
  return glyphs;
}

// Only source constructs with a dependable geometric grouping are modeled.
// Unsupported commands still use the unambiguous-symbol/fallback path below.
function sourceStructure(source) {
  const lexemes = [...source.matchAll(/\\(?:[A-Za-z]+|[^\r\n])|[^\s]/gu)].map(
    (match) => ({
      value: match[0],
      from: match.index,
      to: match.index + match[0].length,
    }),
  );
  let index = 0;
  function argument(depth) {
    if (index >= lexemes.length) throw Error("Missing math argument");
    return atom(depth + 1);
  }
  function atom(depth) {
    if (depth > 64) throw Error("Math grouping is too deep");
    const token = lexemes[index++];
    if (token.value === "{")
      return [{ kind: "group", children: expression(true, depth + 1) }];
    if (["\\frac", "\\dfrac", "\\tfrac", "\\cfrac"].includes(token.value))
      return [
        {
          kind: "fraction",
          numerator: argument(depth),
          denominator: argument(depth),
        },
      ];
    const text = token.value.startsWith("\\")
      ? commandText(token.value.slice(1))
      : token.value;
    if (
      token.value.startsWith("\\") &&
      !text &&
      !nonGlyphCommands.has(token.value)
    )
      throw Error("Unsupported math layout command");
    return text && (token.value.startsWith("\\") || !/[{}^_]/u.test(text))
      ? [
          {
            kind: "symbol",
            key: glyphKey(text),
            from: token.from,
            to: token.to,
          },
        ]
      : [];
  }
  function expression(group, depth) {
    const nodes = [];
    while (index < lexemes.length) {
      const value = lexemes[index].value;
      if (value === "}") {
        index++;
        if (group) return nodes;
        continue;
      }
      if ((value === "^" || value === "_") && nodes.length) {
        index++;
        const base = nodes.pop();
        const scripts =
          base.kind === "scripts"
            ? base
            : { kind: "scripts", base: [base], superscript: [], subscript: [] };
        scripts[value === "^" ? "superscript" : "subscript"] = argument(depth);
        nodes.push(scripts);
      } else nodes.push(...atom(depth));
    }
    if (group) throw Error("Unclosed math group");
    return nodes;
  }
  try {
    return expression(false, 0);
  } catch {
    return null;
  }
}
const glyphCount = (nodes) =>
  nodes.reduce(
    (total, node) =>
      total +
      (node.kind === "symbol"
        ? 1
        : node.kind === "fraction"
          ? glyphCount(node.numerator) + glyphCount(node.denominator)
          : node.kind === "scripts"
            ? glyphCount(node.base) +
              glyphCount(node.superscript) +
              glyphCount(node.subscript)
            : glyphCount(node.children)),
    0,
  );
const horizontalOrder = (a, b) =>
  a.left + a.right - (b.left + b.right) ||
  a.top + a.bottom - (b.top + b.bottom);
const verticalOrder = (a, b) =>
  a.top + a.bottom - (b.top + b.bottom) || horizontalOrder(a, b);

function alignStructure(nodes, glyphs, mapping) {
  if (glyphCount(nodes) !== glyphs.length) return false;
  const ordered = [...glyphs].sort(horizontalOrder);
  let offset = 0;
  for (const node of nodes) {
    const count = glyphCount([node]);
    const part = ordered.slice(offset, offset + count);
    offset += count;
    if (node.kind === "symbol") {
      if (node.key !== glyphKey(part[0].text)) return false;
      mapping.set(part[0], node);
    } else if (node.kind === "fraction") {
      const vertical = part.sort(verticalOrder);
      const numeratorCount = glyphCount(node.numerator);
      if (
        !alignStructure(
          node.numerator,
          vertical.slice(0, numeratorCount),
          mapping,
        ) ||
        !alignStructure(
          node.denominator,
          vertical.slice(numeratorCount),
          mapping,
        )
      )
        return false;
    } else if (node.kind === "scripts") {
      const vertical = part.sort(verticalOrder);
      const superscriptCount = glyphCount(node.superscript),
        baseCount = glyphCount(node.base);
      if (
        !alignStructure(
          node.superscript,
          vertical.slice(0, superscriptCount),
          mapping,
        ) ||
        !alignStructure(
          node.base,
          vertical.slice(superscriptCount, superscriptCount + baseCount),
          mapping,
        ) ||
        !alignStructure(
          node.subscript,
          vertical.slice(superscriptCount + baseCount),
          mapping,
        )
      )
        return false;
    } else if (!alignStructure(node.children, part, mapping)) return false;
  }
  return true;
}

function distanceToBox(point, box) {
  const x = Math.max(box.left - point.x, 0, point.x - box.right);
  const y = Math.max(box.top - point.y, 0, point.y - box.bottom);
  return x * x + y * y;
}

/** Linear glyphs, fraction groups and scripts map by source structure; unsupported TeX uses a bounded approximation. */
export function mathCaretOffset(source, glyphs, point, bounds) {
  const tokens = sourceGlyphs(source);
  const visible = glyphs.filter(
    (glyph) => glyph.right > glyph.left && glyph.bottom > glyph.top,
  );
  const nearest = visible.reduce(
    (best, glyph) =>
      !best || distanceToBox(point, glyph) < distanceToBox(point, best)
        ? glyph
        : best,
    null,
  );
  let token;
  if (nearest) {
    const structure = sourceStructure(source);
    const mapping = new Map();
    if (structure && alignStructure(structure, visible, mapping))
      token = mapping.get(nearest);
    const key = glyphKey(nearest.text);
    const matching = tokens.filter((item) => item.key === key);
    if (
      !token &&
      !/[\\{}^_]/.test(source) &&
      tokens.map((item) => item.key).join("") ===
        visible.map((item) => glyphKey(item.text)).join("")
    ) {
      token = tokens[visible.indexOf(nearest)];
    } else if (!token && matching.length === 1) token = matching[0];
    if (token)
      return point.x < (nearest.left + nearest.right) / 2
        ? token.from
        : token.to;
  }
  const ratio =
    bounds.right > bounds.left
      ? Math.max(
          0,
          Math.min(1, (point.x - bounds.left) / (bounds.right - bounds.left)),
        )
      : 0;
  let offset = Math.round(ratio * source.length);
  for (const command of source.matchAll(/\\[A-Za-z]+/g)) {
    if (offset > command.index && offset < command.index + command[0].length) {
      offset =
        offset - command.index < command[0].length / 2
          ? command.index
          : command.index + command[0].length;
      break;
    }
  }
  // Never split a Unicode code point when geometry cannot be mapped to a TeX token.
  if (
    offset > 0 &&
    offset < source.length &&
    /[\uD800-\uDBFF]/.test(source[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(source[offset])
  )
    offset++;
  return offset;
}

export function inlineMathOffsetAtPoint(element, source, x, y) {
  const root = element.querySelector(".katex-html") || element;
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(root, 4);
  const glyphs = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(".katex-mathml, .math-error, annotation"))
      continue;
    let offset = 0;
    for (const text of node.textContent) {
      const from = offset;
      offset += text.length;
      if (/^[\s\u200B-\u200F\u2060]$/u.test(text)) continue;
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, offset);
      const box = range.getBoundingClientRect();
      if (box.width > 0 && box.height > 0)
        glyphs.push({
          text,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        });
    }
  }
  return mathCaretOffset(
    source,
    glyphs,
    { x, y },
    element.getBoundingClientRect(),
  );
}
