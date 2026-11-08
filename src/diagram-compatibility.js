/** Mermaid 12.3 Sankey's upstream CSV lexer only accepts U+0020–U+007E.
 * Keep editor source intact; use opaque ASCII node IDs solely for rendering.
 * Labels are restored through text nodes, never parsed as HTML.
 */
function readRows(body) {
  const rows = [];
  let fields = [],
    field = "",
    quoted = false,
    closed = false;
  for (let index = 0; index <= body.length; index++) {
    const char = body[index];
    if (!quoted && fields.length === 0 && field === "" && !closed) {
      const skip = body.slice(index).match(/^[ \t]*(?:%%[^\r\n]*)?\r?\n/);
      if (skip) {
        index += skip[0].length - 1;
        continue;
      }
    }
    if (quoted) {
      if (char === undefined) return null;
      if (char === '"') {
        if (body[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"') {
      if (field !== "" || closed) return null;
      quoted = true;
      continue;
    }
    if (char === "," || char === "\n" || char === "\r" || char === undefined) {
      if (char === undefined && !fields.length && !field && !closed) break;
      fields.push(field);
      field = "";
      closed = false;
      if (char === ",") continue;
      if (
        fields.length !== 3 ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(fields[2].trim())
      )
        return null;
      rows.push(fields);
      fields = [];
      if (char === "\r" && body[index + 1] === "\n") index++;
    } else {
      if (closed) return null;
      field += char;
    }
  }
  return rows;
}

export function prepareDiagramSource(source) {
  const header = /(^|\n)[ \t]*sankey(?:-beta)?[ \t]*\r?\n/.exec(source);
  if (!header) return { source, labels: null };
  const end = header.index + header[0].length;
  const body = source.slice(end);
  if (!/[^\x00-\x7f]/.test(body)) return { source, labels: null };
  const rows = readRows(body);
  if (!rows || !rows.length) return { source, labels: null };
  const ids = new Map(),
    labels = new Map();
  const node = (label) => {
    if (!ids.has(label)) {
      const id = `InkstoneSankeyNode${ids.size}X`;
      ids.set(label, id);
      labels.set(id, label);
    }
    return ids.get(label);
  };
  return {
    source:
      source.slice(0, end) +
      "\n" +
      rows
        .map(([from, to, value]) => `${node(from)},${node(to)},${value}`)
        .join("\n") +
      "\n",
    labels,
  };
}

export function restoreDiagramLabels(element, labels) {
  if (!labels) return;
  const replacement = (text) =>
    text.replace(/InkstoneSankeyNode\d+X/g, (id) => labels.get(id) ?? id);
  for (const text of element.querySelectorAll("svg text,svg title,svg desc")) {
    const walker = element.ownerDocument.createTreeWalker(text, 4);
    while (walker.nextNode())
      walker.currentNode.nodeValue = replacement(walker.currentNode.nodeValue);
  }
  for (const node of element.querySelectorAll("svg [aria-label]"))
    node.setAttribute(
      "aria-label",
      replacement(node.getAttribute("aria-label")),
    );
}
