const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs/promises");
const path = require("node:path");
const { filterPaths } = require("./glob.cjs");
(async () => {
  const {
    root,
    query,
    regex,
    caseSensitive,
    wholeWord,
    includeGlobs,
    excludeGlobs,
    showHidden,
    showAllFiles,
  } = workerData;
  const accept = filterPaths(includeGlobs, excludeGlobs);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = regex ? query : escaped;
  const expression = new RegExp(
    wholeWord
      ? `(?<![\\p{L}\\p{N}\\p{M}_])(?:${source})(?![\\p{L}\\p{N}\\p{M}_])`
      : source,
    caseSensitive ? "u" : "iu",
  );
  const results = [];
  let files = 0,
    truncated = false;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (
        (!showHidden && entry.name.startsWith(".")) ||
        ["node_modules", "dist", "release"].includes(entry.name) ||
        entry.isSymbolicLink()
      )
        continue;
      const file = path.join(dir, entry.name);
      if (!accept(path.relative(root, file), entry.isDirectory())) continue;
      if (entry.isDirectory()) await walk(file);
      else if (
        showAllFiles ||
        /\.(md|markdown|mdown|mkd|txt)$/i.test(entry.name)
      ) {
        if (++files > 5000) {
          truncated = true;
          return;
        }
        try {
          if ((await fs.stat(file)).size > 5 * 1024 * 1024) {
            truncated = true;
            continue;
          }
          const content = await fs.readFile(file, "utf8");
          if (content.includes("\0")) continue;
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (expression.test(line))
              results.push({
                path: file,
                line: i + 1,
                text: line.slice(0, 500),
              });
            if (results.length >= 1000) {
              truncated = true;
              return;
            }
          }
        } catch {}
      }
      if (truncated && (files > 5000 || results.length >= 1000)) return;
    }
  }
  await walk(root);
  parentPort.postMessage({ results, truncated, files });
})().catch((error) => parentPort.postMessage({ error: error.message }));
