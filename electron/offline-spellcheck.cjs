"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { hash } = require("./storage.cjs");
const { atomicCreate } = require("./image-resources.cjs");
const DICTIONARY_URL = "inkstone-dictionary://local/";
const bundledFile = "en-US-10-2.bdic";
const bundledFolder = path.join(__dirname, "dictionaries");

// Called synchronously for every new session, before any window can start it.
function restrictDictionarySource(session) {
  session.setSpellCheckerDictionaryDownloadURL(DICTIONARY_URL);
  session.setSpellCheckerEnabled(false);
}
async function validDictionary(file) {
  let handle;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < 64 || stat.size > 20 * 1024 * 1024)
      return false;
    handle = await fs.open(file, "r");
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    return header.toString("ascii") === "BDic";
  } catch {
    return false;
  } finally {
    if (handle) await handle.close();
  }
}
async function installDictionaryCache(dataDir) {
  const directory = path.join(dataDir, "Dictionaries"),
    warnings = [];
  let expected;
  try {
    await fs.mkdir(directory, { recursive: true });
    const manifest = JSON.parse(
      await fs.readFile(path.join(bundledFolder, "provenance.json"), "utf8"),
    );
    expected = manifest.files.find((item) => item.file === bundledFile)?.sha256;
    const bytes = await fs.readFile(path.join(bundledFolder, bundledFile));
    if (!expected || hash(bytes) !== expected)
      throw Error("The bundled dictionary did not pass its integrity check.");
    const destination = path.join(directory, bundledFile);
    try {
      await atomicCreate(destination, bytes);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  } catch (error) {
    warnings.push(error.message);
  }
  const dictionaries = [];
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch((error) => {
      warnings.push(error.message);
      return [];
    });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^([a-z]{2,3}(?:-[a-z]{2,8})*)-\d+-\d+\.bdic$/i.exec(
      entry.name,
    );
    if (!match || !(await validDictionary(path.join(directory, entry.name))))
      continue;
    const record = {
      language: match[1],
      file: entry.name,
      path: path.join(directory, entry.name),
      bundled:
        entry.name.toLowerCase() === bundledFile.toLowerCase() &&
        hash(await fs.readFile(path.join(directory, entry.name))) === expected,
    };
    dictionaries.push(record);
  }
  return { directory, dictionaries, warnings };
}
function configureOfflineSpellcheck(session, cache, requested) {
  session.setSpellCheckerDictionaryDownloadURL(DICTIONARY_URL);
  const files = new Map(
    cache.dictionaries.map((item) => [item.file.toLowerCase(), item.path]),
  );
  session.protocol.handle("inkstone-dictionary", async (request) => {
    try {
      const url = new URL(request.url),
        name = decodeURIComponent(url.pathname.slice(1));
      const file =
        url.hostname === "local" && /^[a-z0-9-]+\.bdic$/i.test(name)
          ? files.get(name.toLowerCase())
          : null;
      if (!file)
        return new Response("No local dictionary for this language.", {
          status: 404,
        });
      return new Response(await fs.readFile(file), {
        headers: { "Content-Type": "application/octet-stream" },
      });
    } catch {
      return new Response("Local dictionary unavailable.", { status: 404 });
    }
  });
  const supported = new Map(
    session.availableSpellCheckerLanguages.map((language) => [
      language.toLowerCase(),
      language,
    ]),
  );
  const local = new Set(
    cache.dictionaries
      .map((item) => supported.get(item.language.toLowerCase()))
      .filter(Boolean),
  );
  const previous = session
    .getSpellCheckerLanguages()
    .filter((language) => local.has(language));
  const languages = previous.length
    ? previous
    : local.has("en-US")
      ? ["en-US"]
      : [...local].slice(0, 1);
  const initialized = new Set(),
    failures = new Map();
  session.on("spellcheck-dictionary-initialized", (_event, language) => {
    initialized.add(language);
    failures.delete(language);
  });
  session.on("spellcheck-dictionary-download-failure", (_event, language) => {
    failures.set(
      language,
      `The local ${language} dictionary could not be initialized. No external download was attempted.`,
    );
  });
  session.setSpellCheckerLanguages(languages);
  const setEnabled = (enabled) => {
    requested = !!enabled;
    session.setSpellCheckerEnabled(requested && languages.length > 0);
  };
  setEnabled(requested);
  return {
    setEnabled,
    status() {
      const available = initialized.size > 0;
      const bundledLanguages = [
        ...new Set(
          cache.dictionaries
            .filter((item) => item.bundled)
            .map((item) => supported.get(item.language.toLowerCase()))
            .filter(Boolean),
        ),
      ];
      const cachedLanguages = [
        ...new Set(
          cache.dictionaries
            .filter((item) => !item.bundled)
            .map((item) => supported.get(item.language.toLowerCase()))
            .filter(Boolean),
        ),
      ];
      return {
        requested: !!requested,
        enabled: !!requested && session.isSpellCheckerEnabled() && available,
        available,
        initializing: languages.length > 0 && !available && !failures.size,
        languages: session.getSpellCheckerLanguages(),
        initializedLanguages: [...initialized],
        bundledLanguages,
        cachedLanguages,
        source: `Bundled: ${bundledLanguages.join(", ") || "none"}; local cache: ${cachedLanguages.join(", ") || "none"}`,
        dictionaryURL: DICTIONARY_URL,
        externalDownloads: false,
        error: [
          ...cache.warnings,
          ...failures.values(),
          ...(!languages.length
            ? [
                "No supported local dictionary is installed. Spellcheck is unavailable.",
              ]
            : []),
        ].join(" "),
      };
    },
  };
}
module.exports = {
  DICTIONARY_URL,
  restrictDictionarySource,
  installDictionaryCache,
  configureOfflineSpellcheck,
};
