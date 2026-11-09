import { displayError } from "./errors.js";
import { $, $$, esc, modal, toast, promptText, ask } from "./ui.js";
import { getLocale, t as translate } from "./i18n.js";
import { readDocumentConfig } from "./document-config.js";

/** Resource updates are prepared first; commit only against the unchanged document snapshot. */
export async function manageResources({
  invoke,
  snapshot,
  commit,
  locale = getLocale(),
}) {
  const t = (zh, en) => translate(zh, en, locale);
  const original = snapshot();
  const config = readDocumentConfig(original.text);
  const data = await invoke("listImageReferences", {
    documentPath: original.path,
    text: original.text,
    imageRoot: config.imageRoot,
  });
  const references = data.references;
  const d = modal(
    t("图片资源管理", "Image resources"),
    '<p class="muted">' +
      t(
        "选择文档引用的图片。操作会保存当前文档；移动和删除的原图进入系统回收站。",
        "Select referenced images. Operations save this document; moved and deleted originals go to system trash.",
      ) +
      "</p>" +
      '<div class="resource-summary"><label><input type="checkbox" id="resource-select-all">' +
      t("全选", "Select all") +
      '</label><span id="resource-selection-count" role="status"></span></div><div class="resource-list">' +
      (references.length
        ? ""
        : '<p class="empty-state">' +
          t(
            "这篇文档没有图片引用。",
            "This document has no image references.",
          ) +
          "</p>") +
      references
        .map(
          (ref, i) =>
            '<label><input type="checkbox" data-resource="' +
            i +
            '"><span class="resource-source" title="' +
            esc(ref.source || ref.url || ref.path) +
            '">' +
            esc(ref.source || ref.url || ref.path) +
            "</span><small>" +
            (ref.remote ? t("网络", "Remote") : t("本地", "Local")) +
            '<span class="resource-uses">' +
            t(
              `${ref.occurrences.length} 处引用`,
              `${ref.occurrences.length} ${ref.occurrences.length === 1 ? "reference" : "references"}`,
            ) +
            "</span>" +
            "</small></label>",
        )
        .join("") +
      "</div>" +
      '<p class="muted" id="resource-status" role="status" aria-live="polite">' +
      esc((data.warnings || []).join("\n")) +
      '</p><footer><select id="resource-operation" aria-label="' +
      t("资源操作", "Resource operation") +
      '">' +
      [
        ["copy", t("复制到资源目录", "Copy to asset folder")],
        ["move", t("移动到文件夹…", "Move to folder…")],
        ["rename", t("重命名单图…", "Rename one image…")],
        ["download", t("下载网络图片", "Download remote images")],
        ["unlink", t("仅删除引用", "Remove references only")],
        [
          "delete",
          t("删除引用和原图", "Remove references and trash originals"),
        ],
      ]
        .map(([v, label]) => '<option value="' + v + '">' + label + "</option>")
        .join("") +
      '</select><button type="button" id="resource-cancel">' +
      t("取消", "Cancel") +
      '</button><button class="primary" id="resource-apply">' +
      t("执行并保存文档", "Apply and save document") +
      "</button></footer>",
    { wide: true },
  );
  d.el.classList.add("resources-dialog");
  $("#resource-cancel", d.el).onclick = d.close;
  const updateSelection = () => {
    const count = $$("[data-resource]:checked", d.el).length;
    $("#resource-selection-count", d.el).textContent = t(
      `已选择 ${count} / ${references.length}`,
      `${count} of ${references.length} selected`,
    );
    const all = $("#resource-select-all", d.el);
    all.checked = count > 0 && count === references.length;
    all.indeterminate = count > 0 && count < references.length;
    all.disabled = references.length === 0;
    $("#resource-apply", d.el).disabled = count === 0;
  };
  $("#resource-select-all", d.el).onchange = (event) => {
    $$("[data-resource]", d.el).forEach((input) => {
      input.checked = event.target.checked;
    });
    updateSelection();
  };
  $$("[data-resource]", d.el).forEach((input) => {
    input.onchange = updateSelection;
  });
  updateSelection();
  let pendingId = null,
    committing = false,
    operationRunning = false;
  d.el.addEventListener("close", () => {
    if (pendingId && !committing)
      invoke("cancelImageOperation", { id: pendingId }).catch(() => {});
  });
  $("#resource-apply", d.el).onclick = async () => {
    if (operationRunning) return;
    operationRunning = true;
    let controlStates = [];
    const button = $("#resource-apply", d.el),
      status = $("#resource-status", d.el);
    try {
      const selected = $$("[data-resource]:checked", d.el).map(
        (el) => references[Number(el.dataset.resource)],
      );
      if (!selected.length)
        throw Error(t("请选择图片", "Select at least one image"));
      const operation = $("#resource-operation", d.el).value;
      const now = snapshot();
      if (
        now.generation !== original.generation ||
        now.text !== original.text ||
        now.revision !== original.revision
      )
        throw Error(
          t(
            "文档已变化，请关闭后重新打开资源管理。",
            "The document changed. Close and reopen resource management.",
          ),
        );
      const items = selected.map((ref) => ({ id: ref.id }));
      let targetFolder;
      if (operation === "rename") {
        if (selected.length !== 1 || selected[0].remote)
          throw Error(
            t("重命名需要选择一张本地图片", "Select one local image to rename"),
          );
        const path = selected[0].path;
        const name = await promptText(
          t("图片重命名", "Rename image"),
          t("新文件名", "New filename"),
          path.split(/[\\/]/).pop(),
        );
        if (!name) return;
        if (/[\\/\x00]/.test(name) || name === "." || name === "..")
          throw Error(t("无效文件名", "Invalid filename"));
        items[0].target = path.replace(/[\\/][^\\/]+$/, "/") + name;
      }
      if (operation === "move") {
        targetFolder = await invoke("chooseFolder");
        if (!targetFolder) return;
      }
      if (
        ["delete", "move"].includes(operation) &&
        !(await ask(
          t("确认资源操作", "Confirm resource operation"),
          t(
            "其他文档可能仍引用这些原图。继续后，本文件引用会更新并保存。",
            "Other documents may still reference the original files. This document will be updated and saved.",
          ),
          [
            { label: t("继续", "Continue"), value: true },
            { label: t("取消", "Cancel"), value: false },
          ],
        ))
      )
        return;
      button.disabled = true;
      controlStates = $$("input, select", d.el).map((control) => [
        control,
        control.disabled,
      ]);
      controlStates.forEach(([control]) => {
        control.disabled = true;
      });
      status.textContent = t("正在准备资源…", "Preparing resources…");
      const prepared = await invoke("prepareImageOperation", {
        documentPath: original.path,
        text: original.text,
        revision: original.revision,
        encoding: original.encoding,
        imageRoot: config.imageRoot,
        imageFolder: config.imageFolder,
        operation,
        items,
        targetFolder,
      });
      pendingId = prepared.id;
      const latest = snapshot();
      if (
        !d.el.isConnected ||
        latest.generation !== original.generation ||
        latest.text !== original.text ||
        latest.revision !== original.revision
      ) {
        await invoke("cancelImageOperation", { id: pendingId });
        pendingId = null;
        if (!d.el.isConnected) return;
        throw Error(
          t(
            "准备期间文档已变化或操作已取消，没有提交任何改动。",
            "The document changed or the dialog closed. No changes were committed.",
          ),
        );
      }
      committing = true;
      d.setBusy(true);
      const result = await commit(prepared, original);
      pendingId = null;
      d.setBusy(false);
      d.close();
      toast(
        result?.warnings?.length
          ? result.warnings.join("\n")
          : t("资源和文档已保存", "Resources and document saved"),
        !!result?.warnings?.length,
      );
    } catch (error) {
      if (pendingId && !committing)
        await invoke("cancelImageOperation", { id: pendingId }).catch(() => {});
      pendingId = null;
      status.textContent = displayError(error);
      toast(error.message, true);
    } finally {
      committing = false;
      operationRunning = false;
      controlStates.forEach(([control, disabled]) => {
        control.disabled = disabled;
      });
      d.setBusy(false);
      updateSelection();
    }
  };
}
