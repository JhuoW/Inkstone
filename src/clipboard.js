import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";
import { renderMarkdown } from "./markdown.js";
import { locateTable } from "./tables.js";

const converter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
converter.use(gfm);
converter.keep([
  "video",
  "audio",
  "iframe",
  "details",
  "summary",
  "ruby",
  "rt",
  "rp",
  "kbd",
  "sub",
  "sup",
  "mark",
]);
converter.addRule("katex", {
  filter: (node) => node.nodeType === 1 && node.classList.contains("katex"),
  replacement: (_content, node) => {
    const tex =
      node.querySelector('annotation[encoding="application/x-tex"]')
        ?.textContent || node.textContent;
    return node.parentElement?.classList.contains("katex-display")
      ? "\n\n$$\n" + tex + "\n$$\n\n"
      : "$" + tex + "$";
  },
});
converter.addRule("codeLanguages", {
  filter: (node) => node.nodeName === "PRE" && node.querySelector("code"),
  replacement: (_content, node) => {
    const code = node.querySelector("code"),
      language =
        [...code.classList].find((c) => c.startsWith("language-"))?.slice(9) ||
        "";
    const fence = "\x60".repeat(
      Math.max(
        3,
        ...[...code.textContent.matchAll(/\x60+/g)].map((m) => m[0].length + 1),
      ),
    );
    return (
      "\n\n" +
      fence +
      language +
      "\n" +
      code.textContent.replace(/\n$/, "") +
      "\n" +
      fence +
      "\n\n"
    );
  },
});
export function htmlToMarkdown(html) {
  return converter.turndown(
    DOMPurify.sanitize(html, {
      ADD_TAGS: ["video", "audio", "source"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    }),
  );
}
export function installClipboard(host, editor, getContext) {
  host.addEventListener(
    "copy",
    (event) => {
      if (editor.view.state.readOnly) return;
      const selection = editor.view.state.selection.main;
      if (selection.empty || !event.clipboardData) return;
      const markdown = editor.view.state.sliceDoc(selection.from, selection.to);
      event.clipboardData.setData("text/plain", markdown);
      event.clipboardData.setData("text/x-inkstone-markdown", markdown);
      event.clipboardData.setData(
        "text/html",
        renderMarkdown(markdown, { basePath: getContext().path }),
      );
      event.preventDefault();
    },
    true,
  );
  host.addEventListener(
    "paste",
    (event) => {
      if (event.target.closest(".inkstone-table-cell-editor")) return;
      if (event.defaultPrevented || !event.clipboardData) return;
      const own = event.clipboardData.getData("text/x-inkstone-markdown");
      if (own) {
        event.preventDefault();
        event.stopPropagation();
        editor.insert(own);
        return;
      }
      if (
        editor.getMode() === "source" ||
        [...event.clipboardData.items].some((i) => i.type.startsWith("image/"))
      )
        return;
      const plain = event.clipboardData.getData("text/plain");
      if (
        plain.includes("\t") &&
        locateTable(
          editor.view.state.doc.toString(),
          editor.view.state.selection.main.head,
        )
      )
        return;
      const html = event.clipboardData.getData("text/html");
      if (html) {
        event.preventDefault();
        event.stopPropagation();
        editor.insert(htmlToMarkdown(html));
      }
    },
    true,
  );
}
export async function writeRichClipboard(markdown, context, plainOnly = false) {
  const html = renderMarkdown(markdown, { basePath: context.path }),
    el = document.createElement("div");
  el.innerHTML = html;
  if (window.inkstone)
    return window.inkstone.invoke("writeClipboard", {
      text: plainOnly ? el.textContent : markdown,
      ...(!plainOnly ? { html } : {}),
    });
  if (plainOnly) return navigator.clipboard.writeText(el.textContent);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ]);
}
