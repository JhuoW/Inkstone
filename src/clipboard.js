import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";
import { renderMarkdown } from "./markdown.js";
import { locateTable } from "./tables.js";
import { isolateHistory } from "@codemirror/commands";

const converter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
converter.use(gfm);
converter.addRule("escapedTableCell", {
  filter: ["th", "td"],
  replacement: (content, node) => {
    const first = [...node.parentNode.children].indexOf(node) === 0;
    // The table parser removes one pipe-escape slash before parsing inline Markdown.
    return (first ? "| " : " ") + content.replace(/\|/g, "\\|") + " |";
  },
});
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
let pendingNativeCopy = null;
function insertClipboardText(editor, value) {
  if (editor.view.state.readOnly) return;
  editor.view.dispatch({ annotations: isolateHistory.of("full") });
  editor.insert(value);
  editor.view.dispatch({ annotations: isolateHistory.of("full") });
}
export function installClipboard(
  host,
  editor,
  getContext,
  onError = console.error,
) {
  host.addEventListener(
    "copy",
    (event) => {
      if (event.target.closest(".inkstone-table-cell-editor")) return;
      const selection = editor.view.state.selection.main;
      if (selection.empty || !event.clipboardData) return;
      const markdown = editor.view.state.sliceDoc(selection.from, selection.to);
      const html = renderMarkdown(markdown, { basePath: getContext().path });
      if (window.inkstone && /Electron\//.test(navigator.userAgent)) {
        event.preventDefault();
        // Leave DataTransfer empty: Chromium would otherwise overwrite the native
        // custom representation after this copy listener finishes.
        const operation = window.inkstone.invoke("writeClipboard", {
          text: markdown,
          html,
          markdown,
        });
        pendingNativeCopy = operation;
        operation.catch(onError).finally(() => {
          if (pendingNativeCopy === operation) pendingNativeCopy = null;
        });
        return;
      }
      event.clipboardData.setData("text/plain", markdown);
      event.clipboardData.setData("text/x-inkstone-markdown", markdown);
      event.clipboardData.setData("text/html", html);
      event.preventDefault();
    },
    true,
  );
  host.addEventListener(
    "paste",
    (event) => {
      if (event.target.closest(".inkstone-table-cell-editor")) return;
      if (event.defaultPrevented || !event.clipboardData) return;
      if (window.inkstone && pendingNativeCopy) {
        event.preventDefault();
        event.stopPropagation();
        const doc = editor.view.state.doc,
          selection = editor.view.state.selection,
          path = getContext().path;
        const sourceMode =
          editor.getMode() === "source" || editor.isInCodeBlock?.();
        pendingNativeCopy
          .then(() => window.inkstone.invoke("readClipboard"))
          .then((clipboard) => {
            if (
              !editor.view.dom.isConnected ||
              editor.view.state.readOnly ||
              editor.view.state.doc !== doc ||
              !editor.view.state.selection.eq(selection) ||
              getContext().path !== path
            )
              throw Error(
                "The document or insertion point changed while reading the clipboard. Paste again.",
              );
            const insertion =
              typeof clipboard.markdown === "string"
                ? clipboard.markdown
                : !sourceMode && clipboard.html
                  ? htmlToMarkdown(clipboard.html)
                  : clipboard.text;
            if (insertion) insertClipboardText(editor, insertion);
          })
          .catch(onError);
        return;
      }
      const own = event.clipboardData.getData("text/x-inkstone-markdown");
      if (own) {
        event.preventDefault();
        event.stopPropagation();
        insertClipboardText(editor, own);
        return;
      }
      if (
        editor.getMode() === "source" ||
        editor.isInCodeBlock?.() ||
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
        if (!window.inkstone) {
          insertClipboardText(editor, htmlToMarkdown(html));
          return;
        }
        const doc = editor.view.state.doc;
        const selection = editor.view.state.selection;
        const path = getContext().path;
        window.inkstone
          .invoke("readClipboard")
          .then((clipboard) => {
            if (
              !editor.view.dom.isConnected ||
              editor.view.state.readOnly ||
              editor.view.state.doc !== doc ||
              !editor.view.state.selection.eq(selection) ||
              getContext().path !== path
            )
              throw Error(
                "The document or insertion point changed while reading the clipboard. Paste again.",
              );
            const normalize = (value) => value.replace(/\r\n|\r/g, "\n");
            const own =
              typeof clipboard.markdown === "string" &&
              normalize(clipboard.text) === normalize(plain) &&
              normalize(clipboard.markdown) === normalize(plain);
            insertClipboardText(
              editor,
              own ? clipboard.markdown : htmlToMarkdown(html),
            );
          })
          .catch(onError);
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
      ...(!plainOnly ? { markdown } : {}),
    });
  if (plainOnly) return navigator.clipboard.writeText(el.textContent);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ]);
}
