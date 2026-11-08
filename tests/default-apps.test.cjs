"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDefaultApps } = require("../electron/default-apps.cjs");

const executable = "C:\\Apps\\Inkstone 中文\\Inkstone.exe";
function registration(overrides = {}) {
  return {
    path: "Software\\Inkstone\\Capabilities",
    name: "Inkstone",
    description: "Inkstone Markdown editor",
    extensions: Object.fromEntries(
      [".md", ".markdown", ".mdown", ".mkd"].map((extension) => [
        extension,
        "Inkstone.Markdown",
      ]),
    ),
    command: `"${executable}" "%1"`,
    ...overrides,
  };
}
function fixture(overrides = {}, options = {}) {
  const calls = [],
    opened = [];
  let response = {
    build: 26200,
    revision: 100,
    registrations: { user: registration(), machine: null },
    currentDefault: {
      progId: "Typora.md",
      name: "Typora",
      executable: "C:\\Program Files\\Typora\\Typora.exe",
    },
    ...overrides,
  };
  const helper = createDefaultApps({
    app: {
      isPackaged: true,
      getPath: (name) => {
        assert.equal(name, "exe");
        return executable;
      },
    },
    shell: {
      async openExternal(uri) {
        opened.push(uri);
      },
    },
    platform: "win32",
    async execFile(command, args, settings) {
      calls.push({ command, args, settings });
      if (response instanceof Error) throw response;
      return {
        stdout:
          typeof response === "string" ? response : JSON.stringify(response),
      };
    },
    ...options,
  });
  return {
    helper,
    calls,
    opened,
    setResponse(value) {
      response = value;
    },
  };
}

test("Windows query is fixed, encoded, hidden, time bounded and does not open settings", async () => {
  const { helper, calls, opened } = fixture();
  const info = await helper.info();
  assert.equal(info.registered, true);
  assert.equal(info.registrationScope, "user");
  assert.equal(info.requiresInstallation, false);
  assert.deepEqual(info.currentDefault, {
    progId: "Typora.md",
    name: "Typora",
    isInkstone: false,
  });
  assert.deepEqual(opened, []);
  const call = calls[0];
  assert.match(
    call.command,
    /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i,
  );
  assert.deepEqual(call.args.slice(0, 4), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
  ]);
  const script = Buffer.from(call.args[4], "base64").toString("utf16le");
  assert.match(script, /AssocQueryStringW/);
  assert.match(script, /OpenSubKey\('Software\\RegisteredApplications'\)/);
  assert.doesNotMatch(
    script,
    /SetValue|CreateSubKey|UserChoice|Set-App|SetAppAsDefault/,
  );
  assert.equal(script.includes(executable), false);
  assert.deepEqual(call.settings, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 131072,
  });
});

test("effective Inkstone status requires the actual executable, with Windows path casing", async () => {
  const currentDefault = {
    progId: "inkstone.markdown",
    name: "Inkstone 墨石",
    executable: executable.toUpperCase(),
  };
  const { helper, setResponse } = fixture({
    currentDefault,
    registrations: {
      user: registration({ command: `"${executable.toUpperCase()}" "%1"` }),
    },
  });
  assert.equal((await helper.info()).currentDefault.isInkstone, true);
  setResponse({
    registrations: {},
    currentDefault: {
      ...currentDefault,
      executable: "C:\\Other\\Inkstone.exe",
    },
  });
  assert.equal((await helper.info()).currentDefault.isInkstone, false);
});

test("unknown and missing effective associations do not name the Windows Shell as an editor", async () => {
  for (const currentDefault of [
    null,
    {},
    {
      progId: "Unknown",
      name: "Windows Shell Common Dll",
      executable: "C:\\Windows\\system32\\shell32.dll",
    },
    {
      progId: "UnknownFile",
      name: "Windows Shell Common Dll",
      executable: "C:\\Windows\\system32\\SHELL32.DLL",
    },
  ]) {
    assert.equal(
      (await fixture({ currentDefault }).helper.info()).currentDefault,
      null,
    );
  }
});

test("registration requires the fixed capabilities, all extensions, and exact quoted executable command", async () => {
  for (const invalid of [
    null,
    registration({ path: "Software\\Other\\Capabilities" }),
    registration({ name: "Other" }),
    registration({ description: "" }),
    registration({ extensions: { ".md": "Inkstone.Markdown" } }),
    registration({ command: '"C:\\Other\\Inkstone.exe" "%1"' }),
    registration({ command: `${executable} "%1"` }),
    registration({ command: `"${executable}" "%1" --other` }),
  ]) {
    const info = await fixture({
      registrations: { user: invalid },
    }).helper.info();
    assert.equal(info.registered, false);
    assert.equal(info.requiresInstallation, true);
  }
});

test("settings deep link selects verified user or machine scope on supported Windows11", async () => {
  for (const [scope, parameter] of [
    ["user", "registeredAppUser"],
    ["machine", "registeredAppMachine"],
  ]) {
    const { helper, opened } = fixture({
      registrations: { [scope]: registration() },
    });
    const result = await helper.openSettings();
    assert.equal(result.opened, true);
    assert.deepEqual(opened, [`ms-settings:defaultapps?${parameter}=Inkstone`]);
  }
});

test("portable or old Windows Settings launch stays generic and never writes registration", async () => {
  for (const overrides of [
    { registrations: {} },
    { build: 19045, revision: 9999 },
    { build: 22000, revision: 1816 },
    { build: 22621, revision: 1554 },
  ]) {
    const { helper, opened, calls } = fixture(overrides);
    await helper.openSettings();
    assert.deepEqual(opened, ["ms-settings:defaultapps"]);
    assert.equal(calls.length, 1);
  }
  for (const [build, revision] of [
    [22000, 1817],
    [22621, 1555],
    [22631, 0],
  ]) {
    const { helper, opened } = fixture({ build, revision });
    await helper.openSettings();
    assert.deepEqual(opened, [
      "ms-settings:defaultapps?registeredAppUser=Inkstone",
    ]);
  }
});

test("opening settings rechecks ownership instead of using stale query state", async () => {
  const { helper, setResponse, opened } = fixture();
  assert.equal((await helper.info()).registered, true);
  setResponse({ registrations: {}, currentDefault: null, build: 26200 });
  assert.equal((await helper.openSettings()).requiresInstallation, true);
  assert.deepEqual(opened, ["ms-settings:defaultapps"]);
});

test("query errors and invalid JSON are explicit unknown status with a generic settings fallback", async () => {
  for (const response of [
    new Error("timed out"),
    "not JSON",
    "[]",
    "null",
    "x".repeat(131073),
  ]) {
    const { helper, setResponse, opened } = fixture();
    setResponse(response);
    const info = await helper.info();
    assert.equal(info.currentDefault, null);
    assert.equal(info.registered, false);
    assert.match(info.error, /could not be checked/);
    await helper.openSettings();
    assert.deepEqual(opened, ["ms-settings:defaultapps"]);
  }
});

test("non-Windows reports unsupported without running native commands or opening settings", async () => {
  const { helper, calls, opened } = fixture({}, { platform: "linux" });
  assert.equal((await helper.info()).supported, false);
  assert.equal((await helper.info()).requiresInstallation, false);
  assert.equal((await helper.openSettings()).opened, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(opened, []);
});

test("opening errors propagate to the caller rather than reporting a successful launch", async () => {
  const { helper } = fixture(
    {},
    {
      shell: {
        async openExternal() {
          throw Error("Settings unavailable");
        },
      },
    },
  );
  await assert.rejects(helper.openSettings(), /Settings unavailable/);
});
