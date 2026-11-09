import { displayError } from "./errors.js";
import { $, $$, esc, modal, toast, promptText, ask } from "./ui.js";
import { getLocale, t as translate } from "./i18n.js";
import {
  renderMarkdown,
  hydrateDiagrams,
  exportCSS as markdownStyles,
} from "./markdown.js";
import editorCSS from "./editor.css?inline";
import katexCSS from "katex/dist/katex.min.css?inline";
import highlightCSS from "highlight.js/styles/github.css?inline";

export const exportStyles =
  markdownStyles +
  "\n.frontmatter{display:none}\n" +
  editorCSS +
  "\n" +
  katexCSS +
  "\n" +
  highlightCSS +
  "\n" +
  'body{margin:0;background:white;color:#1c1a21;font-family:"Noto Serif CJK SC","Songti SC",Georgia,serif;font-size:16px;line-height:1.8}.markdown-body{padding:32px 48px;max-width:960px;margin:auto}.markdown-body img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px 12px}h1,h2,h3,h4,h5,h6{break-after:avoid}pre,blockquote,figure,table{break-inside:avoid}a{color:#605969}.math-error,.diagram-error{color:#a33} @media print{.markdown-body{padding:0;max-width:none}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}';

export async function makeExportPayload(
  editor,
  current,
  settings,
  { diagramsAsImages = false } = {},
) {
  const container = document.createElement("article");
  container.className = "markdown-body";
  container.style.cssText =
    "position:fixed;left:-20000px;top:0;width:1000px;visibility:hidden";
  container.innerHTML = renderMarkdown(editor.getText(), {
    ...settings,
    renderTarget: "export",
    basePath: current.path,
  });
  document.body.append(container);
  try {
    const diagramSources = [...container.querySelectorAll(".diagram")].map(
      (el) => ({
        element: el,
        source: el.querySelector(".diagram-source")?.textContent || "",
        language: el.dataset.kind,
      }),
    );
    await hydrateDiagrams(container, settings);
    const errors = [
      ...container.querySelectorAll(
        ".math-error,.diagram-error,[data-render-error]",
      ),
    ].map((e) => e.textContent);
    if (errors.length)
      throw new Error(
        translate(
          "导出内容存在渲染错误：",
          "Export contains rendering errors: ",
          settings.locale || getLocale(),
        ) + errors.join("\n"),
      );
    const diagramAssets = [];
    if (diagramsAsImages)
      for (const item of diagramSources) {
        const svg = item.element.querySelector("svg");
        if (!svg) continue;
        const clone = svg.cloneNode(true),
          box = svg.viewBox.baseVal;
        const width = Math.max(
            1,
            box.width || svg.getBoundingClientRect().width,
          ),
          height = Math.max(
            1,
            box.height || svg.getBoundingClientRect().height,
          ),
          scale = Math.min(2, 2400 / width, 8000 / height);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(width));
        clone.setAttribute("height", String(height));
        const image = new Image();
        image.src =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(new XMLSerializer().serializeToString(clone));
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        diagramAssets.push({
          source: item.source,
          language: item.language,
          dataUrl: canvas.toDataURL("image/png"),
        });
      }
    return {
      html:
        '<article class="markdown-body">' + container.innerHTML + "</article>",
      css:
        exportStyles +
        "\nbody{font-family:" +
        settings.fontFamily +
        ";font-size:" +
        settings.fontSize +
        "px;line-height:" +
        settings.lineHeight +
        "}\n" +
        settings.customCSS,
      text: editor.getText(),
      diagramAssets,
      documentPath: current.path,
      title: (current.path || "Untitled")
        .split(/[\\/]/)
        .pop()
        .replace(/\.md$/i, ""),
    };
  } finally {
    container.remove();
  }
}
export function showExport({
  editor,
  current,
  settings,
  invoke,
  updateSettings,
  print = false,
}) {
  const en = (settings.locale || getLocale()) !== "zh-CN",
    t = (zh, english) => (en ? english : zh),
    options = settings.exportOptions || {};
  const formats = [
    ["pdf", "PDF"],
    ["html", t("HTML（含样式）", "HTML (styled)")],
    ["html-plain", t("HTML（无样式）", "HTML (plain)")],
    ["png", t("PNG 图片", "PNG image")],
    ["jpeg", t("JPEG 图片", "JPEG image")],
    ["docx", "Word (.docx)"],
    ["odt", "OpenDocument (.odt)"],
    ["rtf", "Rich Text (.rtf)"],
    ["epub", "EPUB"],
    ["latex", "LaTeX"],
    ["mediawiki", "MediaWiki"],
    ["dokuwiki", "DokuWiki"],
    ["rst", "reStructuredText"],
    ["textile", "Textile"],
    ["org", "Org-mode"],
    ["opml", "OPML"],
    ["pptx", "PowerPoint"],
    ["revealjs", "Reveal.js"],
    ["beamer", "Beamer"],
    ["asciidoc", "AsciiDoc"],
    ["json", "Pandoc JSON"],
    ["gfm", "GFM Markdown"],
    ["commonmark", "CommonMark"],
    ["markdown", "Pandoc Markdown"],
    ["markdown_strict", "Strict Markdown"],
    ["markdown_mmd", "MultiMarkdown"],
    ["pandoc-pdf", t("PDF（Pandoc + TeX）", "PDF (Pandoc + TeX)")],
  ];
  const d = modal(
    print ? t("打印", "Print") : t("导出文档", "Export document"),
    '<form id="export-form" novalidate autocomplete="off"><div class="export-scroll">' +
      (print
        ? ""
        : '<div class="export-format-tiles" role="group" aria-label="' +
          t("常用格式", "Common formats") +
          '">' +
          [
            ["pdf", "PDF", t("排版好的页面", "Paged document")],
            ["html", "HTML", t("网页", "Web page")],
            ["docx", "Word", t("需要 Pandoc", "Needs Pandoc")],
            ["png", t("图片", "Image"), "PNG"],
          ]
            .map(
              ([value, label, hint]) =>
                '<button type="button" data-format-tile="' +
                value +
                '" aria-pressed="false"><strong>' +
                label +
                "</strong><small>" +
                hint +
                "</small></button>",
            )
            .join("") +
          "</div>") +
      '<div class="export-grid">' +
      '<label class="full">' +
      (print ? t("格式", "Format") : t("全部格式", "All formats")) +
      '<select name="format">' +
      (print
        ? '<option value="print">' + t("打印", "Print") + "</option>"
        : formats
            .map(([v, l]) => '<option value="' + v + '">' + l + "</option>")
            .join("")) +
      "</select></label>" +
      "<label>" +
      t("纸张", "Paper") +
      '<select name="pageSize">' +
      ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"]
        .map(
          (v) =>
            "<option " +
            (options.pageSize === v ? "selected" : "") +
            ">" +
            v +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      "<label>" +
      t("页边距（毫米）", "Margins (mm)") +
      '<input type="number" name="margins" min="0" max="100" required value="' +
      (options.margins ?? 18) +
      '"></label>' +
      "<label>" +
      t("横向页面", "Landscape") +
      '<input type="checkbox" name="landscape" ' +
      (options.landscape ? "checked" : "") +
      "></label>" +
      "<label>" +
      t("PDF 书签", "PDF bookmarks") +
      '<input type="checkbox" name="bookmarks" ' +
      (options.bookmarks !== false ? "checked" : "") +
      "></label>" +
      "<label>" +
      t("导出外观", "Export appearance") +
      '<select name="appearance"><option value="light">' +
      t("浅色", "Light") +
      '</option><option value="current">' +
      t("当前主题", "Current theme") +
      "</option></select></label><label>" +
      t("Pandoc 标题编号", "Pandoc heading numbers") +
      '<input type="checkbox" name="numberSections"></label>' +
      "<label>" +
      t("图片宽度（px）", "Image width (px)") +
      '<input type="number" name="width" min="600" max="2400" required value="1200"></label><label>' +
      t("Pandoc 自动目录", "Pandoc table of contents") +
      '<input type="checkbox" name="toc"></label>' +
      "<label>" +
      t("JPEG 质量（0–100）", "JPEG quality (0–100)") +
      '<input name="quality" type="number" min="0" max="100" required value="90"></label><label>' +
      t("导出后", "After export") +
      '<select name="afterExport"><option value="none">' +
      t("仅显示结果", "Show result") +
      '</option><option value="folder">' +
      t("打开所在文件夹", "Reveal in folder") +
      '</option><option value="open">' +
      t("打开导出文件", "Open exported file") +
      "</option></select></label>" +
      '<label class="full">' +
      t(
        "Pandoc 额外参数（JSON 字符串数组）",
        "Pandoc extra arguments (JSON string array)",
      ) +
      '<textarea name="args" rows="2" spellcheck="false">[]</textarea></label></div>' +
      // Rarely changed options stay available without crowding the form.
      '<details class="export-advanced"' +
      (options.header || options.footer ? " open" : "") +
      "><summary>" +
      t(
        "高级：页眉页脚、Pandoc 模板",
        "Advanced: header, footer and Pandoc templates",
      ) +
      '</summary><div class="export-grid">' +
      '<label class="full">' +
      t(
        "页眉（PDF 支持 HTML，直接打印为纯文本）",
        "Header (PDF supports HTML; print uses plain text)",
      ) +
      '<input name="header" value="' +
      esc(options.header || "") +
      '"></label>' +
      '<label class="full">' +
      t(
        "页脚 HTML · pageNumber / totalPages 占位类",
        "Footer HTML · pageNumber / totalPages classes",
      ) +
      '<input name="footer" value="' +
      esc(options.footer || "") +
      '" placeholder="&lt;span class=&quot;pageNumber&quot;&gt;&lt;/span&gt;"></label>' +
      '<label class="full">' +
      t(
        "Pandoc 模板或参考文档（可选）",
        "Pandoc template or reference document (optional)",
      ) +
      '<div><button type="button" id="pick-template">' +
      t("选择模板", "Choose template") +
      '</button> <button type="button" id="pick-reference">' +
      t("选择参考 DOCX / ODT / PPTX", "Choose reference DOCX / ODT / PPTX") +
      '</button></div><small id="template-state"></small></label></div></details>' +
      '<div class="export-profiles"><label>' +
      t("导出预设", "Export preset") +
      '<select name="profile"><option value="">' +
      t("自定义导出预设…", "Custom export preset…") +
      "</option>" +
      (settings.exportProfiles || [])
        .map((p, i) => '<option value="' + i + '">' + esc(p.name) + "</option>")
        .join("") +
      '</select></label><button type="button" id="save-export-profile">' +
      t("保存预设", "Save preset") +
      '</button><button type="button" id="delete-export-profile">' +
      t("删除预设", "Delete preset") +
      "</button></div>" +
      '<p class="muted">' +
      t(
        "PDF、HTML、PNG 直接离线导出。其他格式需要 Pandoc；演示格式的资源需求由对应工具决定。文档图片、公式和图表在原生导出中嵌入。",
        "PDF, HTML, and PNG export offline. Other formats require Pandoc. Native exports embed document images, math, and diagrams.",
      ) +
      "</p></div>" +
      '<footer class="export-footer"><div class="export-status" role="status" aria-live="polite"></div><button type="button" id="close-export">' +
      t("关闭", "Close") +
      '</button><button type="submit" class="primary">' +
      (print
        ? t("打开打印对话框", "Open print dialog")
        : t("导出…", "Export…")) +
      "</button></footer></form>",
    { wide: true },
  );
  d.el.classList.add("export-dialog");
  const form = $("form", d.el),
    status = $(".export-status", d.el);
  $("#close-export", d.el).onclick = d.close;
  const showFields = () => {
    const format = form.format.value;
    const native = [
      "pdf",
      "print",
      "html",
      "html-plain",
      "png",
      "jpeg",
    ].includes(format);
    const visible = {
      pageSize: ["pdf", "print"].includes(format),
      margins: ["pdf", "print"].includes(format),
      landscape: ["pdf", "print"].includes(format),
      bookmarks: format === "pdf",
      header: ["pdf", "print"].includes(format),
      footer: format === "pdf",
      width: ["png", "jpeg"].includes(format),
      quality: format === "jpeg",
      toc: !native,
      numberSections: !native,
      args: !native,
      appearance: native && format !== "html-plain",
      afterExport: format !== "print",
    };
    for (const [name, shown] of Object.entries(visible))
      form.elements
        .namedItem(name)
        ?.closest("label")
        ?.toggleAttribute("hidden", !shown);
    $("#pick-template", d.el).closest("label").hidden = native;
    $("#delete-export-profile", d.el).disabled = form.profile.value === "";
    // Hide the advanced section when none of its fields apply to this format.
    const advanced = $(".export-advanced", d.el);
    advanced.hidden = !$$("label", advanced).some((label) => !label.hidden);
    for (const tile of $$("[data-format-tile]", d.el))
      tile.setAttribute(
        "aria-pressed",
        String(tile.dataset.formatTile === format),
      );
  };
  form.format.onchange = showFields;
  for (const tile of $$("[data-format-tile]", d.el))
    tile.onclick = () => {
      form.format.value = tile.dataset.formatTile;
      form.format.dispatchEvent(new Event("change", { bubbles: true }));
    };
  showFields();
  let template, referenceDoc;
  const pick = async (reference) => {
    try {
      const path = await invoke("pickPath", {
        title: reference
          ? t("参考文档", "Reference document")
          : t("Pandoc模板", "Pandoc template"),
      });
      if (reference) referenceDoc = path;
      else template = path;
      $("#template-state", d.el).textContent = [template, referenceDoc]
        .filter(Boolean)
        .join(" / ");
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#pick-template", d.el).onclick = () => pick(false);
  $("#pick-reference", d.el).onclick = () => pick(true);
  const readProfile = () =>
    Object.fromEntries(
      [...form.elements]
        .filter((e) => e.name && e.name !== "profile")
        .map((e) => [e.name, e.type === "checkbox" ? e.checked : e.value]),
    );
  form.profile.onchange = () => {
    const p = settings.exportProfiles?.[+form.profile.value];
    if (form.profile.value === "" || !p) {
      showFields();
      return;
    }
    for (const [key, value] of Object.entries(p.options || {})) {
      const e = form.elements.namedItem(key);
      if (!e) continue;
      if (e.type === "checkbox") e.checked = value;
      else e.value = value;
    }
    showFields();
    template = p.template;
    referenceDoc = p.referenceDoc;
    $("#template-state", d.el).textContent = [template, referenceDoc]
      .filter(Boolean)
      .join(" / ");
  };
  const refreshProfiles = () => {
    form.profile.innerHTML =
      '<option value="">' +
      t("自定义导出预设…", "Custom export preset…") +
      "</option>" +
      (settings.exportProfiles || [])
        .map((p, i) => '<option value="' + i + '">' + esc(p.name) + "</option>")
        .join("");
  };
  $("#save-export-profile", d.el).onclick = async () => {
    try {
      const name = await promptText(
        t("保存导出预设", "Save export preset"),
        t("名称", "Name"),
      );
      if (!name) return;
      const profiles = [
        ...(settings.exportProfiles || []).filter((p) => p.name !== name),
        { name, options: readProfile(), template, referenceDoc },
      ];
      await updateSettings({ exportProfiles: profiles });
      settings.exportProfiles = profiles;
      refreshProfiles();
      form.profile.value = profiles.length - 1;
      showFields();
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#delete-export-profile", d.el).onclick = async () => {
    try {
      if (form.profile.value === "") return;
      const profiles = settings.exportProfiles.filter(
        (_, i) => i !== +form.profile.value,
      );
      await updateSettings({ exportProfiles: profiles });
      settings.exportProfiles = profiles;
      refreshProfiles();
      showFields();
    } catch (e) {
      toast(e.message, true);
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = $("button[type=submit]", form);
    if (button.disabled) return;
    for (const field of form.querySelectorAll("input, select, textarea")) {
      field.removeAttribute("aria-invalid");
      if (field.closest("[hidden]") || field.checkValidity()) continue;
      field.setAttribute("aria-invalid", "true");
      field.reportValidity();
      field.focus();
      return;
    }
    const controls = [...form.elements].map((control) => [
      control,
      control.disabled,
    ]);
    controls.forEach(([control]) => {
      control.disabled = true;
    });
    d.setBusy(true);
    status.textContent = t(
      "正在渲染并准备导出…",
      "Rendering and preparing export…",
    );
    try {
      const args = [
        "pdf",
        "print",
        "html",
        "html-plain",
        "png",
        "jpeg",
      ].includes(form.format.value)
        ? []
        : JSON.parse(form.args.value);
      if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
        throw Error(t("请输入JSON字符串数组", "Enter a JSON array of strings"));
      const opts = {
        pageSize: form.pageSize.value,
        margins: +form.margins.value,
        landscape: form.landscape.checked,
        bookmarks: form.bookmarks.checked,
        header: form.header.value,
        footer: form.footer.value,
      };
      await updateSettings({ exportOptions: opts });
      const payload = await makeExportPayload(editor, current, settings, {
          diagramsAsImages: ![
            "pdf",
            "html",
            "html-plain",
            "png",
            "jpeg",
            "print",
          ].includes(form.format.value),
        }),
        margin = opts.margins / 25.4;
      if (
        form.appearance.value === "current" &&
        document.documentElement.dataset.theme === "dark"
      )
        payload.css +=
          "\nbody,.markdown-body{background:#1c1a21!important;color:#f4f0e6!important}.markdown-body th,.markdown-body pre,.hljs{background:#302b36!important;color:#f4f0e6!important}.markdown-body td,.markdown-body th{border-color:#76717d!important}";
      const result = await invoke("exportFile", {
        ...payload,
        ...opts,
        margins: { top: margin, right: margin, bottom: margin, left: margin },
        format: form.format.value,
        width: +form.width.value,
        quality: +form.quality.value,
        template,
        referenceDoc,
        toc: form.toc.checked,
        args,
        numberSections: form.numberSections.checked,
      });
      if (result?.path) {
        lastExport = {
          documentPath: current.path,
          resultPath: result.path,
          options: {
            ...opts,
            format: form.format.value,
            width: +form.width.value,
            quality: +form.quality.value,
            template,
            referenceDoc,
            toc: form.toc.checked,
            args,
            numberSections: form.numberSections.checked,
            appearance: form.appearance.value,
          },
        };
        if (form.afterExport.value === "folder")
          await invoke("showInFolder", { path: result.path });
        if (form.afterExport.value === "open")
          await invoke("openExport", { path: result.path });
      }
      status.textContent = result
        ? t("导出完成：", "Exported: ") +
          (result.path || t("已发送到打印机", "Sent to printer")) +
          (result.warnings?.length
            ? "\n" +
              (Array.isArray(result.warnings)
                ? result.warnings.join("\n")
                : result.warnings)
            : "")
        : t("已取消", "Cancelled");
    } catch (e) {
      status.textContent = displayError(e);
      toast(e.message, true);
    } finally {
      controls.forEach(([control, disabled]) => {
        control.disabled = disabled;
      });
      d.setBusy(false);
    }
  };
  return d;
}

let lastExport;
export async function repeatExport({
  editor,
  current,
  settings,
  invoke,
  updateSettings,
}) {
  if (!lastExport || lastExport.documentPath !== current.path)
    return showExport({ editor, current, settings, invoke, updateSettings });
  const en = (settings.locale || getLocale()) !== "zh-CN";
  const choice = await ask(
    en ? "Repeat export" : "重复上次导出",
    lastExport.resultPath,
    [
      { label: en ? "Replace this export" : "覆盖此导出文件", value: true },
      { label: en ? "Cancel" : "取消", value: false },
    ],
  );
  if (!choice) return;
  const opts = lastExport.options,
    payload = await makeExportPayload(editor, current, settings, {
      diagramsAsImages: ![
        "pdf",
        "html",
        "html-plain",
        "png",
        "jpeg",
        "print",
      ].includes(opts.format),
    }),
    margin = opts.margins / 25.4;
  if (
    opts.appearance === "current" &&
    document.documentElement.dataset.theme === "dark"
  )
    payload.css +=
      "\nbody,.markdown-body{background:#1c1a21!important;color:#f4f0e6!important}";
  const result = await invoke("exportFile", {
    ...payload,
    ...opts,
    path: lastExport.resultPath,
    margins: { top: margin, right: margin, bottom: margin, left: margin },
  });
  toast((en ? "Exported: " : "已导出：") + result.path);
}
