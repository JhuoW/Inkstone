const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  UpdateService,
  compareVersions,
  updateErrors,
} = require("../electron/updates.cjs");

// A stand-in for electron-updater's autoUpdater.
function fakeUpdater({ version = "0.9.3", fail = {} } = {}) {
  const updater = new EventEmitter();
  updater.calls = [];
  updater.checkForUpdates = async () => {
    updater.calls.push("check");
    if (fail.check) throw new Error("getaddrinfo ENOTFOUND github.com");
    return { updateInfo: { version } };
  };
  updater.downloadUpdate = async () => {
    updater.calls.push("download");
    updater.emit("download-progress", { percent: 41.7 });
    if (fail.download) throw new Error("sha512 checksum mismatch");
    updater.emit("download-progress", { percent: 100 });
    return ["installer.exe"];
  };
  updater.quitAndInstall = (silent, runAfter) =>
    updater.calls.push(`install:${silent}:${runAfter}`);
  return updater;
}
const service = (updater, options = {}) => {
  const published = [];
  const instance = new UpdateService({
    updater,
    version: "0.9.2",
    canInstall: true,
    publish: (state) => published.push(state),
    ...options,
  });
  return { instance, published };
};

test("versions compare numerically and ignore a v prefix or pre-release suffix", () => {
  assert.equal(compareVersions("0.10.0", "0.9.2"), 1);
  assert.equal(compareVersions("v0.9.2", "0.9.2"), 0);
  assert.equal(compareVersions("0.9.2", "0.9.10"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), 0);
});

test("the updater never downloads or installs without being asked", () => {
  const updater = fakeUpdater();
  service(updater);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
});

test("installing on quit can be switched off, as every update test does", () => {
  const updater = fakeUpdater();
  service(updater, { installOnQuit: false });
  assert.equal(updater.autoInstallOnAppQuit, false);
});

test("a newer release becomes available; the same version is current", async () => {
  const { instance, published } = service(fakeUpdater());
  const state = await instance.check({ manual: true });
  assert.equal(state.status, "available");
  assert.equal(state.version, "0.9.3");
  assert.equal(
    state.releaseURL,
    "https://github.com/JhuoW/Inkstone/releases/tag/v0.9.3",
  );
  assert.deepEqual(
    published.map((value) => value.status),
    ["checking", "available"],
  );
  const same = service(fakeUpdater({ version: "0.9.2" })).instance;
  assert.equal((await same.check()).status, "current");
  const older = service(fakeUpdater({ version: "0.9.1" })).instance;
  assert.equal((await older.check()).status, "current");
});

test("concurrent checks share one request", async () => {
  const updater = fakeUpdater();
  const { instance } = service(updater);
  const [first, second] = await Promise.all([
    instance.check(),
    instance.check({ manual: true }),
  ]);
  assert.deepEqual(first, second);
  assert.deepEqual(updater.calls, ["check"]);
});

test("a failed check reports a short message, not the library error", async () => {
  const { instance } = service(fakeUpdater({ fail: { check: true } }));
  const state = await instance.check();
  assert.equal(state.status, "error");
  assert.equal(state.phase, "check");
  assert.equal(state.error, updateErrors.check);
});

test("downloading reports progress, then installs only through restart", async () => {
  const updater = fakeUpdater();
  const { instance, published } = service(updater);
  await assert.rejects(instance.download(), {
    message: updateErrors.nothingToDownload,
  });
  assert.throws(() => instance.installAndRestart(), {
    message: updateErrors.nothingToInstall,
  });
  await instance.check();
  const done = await instance.download();
  assert.equal(done.status, "downloaded");
  assert.equal(done.version, "0.9.3");
  assert.ok(
    published.some(
      (value) => value.status === "downloading" && value.percent === 41,
    ),
  );
  // A later check keeps the downloaded update instead of forgetting it.
  assert.equal((await instance.check()).status, "downloaded");
  instance.installAndRestart();
  assert.deepEqual(updater.calls, ["check", "download", "install:true:true"]);
});

test("a failed download can be retried", async () => {
  const updater = fakeUpdater({ fail: { download: true } });
  const { instance } = service(updater);
  await instance.check();
  const failed = await instance.download();
  assert.equal(failed.status, "error");
  assert.equal(failed.phase, "download");
  assert.equal(failed.error, updateErrors.download);
  assert.equal(failed.version, "0.9.3");
  updater.downloadUpdate = async () => ["installer.exe"];
  assert.equal((await instance.download()).status, "downloaded");
});

test("builds that cannot install still check, but send people to the release page", async () => {
  const { instance } = service(fakeUpdater(), { canInstall: false });
  const state = await instance.check();
  assert.equal(state.status, "available");
  assert.equal(state.canInstall, false);
  await assert.rejects(instance.download(), {
    message: updateErrors.manualOnly,
  });
});

test("without an updater, nothing is checked", async () => {
  const { instance, published } = service(null);
  const state = await instance.check({ manual: true });
  assert.equal(state.status, "unsupported");
  assert.equal(state.canInstall, false);
  assert.deepEqual(published, []);
});
