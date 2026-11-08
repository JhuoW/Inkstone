import { undo, redo, isolateHistory } from "@codemirror/commands";
import { tableCellRanges, modifyTable, escapeTableCell } from "./tables.js";
import { t, getLocale } from "./i18n.js";

const controllers = new WeakMap();
const editorCommands = new WeakMap();
export function bindTableCommands(view, command) {
  if (command) editorCommands.set(view, command);
  else editorCommands.delete(view);
}
function minimumChange(before, after) {
  let from = 0,
    endBefore = before.length,
    endAfter = after.length;
  while (from < endBefore && from < endAfter && before[from] === after[from])
    from++;
  while (
    endBefore > from &&
    endAfter > from &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  return { from, to: endBefore, insert: after.slice(from, endAfter) };
}

/** The textarea owns only a cell's temporary selection/IME. CodeMirror owns every text edit and undo. */
export function installTableEditor(element, view, block, options, render) {
  let currentBlock = block,
    currentOptions = options,
    active = null,
    committing = false,
    disposed = false,
    generation = 0;
  function cells() {
    return tableCellRanges(currentBlock.text);
  }
  function currentCell() {
    return (
      active && {
        from: active.from,
        to: active.from + active.value.length,
        text: active.value,
      }
    );
  }
  function absoluteFrom() {
    return view.posAtDOM(element);
  }
  function draw() {
    element.innerHTML = render(currentBlock, currentOptions);
  }
  function commit(userEvent = "input.type") {
    if (!active || active.composing || view.state.readOnly) return;
    const cell = currentCell();
    if (!cell) return;
    const input = active.input;
    const beforeEscaping = input.value;
    const value = escapeTableCell(beforeEscaping);
    let start = input.selectionStart,
      end = input.selectionEnd;
    if (value !== input.value) {
      const map = (position) =>
        escapeTableCell(beforeEscaping.slice(0, position)).length;
      start = map(start);
      end = map(end);
      input.value = value;
      input.setSelectionRange(start, end);
    }
    const change = minimumChange(cell.text, value);
    const from = absoluteFrom() + cell.from;
    active.value = value;
    committing = true;
    try {
      view.dispatch({
        changes:
          change.from === change.to && !change.insert
            ? undefined
            : {
                from: from + change.from,
                to: from + change.to,
                insert: change.insert,
              },
        selection: { anchor: from + start, head: from + end },
        userEvent,
      });
    } finally {
      committing = false;
    }
    input.style.height = "0px";
    input.style.height = Math.max(26, input.scrollHeight) + "px";
  }
  function stop({ focusEditor = false } = {}) {
    if (!active) return;
    commit();
    generation++;
    active = null;
    draw();
    if (focusEditor) view.focus();
  }
  function activate(row, col, selection, dispatch = true) {
    if (view.state.readOnly || currentOptions.readOnly) return false;
    generation++;
    const data = cells(),
      cell = data[row]?.[col];
    if (!cell || row === 1) return false;
    if (active && active.row === row && active.col === col) {
      active.input.focus();
      return true;
    }
    if (active) {
      commit();
      active = null;
      draw();
    }
    const displayRow = row === 0 ? 0 : row - 1;
    const td = element.querySelectorAll("tr")[displayRow]?.children[col];
    if (!td) return false;
    const input = document.createElement("textarea");
    input.className = "inkstone-table-cell-editor";
    input.value = cell.text;
    input.rows = 1;
    input.spellcheck = Boolean(currentOptions.spellcheck);
    input.setAttribute(
      "aria-label",
      t(
        `表格第${displayRow + 1}行第${col + 1}列`,
        `Table row ${displayRow + 1} column ${col + 1}`,
        currentOptions.locale || getLocale(),
      ),
    );
    active = {
      row,
      col,
      input,
      from: cell.from,
      value: cell.text,
      composing: false,
    };
    td.replaceChildren(input);
    td.classList.add("inkstone-active-cell");
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("select", () => {
      if (!active || active.input !== input || active.composing || committing)
        return;
      const anchor = absoluteFrom() + active.from + input.selectionStart;
      const head = absoluteFrom() + active.from + input.selectionEnd;
      if (
        anchor !== view.state.selection.main.anchor ||
        head !== view.state.selection.main.head
      )
        view.dispatch({ selection: { anchor, head }, userEvent: "select" });
    });
    input.addEventListener("compositionstart", () => {
      if (active?.input === input) active.composing = true;
    });
    input.addEventListener("compositionend", () => {
      if (active?.input === input) {
        active.composing = false;
        commit("input.type.compose");
      }
    });
    input.addEventListener("input", (event) => {
      event.stopPropagation();
      commit(event.inputType?.includes("Paste") ? "input.paste" : "input.type");
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (!text?.includes("\t") || active?.composing) return;
      event.preventDefault();
      event.stopPropagation();
      commit();
      const change = modifyTable(
        view.state.doc.toString(),
        absoluteFrom() + currentCell().from,
        "paste",
        text,
      );
      if (change)
        view.dispatch({
          changes: change,
          selection: { anchor: change.anchor },
          userEvent: "input.paste",
          annotations: isolateHistory.of("full"),
        });
    });
    input.addEventListener("keydown", (event) => {
      if (active?.composing || event.isComposing) return;
      if (event.ctrlKey || event.metaKey) {
        const command =
          event.shiftKey && event.key.toLowerCase() === "x"
            ? "strike"
            : !event.shiftKey
              ? { b: "bold", i: "italic", e: "code", k: "link" }[
                  event.key.toLowerCase()
                ]
              : null;
        if (command && editorCommands.has(view)) {
          event.preventDefault();
          event.stopPropagation();
          commit();
          editorCommands.get(view)(command);
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        commit();
        (event.shiftKey ? redo : undo)(view);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        commit();
        redo(view);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stop({ focusEditor: true });
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        commit();
        navigate(event.key === "Enter" ? "row" : event.shiftKey ? -1 : 1);
      }
    });
    input.addEventListener("blur", () =>
      queueMicrotask(() => {
        if (
          !disposed &&
          active?.input === input &&
          document.activeElement !== input &&
          !active.composing
        )
          stop();
      }),
    );
    const start = Math.min(cell.text.length, selection?.start ?? 0),
      end = Math.min(cell.text.length, selection?.end ?? cell.text.length);
    if (dispatch) {
      // A cell boundary separates typing groups so undo has a predictable cell-level scope.
      view.dispatch({
        selection: {
          anchor: absoluteFrom() + cell.from + start,
          head: absoluteFrom() + cell.from + end,
        },
        annotations: isolateHistory.of("before"),
        userEvent: "select.pointer",
      });
    }
    input.focus();
    input.setSelectionRange(start, end);
    input.style.height = Math.max(26, input.scrollHeight) + "px";
    return true;
  }
  function navigate(direction) {
    if (!active) return;
    const data = cells();
    let row = active.row,
      col = active.col;
    if (direction === "row") row += row === 0 ? 2 : 1;
    else {
      col += direction;
      if (col >= data[0].length) {
        col = 0;
        row += row === 0 ? 2 : 1;
      }
      if (col < 0) {
        col = data[0].length - 1;
        row -= row === 2 ? 2 : 1;
      }
    }
    if (row < 0) {
      stop({ focusEditor: true });
      return;
    }
    if (row >= data.length) {
      const end = currentBlock.text.replace(/\n+$/, "").length;
      const insert = "\n| " + Array(data[0].length).fill("").join(" | ") + " |";
      view.dispatch({
        changes: { from: absoluteFrom() + end, insert },
        annotations: isolateHistory.of("full"),
        userEvent: "input",
      });
    }
    activate(row, col);
  }
  element.addEventListener("mousedown", (event) => {
    if (
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest("textarea")
    )
      return;
    const td = event.target.closest("td,th");
    if (!td || view.state.readOnly) return;
    const tr = td.parentElement;
    const displayed = [...element.querySelectorAll("tr")].indexOf(tr);
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(displayed === 0 ? 0 : displayed + 1, [...tr.children].indexOf(td));
  });
  const controller = {
    activateAt(position) {
      const relative = position - absoluteFrom();
      const data = cells();
      for (let row = 0; row < data.length; row++)
        if (row !== 1)
          for (let col = 0; col < data[row].length; col++) {
            const cell = data[row][col];
            if (relative >= cell.from && relative <= cell.to)
              return activate(row, col, {
                start: relative - cell.from,
                end: relative - cell.from,
              });
          }
      return false;
    },
    update(nextBlock, nextOptions) {
      currentBlock = nextBlock;
      currentOptions = nextOptions;
      if (committing) return;
      const saved = active && {
        row: active.row,
        col: active.col,
        start: active.input.selectionStart,
        end: active.input.selectionEnd,
        focused: document.activeElement === active.input,
      };
      const cell = saved && cells()[saved.row]?.[saved.col],
        selection = view.state.selection.main;
      if (
        cell &&
        selection.from >= absoluteFrom() + cell.from &&
        selection.to <= absoluteFrom() + cell.to
      ) {
        saved.start = selection.from - absoluteFrom() - cell.from;
        saved.end = selection.to - absoluteFrom() - cell.from;
      }
      active = null;
      draw();
      const pendingGeneration = ++generation;
      if (saved?.focused && !view.state.readOnly) {
        queueMicrotask(() => {
          if (
            !disposed &&
            element.isConnected &&
            generation === pendingGeneration
          )
            activate(saved.row, saved.col, saved, false);
        });
      }
    },
    destroy() {
      disposed = true;
      active = null;
    },
  };
  controllers.set(element, controller);
  return controller;
}
export function updateTableEditor(element, block, options) {
  const controller = controllers.get(element);
  if (!controller) return false;
  controller.update(block, options);
  return true;
}
export function destroyTableEditor(element) {
  controllers.get(element)?.destroy();
  controllers.delete(element);
}
export function focusTableCell(view, position) {
  for (const element of view.dom.querySelectorAll(
    '[data-block-type="table_open"]',
  ))
    if (controllers.get(element)?.activateAt(position)) return true;
  return false;
}
