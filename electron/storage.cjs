"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const iconv = require("iconv-lite");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const normalize = (value) => value.replace(/\r\n/g, "\n");
const exists = async (file) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};
const encodingNames = {
  utf8: "utf8",
  utf16le: "utf16le",
  utf16be: "utf16be",
  gb18030: "gb18030",
  windows1252: "windows1252",
  cp1252: "windows1252",
  shiftjis: "shiftjis",
  sjis: "shiftjis",
};
function encodingName(value = "utf8") {
  const name = encodingNames[String(value).toLowerCase().replace(/[-_ ]/g, "")];
  if (!name)
    throw new Error(
      "ENCODING: Supported encodings are UTF-8, UTF-16LE, UTF-16BE, GB18030, Windows-1252 and Shift-JIS.",
    );
  return name;
}
function supportsBOM(encoding) {
  return ["utf8", "utf16le", "utf16be"].includes(encoding);
}
function encode(text, encoding = "utf8") {
  encoding = encodingName(encoding);
  const bytes = iconv.encode(text, encoding);
  const roundtrip = iconv.decode(bytes, encoding, { stripBOM: false });
  if (roundtrip !== text)
    throw new Error(
      `ENCODING: ${encoding} cannot represent one or more characters without loss. Choose UTF-8 or another compatible encoding; nothing was saved.`,
    );
  return bytes;
}
function decode(bytes, encoding = "utf8") {
  encoding = encodingName(encoding);
  if (!encoding.startsWith("utf16") && bytes.includes(0))
    throw new Error(
      "ENCODING: This file contains NUL bytes. Choose UTF-16 explicitly if appropriate; binary files cannot be edited.",
    );
  let text;
  try {
    if (supportsBOM(encoding))
      text = new TextDecoder(
        { utf8: "utf-8", utf16le: "utf-16le", utf16be: "utf-16be" }[encoding],
        { fatal: true, ignoreBOM: true },
      ).decode(bytes);
    else text = iconv.decode(bytes, encoding, { stripBOM: false });
    if (!iconv.encode(text, encoding).equals(bytes))
      throw new Error(
        "The selected encoding does not preserve these source bytes.",
      );
  } catch (error) {
    throw new Error(
      `ENCODING: The file is not valid ${encoding}, or contains bytes that cannot roundtrip. Select the correct encoding explicitly. ${error.message}`,
    );
  }
  const bom = supportsBOM(encoding) && text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return {
    text,
    bom,
    encoding,
    lineEnding: crlf && lf ? "mixed" : crlf ? "CRLF" : "LF",
  };
}

function preserveEndings(original, edited) {
  if (edited.includes("\r\n")) return edited;
  const normalized = normalize(original);
  if (edited === normalized) return original;
  if (!original.includes("\r\n")) return edited;
  let prefix = 0;
  while (
    prefix < normalized.length &&
    prefix < edited.length &&
    normalized[prefix] === edited[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < normalized.length - prefix &&
    suffix < edited.length - prefix &&
    normalized[normalized.length - suffix - 1] ===
      edited[edited.length - suffix - 1]
  )
    suffix++;
  const position = (offset) => {
    let source = 0,
      normalizedOffset = 0;
    while (source < original.length && normalizedOffset < offset) {
      if (original[source] === "\r" && original[source + 1] === "\n") source++;
      source++;
      normalizedOffset++;
    }
    return source;
  };
  const crlf = (original.match(/\r\n/g) || []).length;
  const lf = (original.match(/(?<!\r)\n/g) || []).length;
  const replacement = edited
    .slice(prefix, edited.length - suffix)
    .replace(/\n/g, crlf >= lf ? "\r\n" : "\n");
  return (
    original.slice(0, position(prefix)) +
    replacement +
    original.slice(position(normalized.length - suffix))
  );
}
async function atomicWrite(file, bytes, { beforeRename } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.inkstone-${process.pid}-${crypto.randomUUID()}.tmp`,
  );
  let mode = 0o600;
  try {
    mode = (await fs.stat(file)).mode & 0o777;
  } catch {}
  let handle;
  try {
    handle = await fs.open(temp, "wx", mode);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    if (beforeRename) await beforeRename();
    await fs.rename(temp, file);
    try {
      const dir = await fs.open(path.dirname(file), "r");
      await dir.sync();
      await dir.close();
    } catch (e) {
      if (
        !["EINVAL", "EISDIR", "EPERM", "EACCES", "ENOTSUP", "EBADF"].includes(
          e.code,
        )
      )
        throw e;
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
  }
}
class FileStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.documents = new Map();
    this.locks = new Map();
    this.discardedRecoveryIds = new Set();
    this.recoveryRecords = new Map();
    this.blockedStateKeys = new Set();
    this.stateWarnings = [];
  }
  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }
  async exclusive(file, work) {
    const previous = this.locks.get(file) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.locks.set(file, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(file) === next) this.locks.delete(file);
    }
  }
  async read(file, { encoding = "utf8" } = {}) {
    file = path.resolve(file);
    const stats = await fs.stat(file);
    if (!stats.isFile()) throw new Error("NOT_FILE: Please choose a file.");
    if (stats.size > 100 * 1024 * 1024)
      throw new Error("TOO_LARGE: Documents are limited to 100 MB.");
    const bytes = await fs.readFile(file);
    const result = {
      path: file,
      ...decode(bytes, encoding),
      revision: hash(bytes),
    };
    this.documents.set(file, result);
    return result;
  }
  async revision(file) {
    try {
      return hash(await fs.readFile(file));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async save({
    path: file,
    text,
    revision,
    createOnly = false,
    bom,
    encoding,
    preserveExistingEndings = true,
  }) {
    if (typeof text !== "string")
      throw new Error("INVALID: Document text must be a string.");
    file = path.resolve(file);
    return this.exclusive(file, async () => {
      const currentRevision = await this.revision(file);
      if (createOnly && currentRevision !== null)
        throw new Error("EXISTS: A file with this name already exists.");
      if (currentRevision !== null && !revision && !createOnly)
        throw new Error(
          "CONFLICT: Saving over an existing file requires its current revision. Use Save As or reopen the file.",
        );
      if (revision !== undefined && revision !== currentRevision)
        throw new Error(
          "CONFLICT: The file changed outside Inkstone. Your edits are retained; reopen the disk version or Save As a new file.",
        );
      const bytes = currentRevision !== null ? await fs.readFile(file) : null;
      const tracked = this.documents.get(file);
      const outputEncoding = encodingName(
        encoding || tracked?.encoding || "utf8",
      );
      const originalEncoding = tracked?.encoding || "utf8";
      const original = bytes
        ? decode(bytes, originalEncoding)
        : { text: "", bom: false, encoding: outputEncoding };
      const writeBom =
        supportsBOM(outputEncoding) &&
        (bom === undefined ? original.bom : !!bom);
      const output = preserveExistingEndings
        ? preserveEndings(original.text, text)
        : text;
      const newBytes = encode(
        (writeBom ? "\ufeff" : "") + output,
        outputEncoding,
      );
      const nextRevision = hash(newBytes);
      const result = {
        path: file,
        ...decode(newBytes, outputEncoding),
        revision: nextRevision,
      };
      if (nextRevision === currentRevision) {
        this.documents.set(file, result);
        return { ...result, unchanged: true };
      }
      if (bytes) await this.addHistory(file, bytes, originalEncoding);
      await atomicWrite(file, newBytes, {
        beforeRename: async () => {
          if ((await this.revision(file)) !== currentRevision)
            throw new Error(
              "CONFLICT: The file changed while saving. Your edits have not overwritten it.",
            );
        },
      });
      this.documents.set(file, result);
      return result;
    });
  }
  async addHistory(file, bytes, encoding = "utf8") {
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const dir = path.join(this.dataDir, "history", hash(file));
    await fs.mkdir(dir, { recursive: true });
    await atomicWrite(path.join(dir, `${id}.md`), bytes);
    await atomicWrite(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        id,
        path: file,
        time: new Date().toISOString(),
        size: bytes.length,
        encoding,
      }),
    );
    const entries = (await fs.readdir(dir))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .reverse();
    for (const old of entries.slice(100)) {
      await fs.unlink(path.join(dir, old)).catch(() => {});
      await fs
        .unlink(path.join(dir, old.replace(/\.json$/, ".md")))
        .catch(() => {});
    }
  }
  async history(file) {
    const dir = path.join(this.dataDir, "history", hash(path.resolve(file)));
    try {
      const entries = await fs.readdir(dir);
      const all = await Promise.all(
        entries
          .filter((n) => n.endsWith(".json"))
          .map(async (n) => {
            try {
              return JSON.parse(await fs.readFile(path.join(dir, n), "utf8"));
            } catch {
              return null;
            }
          }),
      );
      return all.filter(Boolean).sort((a, b) => b.time.localeCompare(a.time));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async historical({ path: file, id, encoding }) {
    if (!/^[\w-]+$/.test(id))
      throw new Error("INVALID: Invalid history identifier.");
    file = path.resolve(file);
    const bytes = await fs.readFile(
      path.join(this.dataDir, "history", hash(file), `${id}.md`),
    );
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(this.dataDir, "history", hash(file), `${id}.json`),
        "utf8",
      ),
    );
    return {
      path: file,
      ...decode(bytes, encoding || metadata.encoding || "utf8"),
      revision: await this.revision(file),
      historical: true,
    };
  }
  async writeJson(name, value) {
    if (!/^[\w-]+$/.test(name)) throw new Error("Invalid state key");
    if (this.blockedStateKeys.has(name))
      throw new Error(
        `STATE_BACKUP: The original ${name}.json could not be backed up. Nothing was overwritten; fix the file permissions or disk error before retrying.`,
      );
    const file = path.join(this.dataDir, `${name}.json`);
    const snapshot = JSON.stringify(value, null, 2);
    await this.exclusive(file, () => atomicWrite(file, snapshot));
    return value;
  }
  async readJson(name, fallback) {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.dataDir, `${name}.json`), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") {
        const backup = path.join(
          this.dataDir,
          `${name}.corrupt-${Date.now()}-${crypto.randomUUID()}.json`,
        );
        try {
          await fs.copyFile(path.join(this.dataDir, `${name}.json`), backup);
          this.stateWarnings.push({ name, error: e.message, backup });
        } catch (backupError) {
          this.blockedStateKeys.add(name);
          this.stateWarnings.push({
            name,
            error: e.message,
            backupError: backupError.message,
          });
        }
      }
      return fallback;
    }
  }
  async preserveBlockedState(name) {
    if (!/^[\w-]+$/.test(name)) throw new Error("Invalid state key");
    if (!this.blockedStateKeys.has(name)) return null;
    const backup = path.join(
      this.dataDir,
      `${name}.corrupt-${Date.now()}-${crypto.randomUUID()}.json`,
    );
    await fs.copyFile(path.join(this.dataDir, `${name}.json`), backup);
    this.blockedStateKeys.delete(name);
    return backup;
  }
  async recovery(payload) {
    if (!payload.id || !/^[\w-]+$/.test(payload.id))
      throw new Error(
        "INVALID: Recovery ID must contain letters, digits, _ or -.",
      );
    const file = path.join(this.dataDir, "recovery", `${payload.id}.json`);
    if (!payload.discard)
      this.recoveryRecords.set(payload.id, {
        id: payload.id,
        path: payload.path,
      });
    if (!payload.discard && typeof payload.text !== "string")
      throw new Error("INVALID: Recovery text is required.");
    const snapshot = JSON.stringify({
      ...payload,
      time: new Date().toISOString(),
    });
    return this.exclusive(file, async () => {
      if (payload.discard)
        await fs.unlink(file).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      else if (!this.discardedRecoveryIds.has(payload.id))
        await atomicWrite(file, snapshot);
      return true;
    });
  }
  async discardRecoveries({ id, path: documentPath, excludeIds = [] } = {}) {
    if (!id && !documentPath)
      throw new Error("INVALID: A recovery ID or document path is required.");
    const excluded = new Set(excludeIds);
    const records = [
      ...(await this.recoveries()),
      ...this.recoveryRecords.values(),
    ];
    const ids = new Set(id ? [id] : []);
    for (const record of records)
      if (
        !excluded.has(record.id) &&
        documentPath &&
        record.path &&
        path.resolve(record.path) === path.resolve(documentPath)
      )
        ids.add(record.id);
    for (const recoveryId of ids) this.discardedRecoveryIds.add(recoveryId);
    await Promise.all(
      [...ids].map((recoveryId) =>
        this.recovery({ id: recoveryId, discard: true }),
      ),
    );
    return { discarded: [...ids] };
  }
  async recoveries() {
    const dir = path.join(this.dataDir, "recovery");
    try {
      return (
        await Promise.all(
          (await fs.readdir(dir))
            .filter((n) => n.endsWith(".json"))
            .map(async (n) => {
              try {
                return JSON.parse(await fs.readFile(path.join(dir, n), "utf8"));
              } catch {
                return null;
              }
            }),
        )
      ).filter(Boolean);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
}
module.exports = {
  FileStore,
  atomicWrite,
  hash,
  decode,
  encode,
  encodingName,
  preserveEndings,
  exists,
};
