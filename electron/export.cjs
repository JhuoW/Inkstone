"use strict";
/**
 * Export, import and Pandoc: detecting Pandoc, converting with it, rendering
 * HTML/PDF/PNG in an isolated window, and reading local assets for export.
 * The main process passes its access checks and live state in as deps.
 */
const { BrowserWindow, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { atomicWrite, exists } = require("./storage.cjs");
const { embedExportDiagrams } = require("./export-diagrams.cjs");
const { boundedString } = require("./settings-schema.cjs");

/**
 * @param {object} deps
 * @param {() => object} deps.settings Current settings.
 * @param {() => object} deps.store The file store (revision checks).
 * @param {Function} deps.authorized Resolves a path the window may read.
 * @param {Function} deps.grant Grants access to a chosen path.
 * @param {Function} deps.isWithin Whether a path lies inside a root.
 * @param {Function} deps.localize Picks the English or Chinese text.
 * @param {object} deps.mimeTypes Asset MIME types by extension.
 * @param {Function} deps.run Runs an external program with a timeout.
 */
function createExportService(deps) {
  const { authorized, grant, isWithin, localize, mimeTypes, run } = deps;
  async function detectTools() {
    const command = deps.settings().pandocPath || "pandoc";
    try {
      const output = await run(command, ["--version"], { timeout: 6000 });
      const input = await run(command, ["--list-input-formats"], {
        timeout: 6000,
      });
      const formats = await run(command, ["--list-output-formats"], {
        timeout: 6000,
      });
      return {
        pandoc: {
          available: true,
          path: command,
          version: output.stdout.split("\n")[0],
          inputFormats: input.stdout.trim().split(/\r?\n/),
          outputFormats: formats.stdout.trim().split(/\r?\n/),
        },
      };
    } catch (error) {
      return {
        pandoc: { available: false, path: command, error: error.message },
      };
    }
  }
  const importFormats = {
    ltx: "latex",
    rest: "rst",
    rtf: "rtf",
    pptx: "pptx",
    adoc: "asciidoc",
    asciidoc: "asciidoc",
    dokuwiki: "dokuwiki",
    t2t: "t2t",
    fb2: "fb2",
    docbook: "docbook",
    json: "json",
    docx: "docx",
    odt: "odt",
    epub: "epub",
    tex: "latex",
    latex: "latex",
    rst: "rst",
    html: "html",
    htm: "html",
    wiki: "mediawiki",
    org: "org",
    textile: "textile",
    opml: "opml",
  };
  const exportFormats = {
    "pandoc-pdf": "latex",
    markdown: "markdown",
    gfm: "gfm",
    commonmark: "commonmark",
    markdown_strict: "markdown_strict",
    markdown_mmd: "markdown_mmd",
    ltx: "latex",
    rest: "rst",
    dokuwiki: "dokuwiki",
    text: "plain",
    txt: "plain",
    plain: "plain",
    s5: "s5",
    slidy: "slidy",
    slideous: "slideous",
    dzslides: "dzslides",
    docbook: "docbook",
    fb2: "fb2",
    texinfo: "texinfo",
    man: "man",
    t2t: "t2t",
    docx: "docx",
    odt: "odt",
    rtf: "rtf",
    epub: "epub",
    tex: "latex",
    latex: "latex",
    rst: "rst",
    wiki: "mediawiki",
    mediawiki: "mediawiki",
    org: "org",
    textile: "textile",
    opml: "opml",
    pptx: "pptx",
    revealjs: "revealjs",
    beamer: "beamer",
    asciidoc: "asciidoc",
    json: "json",
  };
  async function writeExport(file, bytes, revision) {
    await atomicWrite(file, bytes, {
      beforeRename: async () => {
        if ((await deps.store().revision(file)) !== revision)
          throw Error(
            "CONFLICT: Export destination changed while rendering. The existing file was not overwritten; choose a new destination.",
          );
      },
    });
  }
  async function runPandoc(payload, win) {
    const command = deps.settings().pandocPath || "pandoc";
    if (payload.direction === "format") {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-format-"));
      try {
        const input = path.join(temp, "input.md");
        await fs.writeFile(input, payload.text || "", "utf8");
        const result = await run(command, [
          "--from",
          "markdown",
          "--to",
          "markdown",
          "--wrap=none",
          input,
        ]);
        return { text: result.stdout, warnings: result.stderr };
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    }
    if (payload.direction === "import") {
      let source = payload.path;
      if (!source) {
        const result = await dialog.showOpenDialog(win, {
          title: localize("Import with Pandoc", "使用 Pandoc 导入"),
          buttonLabel: localize("Import", "导入"),
          properties: ["openFile"],
          filters: [
            {
              name: localize("Pandoc documents", "Pandoc 文档"),
              extensions: Object.keys(importFormats),
            },
          ],
        });
        if (result.canceled) return null;
        source = await grant(result.filePaths[0]);
      } else source = await authorized(source);
      const format =
        importFormats[payload.format] ||
        payload.format ||
        importFormats[path.extname(source).slice(1).toLowerCase()];
      if (!Object.values(importFormats).includes(format))
        throw Error(
          "FORMAT: This import format is unsupported. Choose a supported document format; PDF import is not provided.",
        );
      const temporary = await fs.mkdtemp(
        path.join(os.tmpdir(), "inkstone-import-"),
      );
      try {
        const mediaDir = path.join(temporary, "media");
        const output = await run(
          command,
          [
            "--from",
            format,
            "--to",
            "gfm+tex_math_dollars",
            "--wrap=none",
            "--extract-media",
            mediaDir,
            source,
          ],
          { cwd: path.dirname(source) },
        );
        let text = output.stdout;
        async function embed(dir) {
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await embed(file);
            else {
              const mime = mimeTypes[path.extname(file).toLowerCase()];
              if (mime && mime.startsWith("image/")) {
                const data = `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
                const forwardPath = file.split(path.sep).join("/");
                const references = new Set([
                  file,
                  forwardPath,
                  encodeURI(file),
                  encodeURI(forwardPath),
                  pathToFileURL(file).href,
                  file.replaceAll("\\", "\\\\"),
                ]);
                // Pandoc versions emit native Windows paths, URI paths, or escaped
                // Markdown paths. Embed every form before deleting extracted media.
                // Longest first prevents matching a path inside its file: URL.
                for (const reference of [...references].sort(
                  (a, b) => b.length - a.length,
                ))
                  text = text.replaceAll(reference, data);
              }
            }
          }
        }
        if (await exists(mediaDir)) await embed(mediaDir);
        return {
          path: null,
          text,
          revision: null,
          importedFrom: source,
          warnings: output.stderr,
        };
      } finally {
        await fs.rm(temporary, { recursive: true, force: true });
      }
    }
    const format = exportFormats[payload.format];
    if (!format) throw Error("FORMAT: Unsupported Pandoc export format.");
    let target = payload.path;
    const extension =
      payload.format === "pandoc-pdf"
        ? "pdf"
        : payload.format === "latex"
          ? "tex"
          : ["revealjs", "s5", "slidy", "slideous", "dzslides"].includes(
                payload.format,
              )
            ? "html"
            : [
                  "markdown",
                  "gfm",
                  "commonmark",
                  "markdown_strict",
                  "markdown_mmd",
                ].includes(payload.format)
              ? "md"
              : payload.format;
    if (!target) {
      const result = await dialog.showSaveDialog(win, {
        title: localize("Export with Pandoc", "使用 Pandoc 导出"),
        buttonLabel: localize("Export", "导出"),
        defaultPath: `${payload.title || "Untitled"}.${extension}`,
        filters: [{ name: payload.format, extensions: [extension] }],
      });
      if (result.canceled) return null;
      target = result.filePath;
      await grant(path.dirname(target), true);
    } else target = await authorized(target);
    const targetRevision = await deps.store().revision(target);
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "inkstone-pandoc-"),
    );
    try {
      const input = path.join(tempDir, "source.md");
      const output = path.join(tempDir, `output${path.extname(target)}`);
      const diagrams = await embedExportDiagrams(
        payload.text || "",
        payload.diagramAssets,
        tempDir,
      );
      await fs.writeFile(input, diagrams.text, "utf8");
      const args = [
        "--from",
        "markdown+tex_math_dollars+yaml_metadata_block+raw_html+footnotes+superscript+subscript+task_lists",
        "--to",
        format,
        "--standalone",
        "--output",
        output,
      ];
      if (payload.documentPath) {
        const doc = await authorized(payload.documentPath);
        args.push("--resource-path", path.dirname(doc));
      }
      if (payload.template)
        args.push("--template", await authorized(payload.template));
      if (payload.referenceDoc)
        args.push("--reference-doc", await authorized(payload.referenceDoc));
      if (payload.toc) args.push("--toc");
      if (payload.numberSections) args.push("--number-sections");
      // Custom options are separate argv values; output/input and filter execution are never overridden.
      if (payload.args?.length) {
        if (
          !Array.isArray(payload.args) ||
          payload.args.some(
            (arg) =>
              !boundedString(arg, 4096) ||
              !/^--(?:metadata=|variable=|pdf-engine=|slide-level=|highlight-style=|columns=|wrap=|mathjax(?:=|$)|katex(?:=|$)|self-contained$|embed-resources$)/.test(
                arg,
              ),
          )
        )
          throw Error(
            "INVALID: Custom Pandoc arguments must be approved formatting options; filters and output overrides are not accepted.",
          );
        args.push(...payload.args);
      }
      args.push(input);
      const result = await run(command, args, {
        timeout: 120000,
        cwd: payload.documentPath
          ? path.dirname(payload.documentPath)
          : tempDir,
      });
      await writeExport(target, await fs.readFile(output), targetRevision);
      return {
        path: target,
        format,
        warnings: [
          ...diagrams.warnings,
          ...(result.stderr ? [result.stderr] : []),
        ],
        embeddedDiagrams: diagrams.count,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
  function htmlEscape(text) {
    return String(text || "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }
  async function assetData(file) {
    file = await authorized(file);
    const mime = mimeTypes[path.extname(file).toLowerCase()];
    if (!mime)
      throw Error(
        "ASSET: Only image, media, font and CSS resources can be loaded.",
      );
    const stat = await fs.stat(file);
    if (stat.size > 100 * 1024 * 1024)
      throw Error("ASSET: Resource exceeds 100 MB.");
    return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
  }
  async function sanitizeExportHTML(html, { plain = false } = {}) {
    const sandbox = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    sandbox.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    try {
      await sandbox.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'\">",
          ),
      );
      const purifier = await fs.readFile(
        path.join(__dirname, "vendor/purify.min.js"),
        "utf8",
      );
      await sandbox.webContents.executeJavaScript(purifier);
      return await sandbox.webContents.executeJavaScript(
        `(()=>{const content=document.createElement('template');content.innerHTML=DOMPurify.sanitize(${JSON.stringify(html)}, {USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},ADD_TAGS:['foreignObject','foreignobject'],HTML_INTEGRATION_POINTS:{foreignobject:true,'annotation-xml':true},ADD_ATTR:['xmlns','xmlns:xlink'],ADD_DATA_URI_TAGS:['audio','video','source'],FORBID_TAGS:['script','iframe','object','embed','form','base','meta','link'],ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto|inkstone-asset):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i});for(const image of content.content.querySelectorAll('img'))image.setAttribute('loading','eager');if(${JSON.stringify(plain)})for(const formula of content.content.querySelectorAll('.katex')){const math=formula.querySelector('math');if(math)formula.replaceWith(math.cloneNode(true));}return content.innerHTML;})()`,
      );
    } finally {
      sandbox.destroy();
    }
  }
  async function exportFile(payload, win) {
    const format = payload.format || "pdf";
    if (
      !["html", "html-plain", "pdf", "png", "jpg", "jpeg", "print"].includes(
        format,
      )
    )
      return runPandoc({ ...payload, direction: "export" }, win);
    if (typeof payload.html !== "string")
      throw Error("EXPORT: Rendered document HTML is required.");
    let target = payload.path;
    if (format !== "print") {
      if (!target) {
        const result = await dialog.showSaveDialog(win, {
          title: localize("Export", "导出"),
          buttonLabel: localize("Export", "导出"),
          defaultPath: `${payload.title || localize("Untitled", "未命名")}.${format.startsWith("html") ? "html" : ["jpg", "jpeg"].includes(format) ? "jpg" : format}`,
        });
        if (result.canceled) return null;
        target = result.filePath;
        await grant(path.dirname(target), true);
      } else target = await authorized(target);
    }
    const targetRevision = target ? await deps.store().revision(target) : null;
    const warnings = [];
    let html = await sanitizeExportHTML(payload.html, {
      plain: format === "html-plain",
    });
    // Embed local resources so exported documents remain useful after moving them.
    const references = [
      ...new Set(
        [...html.matchAll(/(?:src|poster)=["']([^"']+)["']/g)].map((m) => m[1]),
      ),
    ];
    for (const ref of references) {
      try {
        let file;
        if (ref.startsWith("inkstone-asset:"))
          file = new URL(ref.replaceAll("&amp;", "&")).searchParams.get("path");
        else if (ref.startsWith("file:")) file = fileURLToPath(ref);
        else if (
          !/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(ref) &&
          payload.documentPath
        )
          file = path.resolve(
            path.dirname(await authorized(payload.documentPath)),
            decodeURIComponent(ref),
          );
        if (file) html = html.replaceAll(ref, await assetData(file));
      } catch (e) {
        warnings.push(`Missing resource ${ref}: ${e.message}`);
      }
    }
    let css = format === "html-plain" ? "" : String(payload.css || "");
    const distDir = path.resolve(__dirname, "../dist");
    // Bundle Vite-generated font/image URLs present in the exported theme CSS.
    const cssRefs = [
      ...new Set(
        [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]),
      ),
    ];
    for (const ref of cssRefs) {
      if (/^(?:data:|https?:)/.test(ref)) continue;
      if (ref.startsWith("inkstone-asset:")) {
        try {
          css = css.replaceAll(
            ref,
            await assetData(new URL(ref).searchParams.get("path")),
          );
        } catch (error) {
          warnings.push(`Missing CSS resource ${ref}: ${error.message}`);
        }
        continue;
      }
      let file = path.resolve(
        distDir,
        ref.replace(/^\.\//, "").replace(/^\//, ""),
      );
      if (!(await exists(file))) {
        const alternate = path.resolve(
          distDir,
          "assets",
          ref.replace(/^\.\//, ""),
        );
        if (isWithin(alternate, distDir)) file = alternate;
      }
      if (isWithin(file, distDir) && (await exists(file))) {
        const mime =
          mimeTypes[path.extname(file)] || "application/octet-stream";
        css = css.replaceAll(
          ref,
          `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`,
        );
      }
    }
    const baseCSS = `body{margin:0;color:#202322;background:white;font:18px/1.7 ${String(deps.settings().fontFamily).replace(/[<>]/g, "")};}article{max-width:900px;margin:0 auto;padding:40px;}img,svg,video{max-width:100%;}pre{white-space:pre-wrap;}table{border-collapse:collapse;}td,th{border:1px solid #aaa;padding:6px;}@media print{article{max-width:none;padding:0;}h1,h2,h3,h4{break-after:avoid;}pre,blockquote,figure,tr{break-inside:avoid;}.page-break{break-before:page;}}`;
    const style =
      format === "html-plain"
        ? ""
        : `<style>${(baseCSS + css).replace(/<\/style/gi, "<\\/style")}</style>`;
    const document = `<!doctype html><html lang="${deps.settings().locale}"${payload.rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: inkstone-asset:; style-src 'unsafe-inline'; font-src data: inkstone-asset:; media-src data: https: http: inkstone-asset:; script-src 'none'"><title>${htmlEscape(payload.title || "Inkstone document")}</title>${style}</head><body><article class="markdown-body">${html}</article></body></html>`;

    if (format.startsWith("html")) {
      await writeExport(target, document, targetRevision);
      return { path: target, format, warnings };
    }
    const exportWindow = new BrowserWindow({
      show: false,
      width: Math.max(600, Math.min(2400, payload.width || 1200)),
      height: 900,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    exportWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    exportWindow.webContents.on("will-navigate", (event) =>
      event.preventDefault(),
    );
    try {
      await exportWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
      );
      const resourceStatus = await exportWindow.webContents.executeJavaScript(
        `Promise.race([Promise.all([document.fonts.ready,...[...document.images].map(i=>i.complete?Promise.resolve(i.naturalWidth>0):new Promise(r=>{i.onload=()=>r(true);i.onerror=()=>r(false)}))]).then(r=>({ready:true,missing:r.slice(1).filter(x=>!x).length})),new Promise(r=>setTimeout(()=>r({ready:false}),15000))])`,
      );
      if (!resourceStatus.ready)
        throw Error(
          "EXPORT: Images or fonts did not finish loading within 15 seconds.",
        );
      if (resourceStatus.missing)
        warnings.push(
          `${resourceStatus.missing} image(s) could not be loaded.`,
        );
      if (format === "print") {
        const marginInput =
          typeof payload.margins === "number"
            ? Object.fromEntries(
                ["top", "bottom", "left", "right"].map((key) => [
                  key,
                  payload.margins / 25.4,
                ]),
              )
            : payload.margins || {};
        const printMargins = {
          marginType: "custom",
          ...Object.fromEntries(
            ["top", "bottom", "left", "right"].map((key) => [
              key,
              Math.round(
                Math.max(0, Math.min(5, Number(marginInput[key]) || 0.5)) * 96,
              ),
            ]),
          ),
        };
        await new Promise((resolve, reject) =>
          exportWindow.webContents.print(
            {
              printBackground: true,
              silent: false,
              pageSize: [
                "A0",
                "A1",
                "A2",
                "A3",
                "A4",
                "A5",
                "A6",
                "Legal",
                "Letter",
                "Tabloid",
              ].includes(payload.pageSize)
                ? payload.pageSize
                : "A4",
              landscape: !!payload.landscape,
              margins: printMargins,
              header: String(payload.header || "").replace(/<[^>]*>/g, ""),
              footer: String(payload.footer || "").replace(/<[^>]*>/g, ""),
            },
            (success, reason) =>
              success ? resolve() : reject(Error(`PRINT: ${reason}`)),
          ),
        );
        return { format, warnings };
      }
      if (format === "pdf") {
        const pageSize = [
          "A0",
          "A1",
          "A2",
          "A3",
          "A4",
          "A5",
          "A6",
          "Legal",
          "Letter",
          "Tabloid",
          "Ledger",
        ].includes(payload.pageSize)
          ? payload.pageSize
          : "A4";
        const margins =
          typeof payload.margins === "number"
            ? Object.fromEntries(
                ["top", "bottom", "left", "right"].map((key) => [
                  key,
                  payload.margins / 25.4,
                ]),
              )
            : payload.margins || {};
        const marginValues = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
        for (const key of Object.keys(marginValues))
          if (
            Number.isFinite(margins[key]) &&
            margins[key] >= 0 &&
            margins[key] <= 5
          )
            marginValues[key] = margins[key];
        const data = await exportWindow.webContents.printToPDF({
          printBackground: true,
          pageSize,
          landscape: !!payload.landscape,
          margins: marginValues,
          preferCSSPageSize: true,
          displayHeaderFooter: !!(payload.header || payload.footer),
          headerTemplate: payload.header || "<span></span>",
          footerTemplate: payload.footer || "<span></span>",
          generateDocumentOutline: payload.bookmarks !== false,
          generateTaggedPDF: true,
          scale: Math.max(0.5, Math.min(2, payload.scale || 1)),
        });
        await writeExport(target, data, targetRevision);
      } else {
        const height = await exportWindow.webContents.executeJavaScript(
          "Math.ceil(document.documentElement.scrollHeight)",
        );
        if (height > 32760)
          throw Error(
            "EXPORT: PNG output exceeds 32,760 pixels. Split the document or export PDF.",
          );
        exportWindow.setContentSize(
          Math.max(600, Math.min(2400, payload.width || 1200)),
          Math.max(200, height),
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        const image = await exportWindow.webContents.capturePage();
        await writeExport(
          target,
          ["jpg", "jpeg"].includes(format)
            ? image.toJPEG(
                Math.max(
                  0,
                  Math.min(
                    100,
                    Number.isFinite(payload.quality) ? payload.quality : 90,
                  ),
                ),
              )
            : image.toPNG(),
          targetRevision,
        );
      }
      return { path: target, format, warnings };
    } finally {
      exportWindow.destroy();
    }
  }

  return { detectTools, runPandoc, exportFile, assetData };
}

module.exports = { createExportService };
