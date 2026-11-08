import { locateTable, serializeTable, escapeTableCell } from "./tables.js";
import { $, $$, esc, modal, toast } from "./ui.js";
import { getLocale, t as translate } from "./i18n.js";

export function editTable(editor, locale = getLocale()) {
  const t = (zh, en) => translate(zh, en, locale);
  const original = editor.view.state.doc.toString(),
    table = locateTable(original, editor.view.state.selection.main.head);
  if (!table)
    throw new Error(
      t(
        "请把光标放到表格中再打开表格编辑器。",
        "Place the cursor inside a table first.",
      ),
    );
  const rows = table.rows.filter((_, i) => i !== 1).map((r) => [...r]),
    alignments = [...table.rows[1]];
  let row = Math.max(0, table.row > 1 ? table.row - 1 : 0),
    column = table.col;
  const actions = [
    ["rowAdd", "插入", "Insert", "插入行", "Insert row"],
    ["rowDelete", "删除", "Delete", "删除行", "Delete row"],
    ["colAdd", "插入", "Insert", "插入列", "Insert column"],
    ["colDelete", "删除", "Delete", "删除列", "Delete column"],
    ["rowUp", "上移", "Up", "上移行", "Move row up"],
    ["rowDown", "下移", "Down", "下移行", "Move row down"],
    ["colLeft", "左移", "Left", "左移列", "Move column left"],
    ["colRight", "右移", "Right", "右移列", "Move column right"],
    ["left", "左对齐", "Left"],
    ["center", "居中", "Center"],
    ["right", "右对齐", "Right"],
  ];
  const d = modal(
    t("编辑表格", "Edit table"),
    '<div class="table-actions">' +
      [
        [t("行", "Rows"), actions.filter(([id]) => id.startsWith("row"))],
        [t("列", "Columns"), actions.filter(([id]) => id.startsWith("col"))],
        [
          t("对齐", "Alignment"),
          actions.filter(([id]) => ["left", "center", "right"].includes(id)),
        ],
      ]
        .map(
          ([label, group]) =>
            '<div class="table-action-group" role="group" aria-label="' +
            label +
            '"><span class="table-group-label">' +
            label +
            "</span>" +
            group
              .map(
                ([id, zh, en, accessibleZh = zh, accessibleEn = en]) =>
                  '<button type="button" data-op="' +
                  id +
                  '" aria-label="' +
                  t(accessibleZh, accessibleEn) +
                  '">' +
                  t(zh, en) +
                  "</button>",
              )
              .join("") +
            "</div>",
        )
        .join("") +
      '</div><p class="muted">' +
      t(
        "第一行为表头。Tab 切换单元格；Alt + 方向键移动；Ctrl + Enter 应用。支持从电子表格粘贴。",
        "The first row is the header. Tab moves between cells; Alt + arrows to navigate; Ctrl + Enter to apply. Paste directly from spreadsheets.",
      ) +
      '</p><div class="table-grid"></div><footer><span id="table-position" class="muted" role="status" aria-live="polite"></span><button id="table-cancel">' +
      t("取消", "Cancel") +
      '</button><button class="primary" id="table-apply">' +
      t("应用更改", "Apply changes") +
      "</button></footer>",
    { wide: true },
  );
  d.el.classList.add("table-dialog");
  function updateActions() {
    const width = rows[0].length;
    const disabled = {
      rowAdd: rows.length >= 1000,
      rowDelete: row === 0 || rows.length <= 2,
      colAdd: width >= 100,
      colDelete: width <= 1,
      rowUp: row <= 1,
      rowDown: row === 0 || row >= rows.length - 1,
      colLeft: column === 0,
      colRight: column >= width - 1,
    };
    $$("[data-op]", d.el).forEach((button) => {
      button.disabled = Boolean(disabled[button.dataset.op]);
      if (["left", "center", "right"].includes(button.dataset.op)) {
        const alignment =
          alignments[column] === ":---:"
            ? "center"
            : alignments[column] === "---:"
              ? "right"
              : "left";
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.op === alignment),
        );
      }
    });
    $("#table-position", d.el).textContent = t(
      `第 ${row + 1} 行，第 ${column + 1} 列 · ${rows.length} 行 × ${width} 列`,
      `Row ${row + 1}, column ${column + 1} · ${rows.length} rows × ${width} columns`,
    );
  }
  function focusCell() {
    const cell = $('[data-row="' + row + '"][data-col="' + column + '"]', d.el);
    cell?.focus();
    cell?.select();
  }
  function draw() {
    $(".table-grid", d.el).innerHTML =
      "<table><tbody>" +
      rows
        .map(
          (cells, r) =>
            "<tr>" +
            cells
              .map(
                (cell, c) =>
                  "<" +
                  (r === 0 ? "th" : "td") +
                  '><input aria-label="' +
                  t("行", "Row") +
                  " " +
                  (r + 1) +
                  " " +
                  t("列", "column") +
                  " " +
                  (c + 1) +
                  '" autocomplete="off" data-row="' +
                  r +
                  '" data-col="' +
                  c +
                  '" value="' +
                  esc(cell) +
                  '" style="text-align:' +
                  (alignments[c] === ":---:"
                    ? "center"
                    : alignments[c] === "---:"
                      ? "right"
                      : "left") +
                  '"></' +
                  (r === 0 ? "th" : "td") +
                  ">",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table>";
    $$("input", d.el).forEach((input) => {
      input.onfocus = () => {
        row = +input.dataset.row;
        column = +input.dataset.col;
        updateActions();
      };
      input.oninput = () =>
        (rows[+input.dataset.row][+input.dataset.col] = input.value);
      input.onkeydown = (e) => {
        if (e.isComposing) return;
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          $("#table-apply", d.el).click();
          return;
        }
        if (e.key === "Tab") {
          // Let Shift+Tab leave the first cell and return to the toolbar.
          if (e.shiftKey && row === 0 && column === 0) return;
          // Ctrl+Tab moves out of the grid without inserting a new row.
          if (e.ctrlKey) {
            e.preventDefault();
            $("#table-cancel", d.el).focus();
            return;
          }
          e.preventDefault();
          const width = rows[0].length;
          let next = row * width + column + (e.shiftKey ? -1 : 1);
          if (next < 0) next = 0;
          if (next >= rows.length * width) {
            if (rows.length >= 1000) {
              toast(
                t("表格最多支持1000行", "Tables are limited to 1,000 rows"),
                true,
              );
              return;
            }
            rows.push(Array(width).fill(""));
            draw();
          }
          row = Math.floor(next / width);
          column = next % width;
          focusCell();
        }
        if (
          e.altKey &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          row = Math.max(
            0,
            Math.min(
              rows.length - 1,
              row + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0),
            ),
          );
          column = Math.max(
            0,
            Math.min(
              rows[0].length - 1,
              column +
                (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0),
            ),
          );
          focusCell();
        }
      };
      input.onpaste = (e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!text.includes("\t") && !text.includes("\n")) return;
        e.preventDefault();
        const data = text
          .replace(/\r\n/g, "\n")
          .replace(/\n$/, "")
          .split("\n")
          .map((line) => line.split("\t"));
        const width = Math.max(
          rows[0].length,
          column + Math.max(...data.map((r) => r.length)),
        );
        if (width > 100 || row + data.length > 1000) {
          toast(
            t(
              "表格粘贴上限为 100 列、1000 行",
              "Table paste is limited to 100 columns and 1000 rows",
            ),
            true,
          );
          return;
        }
        rows.forEach((r) => {
          while (r.length < width) r.push("");
        });
        while (alignments.length < width) alignments.push("---");
        while (rows.length < row + data.length)
          rows.push(Array(width).fill(""));
        data.forEach((r, ri) =>
          r.forEach((value, ci) => (rows[row + ri][column + ci] = value)),
        );
        draw();
        focusCell();
      };
    });
  }
  $$("[data-op]", d.el).forEach(
    (button) =>
      (button.onclick = () => {
        const op = button.dataset.op,
          w = rows[0].length;
        if (op === "rowAdd") {
          rows.splice(row + 1, 0, Array(w).fill(""));
          row++;
        }
        if (op === "rowDelete" && row > 0 && rows.length > 2) {
          rows.splice(row, 1);
          row = Math.min(row, rows.length - 1);
        }
        if (op === "colAdd") {
          rows.forEach((r) => r.splice(column + 1, 0, ""));
          alignments.splice(column + 1, 0, "---");
          column++;
        }
        if (op === "colDelete" && w > 1) {
          rows.forEach((r) => r.splice(column, 1));
          alignments.splice(column, 1);
          column = Math.min(column, w - 2);
        }
        if (op === "rowUp" && row > 1) {
          [rows[row - 1], rows[row]] = [rows[row], rows[row - 1]];
          row--;
        }
        if (op === "rowDown" && row > 0 && row < rows.length - 1) {
          [rows[row + 1], rows[row]] = [rows[row], rows[row + 1]];
          row++;
        }
        const destination = column + (op === "colLeft" ? -1 : 1);
        if (
          ["colLeft", "colRight"].includes(op) &&
          destination >= 0 &&
          destination < w
        ) {
          [...rows, alignments].forEach((r) => {
            [r[column], r[destination]] = [r[destination], r[column]];
          });
          column = destination;
        }
        if (["left", "center", "right"].includes(op))
          alignments[column] =
            op === "center" ? ":---:" : op === "right" ? "---:" : ":---";
        draw();
        focusCell();
      }),
  );
  $("#table-cancel", d.el).onclick = d.close;
  $("#table-apply", d.el).onclick = () => {
    if (editor.view.state.readOnly) {
      toast(
        t(
          "文档当前为只读或正在关闭。请取消后重试。",
          "This document is read-only or closing. Cancel and try again.",
        ),
        true,
      );
      return;
    }
    if (editor.view.state.doc.toString() !== original) {
      toast(
        t(
          "文档在表格编辑期间发生变化。请取消后重新打开表格。",
          "The document changed while this table was open. Cancel and reopen the table.",
        ),
        true,
      );
      return;
    }
    const escaped = rows.map((r) => r.map((cell) => escapeTableCell(cell)));
    const insert = serializeTable([
      escaped[0],
      alignments,
      ...escaped.slice(1),
    ]);
    editor.view.dispatch({
      changes: { from: table.from, to: table.to, insert },
      selection: { anchor: table.from },
    });
    d.close();
    editor.focus();
  };
  draw();
  updateActions();
  focusCell();
  return d;
}
