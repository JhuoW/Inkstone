"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  resolveSystemLanguage,
  initialLanguage,
} = require("../electron/language.cjs");

test("Windows English display language wins over a Chinese preferred language list", async () => {
  let observed;
  const locale = await resolveSystemLanguage(["zh-CN", "en-US"], {
    platform: "win32",
    execFile: async (...args) => {
      observed = args;
      return { stdout: "1033\r\n" };
    },
  });
  assert.equal(locale, "en");
  assert.equal(observed[2].windowsHide, true);
  assert.equal(observed[2].timeout, 5000);
  const script = Buffer.from(observed[1].at(-1), "base64").toString("utf16le");
  assert.match(script, /GetUserDefaultUILanguage/);
  assert.doesNotMatch(script, /Set-|WriteReg|UserChoice/);
});
test("Windows Chinese display variants default to Simplified Chinese", async () => {
  for (const id of [2052, 1028, 3076, 4100, 5124]) {
    assert.equal(
      await resolveSystemLanguage(["en-US"], {
        platform: "win32",
        execFile: async () => ({ stdout: String(id) }),
      }),
      "zh-CN",
    );
  }
});
test("non-Chinese UI languages and unavailable native queries have predictable fallbacks", async () => {
  assert.equal(
    await resolveSystemLanguage(["zh-CN"], {
      platform: "win32",
      execFile: async () => ({ stdout: "1041" }),
    }),
    "en",
  );
  for (const stdout of ["", "invalid", "0", "65536"]) {
    assert.equal(
      await resolveSystemLanguage(["zh-CN"], {
        platform: "win32",
        execFile: async () => ({ stdout }),
      }),
      "zh-CN",
    );
  }
  assert.equal(
    await resolveSystemLanguage(["en-US"], {
      platform: "win32",
      execFile: async () => {
        throw Error("Unavailable");
      },
    }),
    "en",
  );
  assert.equal(
    await resolveSystemLanguage(["zh-TW"], {
      platform: "linux",
      execFile: async () => {
        throw Error("Must not run");
      },
    }),
    "zh-CN",
  );
});
test("saved and installer language choices never need another native locale query", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-language-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const forbidden = async () => {
    throw Error("Unexpected native query");
  };
  assert.equal(
    (await initialLanguage({ locale: "zh-CN" }, dir, forbidden)).locale,
    "zh-CN",
  );
  await fs.writeFile(
    path.join(dir, "installer-locale.json"),
    JSON.stringify({ locale: "en", configured: true }),
  );
  assert.deepEqual(await initialLanguage({}, dir, forbidden), {
    locale: "en",
    configured: true,
    installerSeed: true,
  });
});
test("a fresh profile resolves the actual Windows UI locale lazily once", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-language-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let calls = 0;
  assert.deepEqual(
    await initialLanguage({}, dir, async () => {
      calls++;
      return "en";
    }),
    { locale: "en", configured: false },
  );
  assert.equal(calls, 1);
});
