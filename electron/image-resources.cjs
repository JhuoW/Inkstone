"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fileURLToPath, pathToFileURL } = require("node:url");
const MarkdownIt = require("markdown-it");
const { atomicWrite, hash } = require("./storage.cjs");
const markdown = new MarkdownIt({ html: true });
const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
]);
const LIMIT = 25 * 1024 * 1024;
const labelKey = (value) =>
  markdown.utils.unescapeAll(value).trim().replace(/\s+/g, " ").toUpperCase();
const escaped = (text, index) => {
  let n = 0;
  while (index > 0 && text[--index] === "\\") n++;
  return n % 2 === 1;
};
function closeBracket(text, start) {
  let depth = 1;
  for (let cursor = start + 1; cursor < text.length; cursor++) {
    if (text[cursor] === "\\") {
      cursor++;
      continue;
    }
    if (text[cursor] === "[") depth++;
    else if (text[cursor] === "]" && --depth === 0) return cursor;
  }
  return -1;
}
function inlineDestination(text, open) {
  let cursor = open + 1;
  while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++;
  let from = cursor,
    to;
  if (text[cursor] === "<") {
    from = ++cursor;
    while (
      cursor < text.length &&
      text[cursor] !== ">" &&
      !/[\r\n]/.test(text[cursor])
    ) {
      if (text[cursor] === "\\") cursor++;
      cursor++;
    }
    if (text[cursor] !== ">") return null;
    to = cursor++;
  } else {
    let depth = 0;
    for (; cursor < text.length; cursor++) {
      const ch = text[cursor];
      if (ch === "\\") {
        cursor++;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        if (!depth) break;
        depth--;
      } else if (/\s/.test(ch) && !depth) break;
    }
    to = cursor;
  }
  while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++;
  if (["'", '"', "("].includes(text[cursor])) {
    const delimiter = text[cursor++],
      end = delimiter === "(" ? ")" : delimiter;
    while (cursor < text.length && text[cursor] !== end) {
      if (text[cursor] === "\\") cursor++;
      cursor++;
    }
    if (text[cursor++] !== end) return null;
    while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++;
  }
  return text[cursor] === ")" && to > from
    ? { destinationFrom: from, destinationTo: to, to: cursor + 1 }
    : null;
}
/** Parse positions only: never serialize Markdown. All indices refer to the caller's exact string. */
function imageSpans(text) {
  if (typeof text !== "string" || text.length > 100 * 1024 * 1024)
    throw Error("IMAGES: Document text is missing or exceeds 100 MB.");
  const mask = new Uint8Array(text.length),
    lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lines.push(i + 1);
  lines.push(text.length);
  const frontMatter =
    /^(?:\ufeff)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text);
  if (frontMatter) mask.fill(1, 0, frontMatter[0].length);
  const environment = {};
  for (const token of markdown.parse(text, environment))
    if (["fence", "code_block"].includes(token.type) && token.map)
      mask.fill(
        1,
        lines[token.map[0]] || 0,
        lines[token.map[1]] ?? text.length,
      );
  for (const match of text.matchAll(
    /<!--[\s\S]*?-->|<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
  ))
    mask.fill(1, match.index, match.index + match[0].length);
  const spans = [];
  for (let i = 0; i < text.length; i++) {
    if (mask[i] || text[i] !== "`" || escaped(text, i)) continue;
    let count = 1;
    while (text[i + count] === "`") count++;
    let end = i + count;
    while ((end = text.indexOf("`".repeat(count), end)) >= 0) {
      if (text[end - 1] !== "`" && text[end + count] !== "`") break;
      end += count;
    }
    if (end >= 0) {
      mask.fill(1, i, end + count);
      i = end + count - 1;
    } else i += count - 1;
  }
  for (const tag of text.matchAll(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    if (mask[tag.index]) continue;
    const attributes = [
      ...tag[0]
        .slice(4)
        .matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g),
    ];
    const attr = attributes.find(
      (item) =>
        item[1].toLowerCase() === "src" &&
        (item[2] !== undefined ||
          item[3] !== undefined ||
          item[4] !== undefined),
    );
    if (attr) {
      const source = attr[2] ?? attr[3] ?? attr[4];
      let offset = attr[0].indexOf("=") + 1;
      while (/\s/.test(attr[0][offset] || "")) offset++;
      if (/['"]/.test(attr[0][offset])) offset++;
      const destinationFrom = tag.index + 4 + attr.index + offset;
      spans.push({
        from: tag.index,
        to: tag.index + tag[0].length,
        destinationFrom,
        destinationTo: destinationFrom + source.length,
        source,
        kind: "html",
      });
    }
    mask.fill(1, tag.index, tag.index + tag[0].length);
  }
  const definitions = new Map();
  for (const match of text.matchAll(
    /^(?: {0,3}>[ \t]?)* {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|([^\s]+))/gm,
  )) {
    if (mask[match.index]) continue;
    const key = labelKey(match[1]),
      source = match[2] ?? match[3];
    if (!definitions.has(key) && environment.references?.[key]) {
      const from = match.index + match[0].lastIndexOf(source);
      definitions.set(key, {
        source,
        destinationFrom: from,
        destinationTo: from + source.length,
      });
    }
    mask.fill(1, match.index, match.index + match[0].length);
  }
  for (let start = 0; start < text.length - 1; start++) {
    if (
      mask[start] ||
      text[start] !== "!" ||
      text[start + 1] !== "[" ||
      escaped(text, start)
    )
      continue;
    const end = closeBracket(text, start + 1);
    if (end < 0) continue;
    let occurrence = null;
    if (text[end + 1] === "(") {
      const parsed = inlineDestination(text, end + 1);
      if (parsed)
        occurrence = {
          ...parsed,
          source: text.slice(parsed.destinationFrom, parsed.destinationTo),
          kind: "markdown",
        };
    } else {
      let label = text.slice(start + 2, end),
        to = end + 1;
      if (text[to] === "[") {
        const closing = closeBracket(text, to);
        if (closing < 0) continue;
        label = text.slice(to + 1, closing) || label;
        to = closing + 1;
      }
      const definition = definitions.get(labelKey(label));
      if (definition)
        occurrence = { ...definition, to, kind: "reference", label };
    }
    if (occurrence) {
      spans.push({ from: start, ...occurrence });
      start = occurrence.to - 1;
    }
  }
  return spans.sort((a, b) => a.from - b.from);
}
function resolveSource(source, documentPath, imageRoot) {
  source = markdown.utils.unescapeAll(source);
  if (/^https?:\/\//i.test(source))
    return { remote: true, url: new URL(source).href };
  if (/^(?:data:|blob:|#)/i.test(source)) return { embedded: true };
  if (source.startsWith("inkstone-asset:"))
    return { path: new URL(source).searchParams.get("path"), remote: false };
  if (/^file:/i.test(source)) {
    const url = new URL(source);
    return {
      path: fileURLToPath(url),
      remote: false,
      suffix: url.search + url.hash,
    };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[a-z]:[\\/]/i.test(source))
    throw Error("Unsupported image URL protocol.");
  const split = source.search(/[?#]/),
    destination = split < 0 ? source : source.slice(0, split),
    suffix = split < 0 ? "" : source.slice(split);
  const decoded = decodeURIComponent(destination);
  if (imageRoot && /^https?:\/\//i.test(imageRoot))
    return {
      remote: true,
      url: new URL(decoded.replace(/^\/+/, ""), imageRoot.replace(/\/?$/, "/"))
        .href,
      suffix,
    };
  let base = path.dirname(documentPath);
  if (imageRoot)
    base = /^file:/i.test(imageRoot)
      ? fileURLToPath(imageRoot)
      : path.resolve(base, imageRoot);
  const local = imageRoot
    ? path.resolve(base, decoded.replace(/^[/\\]+/, ""))
    : path.resolve(base, decoded);
  return { path: local, remote: false, suffix };
}
function applyPatches(text, patches) {
  let last = text.length;
  for (const patch of [...patches].sort((a, b) => b.from - a.from)) {
    if (patch.from < 0 || patch.to > last || patch.from > patch.to)
      throw Error("IMAGES: Overlapping image source patches were refused.");
    text = text.slice(0, patch.from) + patch.insert + text.slice(patch.to);
    last = patch.from;
  }
  return text;
}
function referencePath(target, documentPath, imageRoot) {
  if (imageRoot && /^https?:\/\//i.test(imageRoot))
    return pathToFileURL(target).href;
  const base = imageRoot
    ? /^file:/i.test(imageRoot)
      ? fileURLToPath(imageRoot)
      : path.resolve(path.dirname(documentPath), imageRoot)
    : path.dirname(documentPath);
  const relative = path.relative(base, target);
  if (path.isAbsolute(relative)) return pathToFileURL(target).href;
  return relative
    .split(path.sep)
    .map((part) =>
      encodeURIComponent(part)
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29"),
    )
    .join("/");
}
async function atomicCreate(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.inkstone-image-${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    // Hard-link publication is atomic and must fail if a destination already exists.
    await fs.link(temporary, file);
    try {
      const dir = await fs.open(path.dirname(file), "r");
      await dir.sync();
      await dir.close();
    } catch {}
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
async function download(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password)
    throw Error(
      "DOWNLOAD: Only HTTP(S) URLs without credentials are accepted.",
    );
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`DOWNLOAD: HTTP ${response.status} for ${url}`);
  const extension = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
  }[
    (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase()
  ];
  if (
    !extension ||
    Number(response.headers.get("content-length") || 0) > LIMIT
  ) {
    await response.body?.cancel();
    throw Error("DOWNLOAD: Unsupported image type or image exceeds 25 MB.");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > LIMIT) throw Error("DOWNLOAD: Image exceeds 25 MB.");
    chunks.push(Buffer.from(chunk));
  }
  const raw = path.basename(decodeURIComponent(new URL(response.url).pathname));
  const stem =
    path.basename(raw, path.extname(raw)).replace(/[^\p{L}\p{N}_.-]/gu, "-") ||
    "download";
  return { bytes: Buffer.concat(chunks), name: `${stem}${extension}` };
}
class ImageResourceManager {
  constructor({ store, authorize, trash, defaultFolder }) {
    this.store = store;
    this.authorize = authorize;
    this.trash = trash;
    this.defaultFolder = defaultFolder;
    this.plans = new Map();
    this.queue = Promise.resolve();
  }
  async list({ documentPath, text, imageRoot }) {
    documentPath = await this.authorize(documentPath);
    if (
      imageRoot !== undefined &&
      (typeof imageRoot !== "string" || imageRoot.length > 4096)
    )
      throw Error("IMAGES: Invalid image root.");
    const groups = new Map(),
      warnings = [];
    for (const occurrence of imageSpans(text)) {
      try {
        const resolved = resolveSource(
          occurrence.source,
          documentPath,
          imageRoot,
        );
        if (resolved.embedded) {
          warnings.push(
            "An embedded/data image was omitted; it has no local resource file.",
          );
          continue;
        }
        if (resolved.path) resolved.path = await this.authorize(resolved.path);
        const id = hash(resolved.path || resolved.url).slice(0, 24);
        if (!groups.has(id))
          groups.set(id, {
            id,
            source: occurrence.source,
            ...resolved,
            occurrences: [],
          });
        groups.get(id).occurrences.push({
          ...occurrence,
          destFrom: occurrence.destinationFrom,
          destTo: occurrence.destinationTo,
          suffix: resolved.suffix || "",
        });
      } catch (error) {
        warnings.push(`Image ${occurrence.source}: ${error.message}`);
      }
    }
    return { references: [...groups.values()], warnings };
  }
  async prepare(payload, owner) {
    const { text, revision, imageRoot, operation } = payload;
    if (
      !["copy", "move", "rename", "delete", "unlink", "download"].includes(
        operation,
      )
    )
      throw Error("IMAGES: Unsupported image operation.");
    const documentPath = await this.authorize(payload.documentPath);
    if (!revision || (await this.store.revision(documentPath)) !== revision)
      throw Error(
        "CONFLICT: The document changed on disk. Reopen it before managing image resources.",
      );
    for (const [id, plan] of this.plans)
      if (plan.expires < Date.now() && !plan.committing)
        await this.cancel(id, plan.owner);
    if (this.plans.size >= 20)
      throw Error(
        "IMAGES: Too many pending resource operations. Cancel an earlier operation first.",
      );
    const listed = await this.list(payload),
      byId = new Map(listed.references.map((item) => [item.id, item]));
    const selected =
      payload.items ||
      listed.references
        .filter((item) =>
          operation === "download"
            ? item.remote
            : !item.remote || operation === "unlink",
        )
        .map((item) => ({ id: item.id }));
    if (!Array.isArray(selected) || !selected.length || selected.length > 100)
      throw Error("IMAGES: Select between 1 and 100 images.");
    if (new Set(selected.map((item) => item.id)).size !== selected.length)
      throw Error("IMAGES: Duplicate image selections were refused.");
    if (operation === "rename" && selected.length !== 1)
      throw Error("IMAGES: Rename operates on one image at a time.");
    const id = crypto.randomUUID(),
      stage = path.join(this.store.dataDir, "resource-staging", id),
      resources = [],
      patches = new Map(),
      warnings = [...listed.warnings],
      claimed = new Set();
    await fs.mkdir(stage, { recursive: true });
    try {
      let total = 0;
      for (const selection of selected) {
        const resource = byId.get(selection.id);
        if (!resource)
          throw Error(
            "IMAGES: An image selection is no longer present in this document.",
          );
        if (resource.remote && !["download", "unlink"].includes(operation))
          throw Error(
            "IMAGES: Download remote images before moving, renaming or deleting their files.",
          );
        if (!resource.remote && operation === "download")
          throw Error("IMAGES: Download requires remote HTTP(S) image URLs.");
        const item = {
          id: resource.id,
          source: resource.path || resource.url,
          operation,
        };
        if (operation !== "unlink") {
          let data;
          if (operation === "download") data = await download(resource.url);
          else {
            const source = await this.authorize(resource.path),
              stat = await fs.stat(source);
            if (
              !stat.isFile() ||
              !imageExtensions.has(path.extname(source).toLowerCase())
            )
              throw Error("IMAGES: Only supported image files may be managed.");
            if (stat.size > LIMIT)
              throw Error("IMAGES: Resource exceeds 25 MB.");
            data = {
              bytes: await fs.readFile(source),
              name: path.basename(source),
            };
            item.sourceRevision = hash(data.bytes);
          }
          total += data.bytes.length;
          if (total > 100 * 1024 * 1024)
            throw Error("IMAGES: Resource batch exceeds 100 MB.");
          if (!["delete"].includes(operation)) {
            let target;
            if (selection.target)
              target = await this.authorize(selection.target);
            else {
              if (operation === "rename")
                throw Error("IMAGES: A rename destination is required.");
              const configured =
                payload.targetFolder ||
                payload.imageFolder ||
                this.defaultFolder() ||
                "assets";
              if (typeof configured !== "string")
                throw Error("IMAGES: Invalid destination folder.");
              const folder = await this.authorize(
                path.resolve(
                  path.dirname(documentPath),
                  configured.replaceAll(
                    "${filename}",
                    path.basename(documentPath, path.extname(documentPath)),
                  ),
                ),
              );
              target = path.join(folder, data.name);
              let number = 1;
              while (
                claimed.has(target) ||
                (await fs.stat(target).then(
                  () => true,
                  (error) => {
                    if (error.code === "ENOENT") return false;
                    throw error;
                  },
                ))
              ) {
                target = path.join(
                  folder,
                  `${path.basename(data.name, path.extname(data.name))}-${number++}${path.extname(data.name)}`,
                );
              }
            }
            if (!imageExtensions.has(path.extname(target).toLowerCase()))
              throw Error(
                "IMAGES: Destination must retain a supported image extension.",
              );
            if (target === resource.path || claimed.has(target))
              throw Error(
                "IMAGES: Destination conflicts with a source or another image.",
              );
            if (
              await fs.stat(target).then(
                () => true,
                (error) => {
                  if (error.code === "ENOENT") return false;
                  throw error;
                },
              )
            )
              throw Error(
                "EXISTS: The image destination already exists; it was not overwritten.",
              );
            claimed.add(target);
            item.target = target;
            item.relativePath = referencePath(target, documentPath, imageRoot);
            item.revision = hash(data.bytes);
            item.stage = path.join(stage, String(resources.length));
            await atomicWrite(item.stage, data.bytes);
          }
        }
        for (const occurrence of resource.occurrences) {
          const patch = ["delete", "unlink"].includes(operation)
            ? { from: occurrence.from, to: occurrence.to, insert: "" }
            : {
                from: occurrence.destinationFrom,
                to: occurrence.destinationTo,
                insert:
                  item.relativePath +
                  (occurrence.kind === "html"
                    ? occurrence.suffix
                        .replace(/&/g, "&amp;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#39;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                    : occurrence.suffix
                        .replace(/ /g, "%20")
                        .replace(/\(/g, "%28")
                        .replace(/\)/g, "%29")),
              };
          const key = `${patch.from}:${patch.to}`;
          if (patches.has(key) && patches.get(key).insert !== patch.insert)
            throw Error("IMAGES: Conflicting shared reference definitions.");
          patches.set(key, patch);
        }
        resources.push(item);
      }
      const changes = [...patches.values()].sort((a, b) => a.from - b.from),
        updated = applyPatches(text, changes);
      const plan = {
        id,
        owner,
        documentPath,
        revision,
        encoding:
          payload.encoding || this.store.documents.get(documentPath)?.encoding,
        text: updated,
        patches: changes,
        resources,
        warnings,
        stage,
        expires: Date.now() + 15 * 60000,
      };
      if (["move", "rename", "delete"].includes(operation))
        warnings.push(
          "References in other documents are not rewritten. Original files are sent to the system trash after this document is saved.",
        );
      this.plans.set(id, plan);
      return this.publicPlan(plan);
    } catch (error) {
      await fs.rm(stage, { recursive: true, force: true });
      throw error;
    }
  }
  publicPlan(plan) {
    return {
      id: plan.id,
      text: plan.text,
      patches: plan.patches,
      resources: plan.resources.map(({ stage, ...rest }) => rest),
      warnings: plan.warnings,
    };
  }
  async cancel(id, owner) {
    const plan = this.plans.get(id);
    if (!plan) return false;
    if (plan.owner !== owner)
      throw Error("ACCESS: This resource operation belongs to another window.");
    if (plan.committing)
      throw Error("IMAGES: This resource operation is already committing.");
    this.plans.delete(id);
    await fs.rm(plan.stage, { recursive: true, force: true });
    return true;
  }
  async close(owner) {
    for (const [id, plan] of this.plans)
      if (plan.owner === owner && !plan.committing)
        await this.cancel(id, owner);
  }
  async commit(id, owner) {
    const plan = this.plans.get(id);
    if (!plan || plan.expires < Date.now())
      throw Error("IMAGES: Resource operation expired; prepare it again.");
    if (plan.owner !== owner)
      throw Error("ACCESS: This resource operation belongs to another window.");
    if (plan.committing)
      throw Error("IMAGES: Resource operation is already committing.");
    plan.committing = true;
    const previous = this.queue,
      run = previous
        .catch(() => {})
        .then(async () => {
          const created = [];
          try {
            const file = await this.authorize(plan.documentPath);
            if ((await this.store.revision(file)) !== plan.revision)
              throw Error(
                "CONFLICT: The document changed since preparing image resources. No original files were removed.",
              );
            for (const resource of plan.resources) {
              if (
                resource.sourceRevision &&
                (await this.store.revision(
                  await this.authorize(resource.source),
                )) !== resource.sourceRevision
              )
                throw Error(
                  "CONFLICT: An image changed after preparing this operation. No original files were removed.",
                );
              if (resource.target) {
                await this.authorize(resource.target);
                await atomicCreate(
                  resource.target,
                  await fs.readFile(resource.stage),
                );
                created.push(resource);
              }
            }
            for (const resource of plan.resources)
              if (
                resource.sourceRevision &&
                (await this.store.revision(
                  await this.authorize(resource.source),
                )) !== resource.sourceRevision
              )
                throw Error(
                  "CONFLICT: An image changed while publishing the batch. No original files were removed.",
                );
            const document = await this.store.save({
              path: file,
              text: plan.text,
              revision: plan.revision,
              encoding: plan.encoding,
            });
            for (const resource of plan.resources) {
              if (!["move", "rename", "delete"].includes(resource.operation))
                continue;
              try {
                if (
                  (await this.store.revision(
                    await this.authorize(resource.source),
                  )) !== resource.sourceRevision
                )
                  throw Error(
                    "The source changed while committing; it was kept.",
                  );
                await this.trash(resource.source);
                resource.trashed = true;
              } catch (error) {
                plan.warnings.push(
                  `The document was saved, but the original image was retained: ${resource.source}. ${error.message}`,
                );
              }
            }
            return { ...this.publicPlan(plan), document };
          } catch (error) {
            for (const resource of created) {
              try {
                if (
                  (await this.store.revision(resource.target)) ===
                  resource.revision
                )
                  await fs.unlink(resource.target);
                else
                  plan.warnings.push(
                    `A published image changed externally and was retained: ${resource.target}`,
                  );
              } catch {}
            }
            throw error;
          } finally {
            this.plans.delete(id);
            await fs
              .rm(plan.stage, { recursive: true, force: true })
              .catch(() => {});
          }
        });
    this.queue = run;
    return run;
  }
}
module.exports = {
  imageSpans,
  resolveSource,
  applyPatches,
  ImageResourceManager,
  atomicCreate,
  referencePath,
};
