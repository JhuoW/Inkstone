"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const normalized = (source) => String(source).replace(/\r\n/g, "\n").trim();
const language = (lang) =>
  lang === "flowchart" ? "flow" : String(lang).toLowerCase();
async function embedExportDiagrams(text, assets, tempDir) {
  if (assets !== undefined && !Array.isArray(assets))
    throw Error("EXPORT: diagramAssets must be an array.");
  if ((assets?.length || 0) > 100)
    throw Error(
      "EXPORT: A maximum of 100 diagram images can be embedded per export.",
    );
  const bySource = new Map();
  let bytesTotal = 0,
    index = 0;
  for (const asset of assets || []) {
    if (
      typeof asset.source !== "string" ||
      asset.source.length > 1024 * 1024 ||
      typeof asset.dataUrl !== "string" ||
      asset.dataUrl.length > 14 * 1024 * 1024 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(asset.dataUrl)
    )
      throw Error("EXPORT: Invalid diagram source or PNG data.");
    const bytes = Buffer.from(
      asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1),
      "base64",
    );
    bytesTotal += bytes.length;
    if (
      bytes.length > 10 * 1024 * 1024 ||
      bytesTotal > 100 * 1024 * 1024 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Error(
        "EXPORT: Diagram image is not PNG or exceeds export size limits.",
      );
    const file = path.join(tempDir, `inkstone-diagram-${index++}.png`);
    await fs.writeFile(file, bytes);
    const key = language(asset.language) + "\0" + normalized(asset.source);
    if (!bySource.has(key)) bySource.set(key, file);
  }
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(
    (match) => match[0],
  );
  const replacements = [],
    used = new Set();
  let missing = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      plain = line[0].replace(/\r?\n$/, "");
    const start = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^\r\n]*$/i.exec(plain);
    if (!start) continue;
    let end = i + 1;
    const close = new RegExp(
      "^" + start[1] + start[2][0] + "{" + start[2].length + ",}[ \\t]*$",
    );
    while (
      end < lines.length &&
      !close.test(lines[end][0].replace(/\r?\n$/, ""))
    )
      end++;
    if (end >= lines.length) continue;
    if (
      !["mermaid", "flowchart", "flow", "sequence"].includes(
        start[3].toLowerCase(),
      )
    ) {
      i = end;
      continue;
    }
    let source = text.slice(line.index + line[0].length, lines[end].index);
    if (start[1])
      source = source
        .split("\n")
        .map((line) =>
          line.startsWith(start[1]) ? line.slice(start[1].length) : line,
        )
        .join("\n");
    const key = language(start[3]) + "\0" + normalized(source),
      file = bySource.get(key);
    if (file) {
      used.add(key);
      replacements.push({
        from: line.index,
        to: lines[end].index + lines[end][0].length,
        insert: `${start[1]}![Diagram (${start[3]})](<${file.split(path.sep).join("/")}>)\n\n`,
      });
    } else missing++;
    i = end;
  }
  let output = text;
  for (const change of replacements.reverse())
    output =
      output.slice(0, change.from) + change.insert + output.slice(change.to);
  missing = Math.max(missing, bySource.size - used.size);
  return {
    text: output,
    count: replacements.length,
    warnings: missing
      ? [
          `${missing} diagram fence(s) had no matching rendered PNG; these remain source code in the converted document.`,
        ]
      : [],
  };
}
module.exports = { embedExportDiagrams };
