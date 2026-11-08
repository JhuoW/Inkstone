"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const runFile = promisify(require("node:child_process").execFile);
const supported = (value) => value === "en" || value === "zh-CN";
const WINDOWS_UI_LANGUAGE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class InkstoneUiLanguage { [DllImport("kernel32.dll")] public static extern ushort GetUserDefaultUILanguage(); }'
[InkstoneUiLanguage]::GetUserDefaultUILanguage()
`;
function systemLanguage(preferred) {
  const first = Array.isArray(preferred) ? preferred[0] : preferred;
  return typeof first === "string" && /^zh(?:[-_]|$)/i.test(first)
    ? "zh-CN"
    : "en";
}
async function resolveSystemLanguage(
  preferred,
  { platform = process.platform, execFile = runFile } = {},
) {
  if (platform === "win32") {
    try {
      const { stdout } = await execFile(
        path.win32.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        ),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(WINDOWS_UI_LANGUAGE, "utf16le").toString("base64"),
        ],
        { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      );
      const raw =
        typeof stdout === "string" ? stdout.replace(/^\uFEFF/, "").trim() : "";
      if (!/^\d{1,5}$/.test(raw) || +raw < 1 || +raw > 65535)
        throw Error("Invalid Windows UI language.");
      return (+raw & 0x3ff) === 4 ? "zh-CN" : "en";
    } catch {}
  }
  return systemLanguage(preferred);
}
async function initialLanguage(saved, resourcesPath, preferred) {
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
        configured: true,
        installerSeed: true,
      };
  } catch {}
  let fallback = preferred;
  if (typeof fallback === "function") {
    try {
      fallback = await fallback();
    } catch {
      fallback = "en";
    }
  }
  return {
    locale: systemLanguage(fallback),
    configured: saved?.firstRunComplete === true,
  };
}
module.exports = { initialLanguage, systemLanguage, resolveSystemLanguage };
