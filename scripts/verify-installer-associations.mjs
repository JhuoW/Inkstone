import { artifactPath } from "./artifact-path.mjs";
import { findNsisCompiler } from "./nsis-compiler.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32")
  throw new Error("This registry verification requires native Windows.");
const root = process.cwd();
const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
assert.ok(
  manifest.build.fileAssociations.every(
    ({ name }) => name === "Inkstone.Markdown",
  ),
  "Installer associations must use the Inkstone-specific ProgID, never a shared document class.",
);
const output = artifactPath("installer-association-validation");
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(root, ".tools"), { recursive: true });
const work = await fs.mkdtemp(path.join(root, ".tools", "association-hook-"));
const token = randomUUID().replaceAll("-", "");
const existingExtension = `.inkstone_fixture_${token}_existing`;
const blankExtension = `.inkstone_fixture_${token}_blank`;
const otherClass = `Inkstone.AssociationFixture.Other.${token}`;
const ownClass = `Inkstone.AssociationFixture.Own.${token}`;
const registeredApp = `Inkstone.AssociationFixture.${token}`;
const capabilitiesRoot = `Software\\${registeredApp}`;
const capabilities = `${capabilitiesRoot}\\Capabilities`;
const application = `Software\\Classes\\Applications\\${registeredApp}.exe`;
const userChoice = `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${existingExtension}`;
const capabilityExtensions = [
  existingExtension,
  blankExtension,
  `.inkstone_fixture_${token}_mdown`,
  `.inkstone_fixture_${token}_mkd`,
];
const keys = [existingExtension, blankExtension, otherClass, ownClass];
assert.match(token, /^[a-f0-9]{32}$/);
for (const key of keys) {
  assert.ok(
    key.startsWith(`.inkstone_fixture_${token}_`) || key.endsWith(`.${token}`),
  );
  assert.ok(!/[\\/'"$]/.test(key));
}
const powershell = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const ps = (script) =>
  execFileSync(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
const quotedKeys = keys.map((key) => `'${key}'`).join(",");
const registry = (action) =>
  ps(`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$keys = @(${quotedKeys})
${action}
`);
const snapshot = () =>
  JSON.parse(
    registry(`
$result = [ordered]@{}
foreach ($key in $keys) {
  $base = 'HKCU:\\Software\\Classes\\' + $key
  if (-not (Test-Path -LiteralPath $base)) { $result[$key] = $null; continue }
  $items = @((Get-Item -LiteralPath $base)) + @(Get-ChildItem -LiteralPath $base -Recurse)
  $values = [ordered]@{}
  foreach ($item in $items) {
    $relative = $item.Name.Substring(('HKEY_CURRENT_USER\\Software\\Classes\\' + $key).Length)
    foreach ($name in $item.GetValueNames()) {
      $values[$relative + '|' + $name] = @{kind=$item.GetValueKind($name).ToString(); value=$item.GetValue($name)}
    }
  }
  $result[$key] = $values
}
$result | ConvertTo-Json -Depth 6 -Compress
`),
  );
const defaultAppsSnapshot = () =>
  JSON.parse(
    ps(`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Snapshot-Tree([string]$relativePath) {
  $base = 'HKCU:\\' + $relativePath
  if (-not (Test-Path -LiteralPath $base)) { return $null }
  $values = [ordered]@{}
  $items = @((Get-Item -LiteralPath $base)) + @(Get-ChildItem -LiteralPath $base -Recurse)
  foreach ($item in $items) {
    $relative = $item.Name.Substring(('HKEY_CURRENT_USER\\' + $relativePath).Length)
    foreach ($name in $item.GetValueNames()) {
      $values[$relative + '|' + $name] = @{kind=$item.GetValueKind($name).ToString(); value=$item.GetValue($name)}
    }
  }
  return $values
}
$registration = $null
$registeredKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\RegisteredApplications')
if ($null -ne $registeredKey) {
  $registration = $registeredKey.GetValue('${registeredApp}', $null)
  $registeredKey.Close()
}
[ordered]@{
  registeredApplication=$registration
  capabilities=(Snapshot-Tree '${capabilities}')
  application=(Snapshot-Tree '${application}')
  userChoice=(Snapshot-Tree '${userChoice}')
} | ConvertTo-Json -Depth 7 -Compress
`),
  );
const executable = path.join(work, "association-hook.exe");
const testInstallDir = path.join(work, "Program Files", "Inkstone 安装测试");
let registered, unregistered, defaultsRegistered, defaultsUnregistered;
let changedValuesPreserved = false,
  replacementInstallationPreserved = false;
let ownsNamespace = false;
try {
  registry(
    `foreach ($key in $keys) { if (Test-Path -LiteralPath ('HKCU:\\Software\\Classes\\' + $key)) { throw 'Fixture registry namespace already exists.' } }`,
  );
  const emptyDefaults = defaultAppsSnapshot();
  assert.deepEqual(
    emptyDefaults,
    {
      registeredApplication: null,
      capabilities: null,
      application: null,
      userChoice: null,
    },
    "Fixture default-app registry namespace already exists.",
  );
  ownsNamespace = true;
  const compiler = await findNsisCompiler();
  const compile = execFileSync(
    compiler.executablePath,
    [
      `/DINKSTONE_REPO=${root}`,
      `/DFILE_ASSOCIATIONS_INCLUDE=${path.join(root, "node_modules/app-builder-lib/templates/nsis/include/FileAssociation.nsh")}`,
      `/DINKSTONE_INSTALLER_INCLUDE=${path.join(root, "build/installer.nsh")}`,
      `/DBUILD_RESOURCES_DIR=${path.join(root, "build")}`,
      `/DOUTPUT_EXE=${executable}`,
      `/DTEST_INSTALL_DIR=${testInstallDir}`,
      `/DTEST_TOKEN=${token}`,
      path.join(root, "tests/fixtures/installer-associations.nsi"),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
      env: { ...process.env, NSISDIR: compiler.nsisDir },
    },
  );
  await fs.writeFile(path.join(output, "compile.log"), compile);
  execFileSync(executable, [], { windowsHide: true, timeout: 30000 });
  registered = snapshot();
  defaultsRegistered = defaultAppsSnapshot();
  assert.equal(registered[existingExtension]["|"].value, otherClass);
  assert.equal(Object.hasOwn(registered[blankExtension], "|"), false);
  assert.equal(
    registered[existingExtension]["|FixtureSentinel"].value,
    "preserve-extension-data",
  );
  assert.equal(
    registered[blankExtension]["|FixtureSentinel"].value,
    "preserve-blank-extension-data",
  );
  for (const extension of [existingExtension, blankExtension]) {
    assert.equal(
      registered[extension][`\\OpenWithProgids|${ownClass}`].kind,
      "None",
    );
    assert.equal(
      registered[extension][`\\OpenWithProgids|${otherClass}`].kind,
      "None",
    );
  }
  const appExe = path.join(testInstallDir, "Inkstone.exe");
  assert.equal(registered[ownClass]["|"].value, "Markdown document");
  assert.equal(registered[ownClass]["\\DefaultIcon|"].value, `${appExe},0`);
  assert.equal(registered[ownClass]["\\shell|"].value, "open");
  assert.equal(
    registered[ownClass]["\\shell\\open|"].value,
    "Open with Inkstone",
  );
  assert.equal(
    registered[ownClass]["\\shell\\open\\command|"].value,
    `"${appExe}" "%1"`,
  );
  assert.equal(defaultsRegistered.registeredApplication, capabilities);
  assert.equal(
    defaultsRegistered.capabilities["|ApplicationName"].value,
    registeredApp,
  );
  assert.equal(
    defaultsRegistered.capabilities["|ApplicationDescription"].value,
    "Inkstone Markdown editor",
  );
  assert.equal(
    defaultsRegistered.capabilities["|ApplicationIcon"].value,
    `"${appExe}",0`,
  );
  assert.equal(
    defaultsRegistered.application["|FriendlyAppName"].value,
    registeredApp,
  );
  assert.equal(
    defaultsRegistered.application["\\DefaultIcon|"].value,
    `"${appExe}",0`,
  );
  assert.equal(
    defaultsRegistered.application["\\shell\\open\\command|"].value,
    `"${appExe}" "%1"`,
  );
  for (const extension of capabilityExtensions) {
    assert.equal(
      defaultsRegistered.capabilities[`\\FileAssociations|${extension}`].value,
      ownClass,
    );
    assert.equal(
      defaultsRegistered.application[`\\SupportedTypes|${extension}`].value,
      "",
    );
  }
  assert.equal(
    defaultsRegistered.userChoice["\\UserChoice|ProgId"].value,
    otherClass,
  );
  assert.equal(
    defaultsRegistered.userChoice["\\UserChoice|Hash"].value,
    "fixture-user-choice-preserved",
  );

  execFileSync(executable, ["/change-values"], {
    windowsHide: true,
    timeout: 30000,
  });
  const changedDefaults = defaultAppsSnapshot();
  execFileSync(executable, ["/unregister"], {
    windowsHide: true,
    timeout: 30000,
  });
  defaultsUnregistered = defaultAppsSnapshot();
  assert.equal(defaultsUnregistered.registeredApplication, null);
  assert.deepEqual(
    defaultsUnregistered.userChoice,
    defaultsRegistered.userChoice,
  );
  const expectedCapabilities = { ...changedDefaults.capabilities };
  delete expectedCapabilities["|ApplicationName"];
  delete expectedCapabilities["|ApplicationIcon"];
  const expectedApplication = { ...changedDefaults.application };
  delete expectedApplication["|FriendlyAppName"];
  delete expectedApplication["\\DefaultIcon|"];
  delete expectedApplication["\\shell\\open\\command|"];
  for (const extension of capabilityExtensions.slice(0, 3)) {
    delete expectedCapabilities[`\\FileAssociations|${extension}`];
    delete expectedApplication[`\\SupportedTypes|${extension}`];
  }
  assert.deepEqual(defaultsUnregistered.capabilities, expectedCapabilities);
  assert.deepEqual(defaultsUnregistered.application, expectedApplication);
  changedValuesPreserved = true;
  unregistered = snapshot();
  assert.equal(unregistered[ownClass], null);
  assert.deepEqual(unregistered[otherClass], registered[otherClass]);
  for (const extension of [existingExtension, blankExtension]) {
    const expected = { ...registered[extension] };
    delete expected[`\\OpenWithProgids|${ownClass}`];
    assert.deepEqual(unregistered[extension], expected);
  }

  // Replacing the command simulates a newer install sharing this product ID.
  execFileSync(executable, [], { windowsHide: true, timeout: 30000 });
  execFileSync(executable, ["/replace-owner"], {
    windowsHide: true,
    timeout: 30000,
  });
  const replacementClasses = snapshot(),
    replacementDefaults = defaultAppsSnapshot();
  execFileSync(executable, ["/unregister"], {
    windowsHide: true,
    timeout: 30000,
  });
  assert.deepEqual(snapshot(), replacementClasses);
  assert.deepEqual(defaultAppsSnapshot(), replacementDefaults);
  replacementInstallationPreserved = true;

  // With no unrelated values or verbs, cleanup also removes empty owned keys.
  execFileSync(executable, [], { windowsHide: true, timeout: 30000 });
  execFileSync(executable, ["/remove-sentinels"], {
    windowsHide: true,
    timeout: 30000,
  });
  execFileSync(executable, ["/unregister"], {
    windowsHide: true,
    timeout: 30000,
  });
  const cleanDefaults = defaultAppsSnapshot();
  assert.equal(cleanDefaults.registeredApplication, null);
  assert.equal(cleanDefaults.capabilities, null);
  assert.equal(cleanDefaults.application, null);
  assert.deepEqual(cleanDefaults.userChoice, defaultsRegistered.userChoice);
} finally {
  // The generated namespace is validated above; never touch real document keys.
  if (ownsNamespace)
    registry(
      `foreach ($key in $keys) { $target = 'HKCU:\\Software\\Classes\\' + $key; if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force } }`,
    );
  if (ownsNamespace)
    ps(`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
foreach ($relative in @('${capabilitiesRoot}', '${application}', '${userChoice}')) {
  $target = 'HKCU:\\' + $relative
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
$registeredKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\RegisteredApplications', $true)
if ($null -ne $registeredKey) {
  $registeredKey.DeleteValue('${registeredApp}', $false)
  $registeredKey.Close()
}
`);
}
assert.deepEqual(
  snapshot(),
  Object.fromEntries(keys.map((key) => [key, null])),
);
assert.deepEqual(defaultAppsSnapshot(), {
  registeredApplication: null,
  capabilities: null,
  application: null,
  userChoice: null,
});
const result = {
  version: manifest.version,
  progId: "Inkstone.Markdown",
  passed: true,
  runtime: "native Windows NSIS",
  existingDefaultPreserved: true,
  blankDefaultRemainsAbsent: true,
  ownOpenWithRegistered: true,
  iconRegistered: true,
  quotedOpenCommand: true,
  chineseInstallPath: true,
  unrelatedClassPreserved: true,
  uninstallRemovesOnlyOwnEntries: true,
  defaultAppsCapabilitiesRegistered: true,
  fourMarkdownExtensionsRegistered: true,
  applicationsSupportedTypesRegistered: true,
  userChoiceAndHashPreserved: true,
  changedValuesPreserved,
  replacementInstallationPreserved,
  emptyOwnedRegistryKeysRemoved: true,
  disposableRegistryKeysCleaned: true,
  scope:
    "Actual registration/unregistration macros with disposable random extensions and ProgIDs; no real Markdown associations or application install modified.",
  registered,
  unregistered,
  defaultsRegistered,
  defaultsUnregistered,
};
await fs.writeFile(
  path.join(output, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    ...result,
    registered: undefined,
    unregistered: undefined,
    defaultsRegistered: undefined,
    defaultsUnregistered: undefined,
  }),
);
