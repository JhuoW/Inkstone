/** Table edits return a single source-range replacement and never serialize the document. */
export function splitTableRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (/(?<!\\)\|$/.test(text)) text = text.slice(0, -1);
  const cells = [];
  let cell = "";
  let codeRun = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      cell += text[i] + text[++i];
      continue;
    }
    if (text[i] === "`") {
      let count = 1;
      while (text[i + count] === "`") count++;
      cell += "`".repeat(count);
      i += count - 1;
      if (!codeRun) codeRun = count;
      else if (codeRun === count) codeRun = 0;
      continue;
    }
    if (text[i] === "|" && !codeRun) {
      cells.push(cell.trim());
      cell = "";
    } else cell += text[i];
  }
  cells.push(cell.trim());
  return cells;
}
export const isTableDivider = (line) =>
  /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
export function locateTable(text, position) {
  const lines = text.split("\n");
  const offsets = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  let current = lines.findIndex(
    (line, i) => position <= offsets[i] + line.length,
  );
  if (current < 0) current = lines.length - 1;
  let from = current;
  while (from > 0 && lines[from - 1].includes("|") && lines[from - 1].trim())
    from--;
  let to = current;
  while (
    to + 1 < lines.length &&
    lines[to + 1].includes("|") &&
    lines[to + 1].trim()
  )
    to++;
  const divider = lines.slice(from, to + 1).findIndex(isTableDivider);
  if (divider !== 1) return null;
  const rows = lines.slice(from, to + 1).map(splitTableRow);
  const width = rows[0].length;
  for (const row of rows) while (row.length < width) row.push("");
  const prefix = lines[current].slice(
    0,
    Math.max(0, position - offsets[current]),
  );
  let col = 0,
    code = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === "\\") {
      i++;
      continue;
    }
    if (prefix[i] === "`") {
      let run = 1;
      while (prefix[i + run] === "`") run++;
      if (!code) code = run;
      else if (code === run) code = 0;
      i += run - 1;
      continue;
    }
    if (prefix[i] === "|" && !code && prefix.slice(0, i).trim()) col++;
  }
  return {
    from: offsets[from],
    to: offsets[to] + lines[to].length,
    rows,
    row: current - from,
    col: Math.max(0, Math.min(width - 1, col)),
    width,
  };
}
export function serializeTable(rows) {
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}
export function createTable(rows = 3, columns = 3) {
  const count = Math.max(1, Math.min(30, Number(columns) || 3));
  const data = [
    Array.from({ length: count }, (_, i) => `Column ${i + 1}`),
    Array(count).fill("---"),
  ];
  for (let i = 0; i < Math.max(1, Math.min(100, Number(rows) || 3)); i++)
    data.push(Array(count).fill(""));
  return serializeTable(data);
}
export function modifyTable(text, position, operation, value) {
  const table = locateTable(text, position);
  if (!table) return null;
  const { rows, col } = table;
  let row = Math.max(2, table.row);
  const width = rows[0].length;
  let cursorRow = table.row,
    cursorCol = col;
  switch (operation) {
    case "addRow":
      rows.splice(Math.min(row + 1, rows.length), 0, Array(width).fill(""));
      row++;
      cursorRow = row;
      break;
    case "deleteRow":
      if (rows.length > 3) rows.splice(row, 1);
      else rows[row] = Array(width).fill("");
      break;
    case "addColumn":
      rows.forEach((cells, i) =>
        cells.splice(col + 1, 0, i === 1 ? "---" : ""),
      );
      break;
    case "deleteColumn":
      if (width > 1) rows.forEach((cells) => cells.splice(col, 1));
      break;
    case "rowUp":
      if (row > 2) {
        [rows[row - 1], rows[row]] = [rows[row], rows[row - 1]];
        cursorRow = row - 1;
      }
      break;
    case "rowDown":
      if (row < rows.length - 1) {
        [rows[row + 1], rows[row]] = [rows[row], rows[row + 1]];
        cursorRow = row + 1;
      }
      break;
    case "columnLeft":
      if (col > 0) {
        rows.forEach((cells) => {
          [cells[col - 1], cells[col]] = [cells[col], cells[col - 1]];
        });
        cursorCol--;
      }
      break;
    case "columnRight":
      if (col < width - 1) {
        rows.forEach((cells) => {
          [cells[col + 1], cells[col]] = [cells[col], cells[col + 1]];
        });
        cursorCol++;
      }
      break;
    case "align":
      rows[1][col] =
        value === "center" ? ":---:" : value === "right" ? "---:" : ":---";
      break;
    case "paste": {
      const pasted = String(value)
        .replace(/\r\n/g, "\n")
        .replace(/\n$/, "")
        .split("\n")
        .map((line) => line.split("\t"));
      const needed = Math.max(
        width,
        col + Math.max(...pasted.map((cells) => cells.length)),
      );
      rows.forEach((cells, i) => {
        while (cells.length < needed) cells.push(i === 1 ? "---" : "");
      });
      pasted.forEach((cells, i) => {
        const target =
          (table.row === 0 ? 0 : row) + i + (table.row === 0 && i > 0 ? 1 : 0);
        while (rows.length <= target) rows.push(Array(needed).fill(""));
        cells.forEach((cell, j) => {
          rows[target][col + j] = cell.replace(/\|/g, "\\|");
        });
      });
      break;
    }
    default:
      return null;
  }
  cursorRow = Math.max(0, Math.min(rows.length - 1, cursorRow));
  cursorCol = Math.max(0, Math.min(rows[0].length - 1, cursorCol));
  const anchor =
    table.from +
    rows
      .slice(0, cursorRow)
      .reduce((total, cells) => total + serializeTable([cells]).length + 1, 0) +
    2 +
    rows[cursorRow]
      .slice(0, cursorCol)
      .reduce((total, cell) => total + cell.length + 3, 0);
  return {
    from: table.from,
    to: table.to,
    insert: serializeTable(rows),
    anchor,
  };
}
export function nextTableCell(text, position, backward = false) {
  const table = locateTable(text, position);
  if (!table) return null;
  let row = table.row;
  let col = table.col + (backward ? -1 : 1);
  if (col >= table.width) {
    row++;
    col = 0;
  }
  if (col < 0) {
    row--;
    col = table.width - 1;
  }
  if (row === 1) row += backward ? -1 : 1;
  if (row < 0) return { position: table.from };
  let change = null;
  if (row >= table.rows.length) {
    if (backward) return null;
    table.rows.push(Array(table.width).fill(""));
    change = {
      from: table.from,
      to: table.to,
      insert: serializeTable(table.rows),
    };
  }
  const lines = (
    change ? change.insert : text.slice(table.from, table.to)
  ).split("\n");
  let offset =
    table.from +
    lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0);
  const line = lines[row];
  let index = line.indexOf("|") === 0 ? 1 : 0;
  let cell = 0;
  let code = false;
  for (; index < line.length && cell < col; index++) {
    if (line[index] === "\\") index++;
    else if (line[index] === "`") code = !code;
    else if (line[index] === "|" && !code) cell++;
  }
  while (line[index] === " ") index++;
  return { change, position: offset + index };
}

/** Exact trimmed cell source spans, retaining every pipe and surrounding space outside a cell. */
export function tableCellRanges(text) {
  let offset = 0;
  return text
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => {
      const boundaries = [];
      let run = 0;
      for (let index = 0; index < line.length; index++) {
        if (line[index] === "\\") {
          index++;
          continue;
        }
        if (line[index] === "`") {
          let width = 1;
          while (line[index + width] === "`") width++;
          if (!run) run = width;
          else if (run === width) run = 0;
          index += width - 1;
          continue;
        }
        if (line[index] === "|" && !run) boundaries.push(index);
      }
      let starts = [0, ...boundaries.map((index) => index + 1)],
        ends = [...boundaries, line.length];
      if (boundaries.length && !line.slice(0, boundaries[0]).trim()) {
        starts.shift();
        ends.shift();
      }
      if (
        boundaries.length &&
        !line.slice(boundaries[boundaries.length - 1] + 1).trim()
      ) {
        starts.pop();
        ends.pop();
      }
      const result = starts.map((start, index) => {
        const segment = line.slice(start, ends[index]);
        const leading = segment.match(/^\s*/)[0].length;
        const value = segment.trim();
        const from = offset + start + (value ? leading : Math.min(1, leading));
        return { from, to: from + value.length, text: value };
      });
      offset += line.length + 1;
      return result;
    });
}
