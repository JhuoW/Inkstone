"use strict";

const path = require("node:path");
const { promisify } = require("node:util");
const runFile = promisify(require("node:child_process").execFile);

const EXTENSIONS = Object.freeze([".md", ".markdown", ".mdown", ".mkd"]);
const REGISTERED_NAME = "Inkstone";
const CAPABILITIES = "Software\\Inkstone\\Capabilities";
const PROG_ID = "Inkstone.Markdown";

// This script only reads registration and effective Shell associations. All
// names and native arguments are fixed; no renderer input becomes script text.
const QUERY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$nativeSource = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class InkstoneDefaultAssociation {
 [DllImport("shlwapi.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
 private static extern int AssocQueryStringW(uint flags, uint kind, string extension, string extra, StringBuilder output, ref uint length);
 public static string Query(uint kind) {
  uint length = 0;
  AssocQueryStringW(0, kind, ".md", null, null, ref length);
  if (length == 0 || length > 32768) return null;
  var output = new StringBuilder((int)length);
  return AssocQueryStringW(0, kind, ".md", null, output, ref length) == 0 ? output.ToString() : null;
 }
}
'@
Add-Type -TypeDefinition $nativeSource
function Read-InkstoneRegistration($hive) {
 $registered = $null; $capabilities = $null; $associations = $null; $command = $null
 try {
  $registered = $hive.OpenSubKey('Software\RegisteredApplications')
  $capabilities = $hive.OpenSubKey('Software\Inkstone\Capabilities')
  if (!$registered -or !$capabilities) { return $null }
  $associations = $capabilities.OpenSubKey('FileAssociations')
  $command = $hive.OpenSubKey('Software\Classes\Inkstone.Markdown\shell\open\command')
  $extensions = @{}
  foreach ($extension in @('.md', '.markdown', '.mdown', '.mkd')) {
   $extensions[$extension] = if ($associations) { $associations.GetValue($extension, $null) } else { $null }
  }
  return @{
   path = $registered.GetValue('Inkstone', $null)
   name = $capabilities.GetValue('ApplicationName', $null)
   description = $capabilities.GetValue('ApplicationDescription', $null)
   extensions = $extensions
   command = if ($command) { $command.GetValue('', $null) } else { $null }
  }
 } finally {
  foreach ($key in @($command, $associations, $capabilities, $registered)) { if ($key) { $key.Dispose() } }
 }
}
$user = $null; $machine = $null; $windows = $null
try {
 $user = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
 $machine = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
 $windows = $machine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion')
 @{
  build = [int]$windows.GetValue('CurrentBuildNumber', '0')
  revision = [int]$windows.GetValue('UBR', 0)
  registrations = @{ user = Read-InkstoneRegistration $user; machine = Read-InkstoneRegistration $machine }
  currentDefault = @{
   progId = [InkstoneDefaultAssociation]::Query(20)
   name = [InkstoneDefaultAssociation]::Query(4)
   executable = [InkstoneDefaultAssociation]::Query(2)
  }
 } | ConvertTo-Json -Depth 5 -Compress
} finally {
 foreach ($key in @($windows, $machine, $user)) { if ($key) { $key.Dispose() } }
}
`;

function samePath(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    path.win32.isAbsolute(a) &&
    path.win32.isAbsolute(b) &&
    path.win32.normalize(a).toLowerCase() ===
      path.win32.normalize(b).toLowerCase()
  );
}

function ownsRegistration(registration, executable) {
  if (!registration || typeof registration !== "object") return false;
  const command =
    typeof registration.command === "string" &&
    /^\s*"([^"\r\n]+)"\s+"%1"\s*$/.exec(registration.command);
  return Boolean(
    typeof registration.path === "string" &&
    registration.path.toLowerCase() === CAPABILITIES.toLowerCase() &&
    registration.name === REGISTERED_NAME &&
    typeof registration.description === "string" &&
    registration.description.trim() &&
    EXTENSIONS.every(
      (extension) =>
        registration.extensions?.[extension]?.toLowerCase?.() ===
        PROG_ID.toLowerCase(),
    ) &&
    command &&
    samePath(command[1], executable),
  );
}

function hasAppSettings(build, revision) {
  return (
    Number.isInteger(build) &&
    Number.isInteger(revision) &&
    revision >= 0 &&
    (build >= 22631 ||
      (build === 22621 && revision >= 1555) ||
      (build === 22000 && revision >= 1817))
  );
}

function createDefaultApps({
  app,
  shell,
  platform = process.platform,
  execFile = runFile,
}) {
  async function query() {
    const base = {
      supported: platform === "win32",
      packaged: Boolean(app.isPackaged),
      registered: false,
      registrationScope: null,
      currentDefault: null,
      extensions: [...EXTENSIONS],
      requiresInstallation: platform === "win32",
    };
    if (!base.supported) return { info: base, appSettings: false };
    try {
      const executable = app.getPath("exe");
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
          Buffer.from(QUERY_SCRIPT, "utf16le").toString("base64"),
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          timeout: 10000,
          maxBuffer: 131072,
        },
      );
      if (typeof stdout !== "string" || stdout.length > 131072)
        throw Error("Invalid Windows association response.");
      const result = JSON.parse(stdout.replace(/^\uFEFF/, "").trim());
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw Error("Invalid Windows association response.");
      const registrations = result.registrations || {};
      const registrationScope = ownsRegistration(registrations.user, executable)
        ? "user"
        : ownsRegistration(registrations.machine, executable)
          ? "machine"
          : null;
      const current = result.currentDefault;
      const validDefault =
        current &&
        typeof current.progId === "string" &&
        current.progId.trim().length > 0 &&
        current.progId.length <= 4096 &&
        !/^unknown$/i.test(current.progId.trim()) &&
        !(
          typeof current.executable === "string" &&
          path.win32.basename(current.executable).toLowerCase() ===
            "shell32.dll"
        );
      const currentDefault = validDefault
        ? {
            progId: current.progId,
            name:
              typeof current.name === "string" && current.name.length <= 4096
                ? current.name
                : "",
            isInkstone:
              current.progId.toLowerCase() === PROG_ID.toLowerCase() &&
              samePath(current.executable, executable),
          }
        : null;
      return {
        info: {
          ...base,
          registered: registrationScope !== null,
          registrationScope,
          currentDefault,
          requiresInstallation: registrationScope === null,
        },
        appSettings: hasAppSettings(result.build, result.revision),
      };
    } catch {
      return {
        info: {
          ...base,
          error: "Windows default applications could not be checked.",
        },
        appSettings: false,
      };
    }
  }
  return {
    async info() {
      return (await query()).info;
    },
    async openSettings() {
      const { info, appSettings } = await query();
      if (!info.supported) return { ...info, opened: false, uri: null };
      const parameter =
        info.registrationScope === "user"
          ? "registeredAppUser"
          : "registeredAppMachine";
      const uri =
        info.registered && appSettings
          ? `ms-settings:defaultapps?${parameter}=${encodeURIComponent(REGISTERED_NAME)}`
          : "ms-settings:defaultapps";
      await shell.openExternal(uri);
      return { ...info, opened: true, uri };
    },
  };
}

module.exports = { createDefaultApps };
