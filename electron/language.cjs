"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const supported = (value) => value === "en" || value === "zh-CN";
async function initialLanguage(saved, resourcesPath) {
  if (supported(saved?.locale))
    return { locale: saved.locale, configured: true };
  try {
    const seed = JSON.parse(
      await fs.readFile(
        path.join(resourcesPath, "installer-locale.json"),
        "utf8",
      ),
    );
    if (supported(seed?.locale))
      return {
        locale: seed.locale,
        configured: saved?.firstRunComplete === true,
        installerSeed: true,
      };
  } catch {}
  return { locale: "en", configured: saved?.firstRunComplete === true };
}
module.exports = { initialLanguage };
