"use strict";
/**
 * Update checks against GitHub Releases through electron-updater.
 *
 * Checking only reads release metadata; nothing is downloaded until the user
 * asks. Windows installer and Linux AppImage builds download and install the
 * update themselves. Other builds (deb, tar.gz) point to the release page.
 * A downloaded update installs when the app quits, or right away through
 * "restart to update", which first goes through the normal unsaved-changes
 * prompts.
 */
const RELEASES = "https://github.com/JhuoW/Inkstone/releases";

const errors = {
  check:
    "UPDATE: Could not check for updates. Check the network connection and try again.",
  download:
    "UPDATE: The update could not be downloaded. Try again, or download it from the release page.",
  manualOnly:
    "UPDATE: This copy of Inkstone installs updates from the release page.",
  nothingToDownload: "UPDATE: No update is available to download.",
  nothingToInstall: "UPDATE: No downloaded update is ready to install.",
};

/** Compares x.y.z versions; pre-release suffixes are ignored. */
function compareVersions(a, b) {
  const parts = (value) =>
    String(value)
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(left.length, right.length, 3); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

class UpdateService {
  /**
   * @param {object} options
   * @param {object|null} options.updater electron-updater's autoUpdater, or
   *   null when this build cannot check (for example a development run).
   * @param {string} options.version The running version.
   * @param {boolean} options.canInstall Whether this build can install updates.
   * @param {(state: object) => void} [options.publish] Receives every state.
   * @param {(error: Error) => void} [options.log] Receives library errors.
   * @param {boolean} [options.installOnQuit] Install a downloaded update when
   *   the app quits (default). Tests turn this off so that closing the app
   *   can never install anything on the machine running them.
   */
  constructor({
    updater,
    version,
    canInstall,
    publish,
    log,
    installOnQuit = true,
  }) {
    this.updater = updater || null;
    this.version = version;
    this.canInstall = Boolean(this.updater && canInstall);
    this.publish = publish;
    this.log = log;
    this.pending = null;
    this.state = {
      status: this.updater ? "idle" : "unsupported",
      current: version,
      canInstall: this.canInstall,
    };
    if (!this.updater) return;
    Object.assign(this.updater, {
      autoDownload: false,
      autoInstallOnAppQuit: installOnQuit,
      allowPrerelease: false,
      allowDowngrade: false,
      logger: null,
    });
    this.updater.on?.("download-progress", (progress) => {
      if (this.state.status !== "downloading") return;
      const percent = Math.max(
        0,
        Math.min(100, Math.floor(Number(progress?.percent) || 0)),
      );
      if (percent !== this.state.percent) this.set({ percent });
    });
  }
  snapshot() {
    return { ...this.state };
  }
  set(patch) {
    this.state = { ...this.state, ...patch };
    const state = this.snapshot();
    this.publish?.(state);
    return state;
  }
  releaseURL(version) {
    return version ? `${RELEASES}/tag/v${version}` : `${RELEASES}/latest`;
  }
  /** Looks for a newer release. Resolves with the resulting state. */
  check({ manual = false } = {}) {
    if (!this.updater) return Promise.resolve(this.snapshot());
    // A found or downloaded update stays put until it is installed.
    if (["downloading", "downloaded"].includes(this.state.status))
      return Promise.resolve(this.snapshot());
    if (this.pending) return this.pending;
    this.pending = (async () => {
      this.set({
        status: "checking",
        manual,
        error: undefined,
        phase: undefined,
      });
      try {
        const result = await this.updater.checkForUpdates();
        const version = result?.updateInfo?.version;
        if (version && compareVersions(version, this.version) > 0)
          return this.set({
            status: "available",
            version,
            releaseURL: this.releaseURL(version),
            percent: undefined,
          });
        return this.set({ status: "current", version: undefined });
      } catch (error) {
        this.log?.(error);
        return this.set({
          status: "error",
          phase: "check",
          error: errors.check,
        });
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }
  /** Downloads the update found by the last check. */
  async download() {
    if (!this.canInstall) throw Error(errors.manualOnly);
    if (["downloading", "downloaded"].includes(this.state.status))
      return this.snapshot();
    const retry =
      this.state.status === "error" && this.state.phase === "download";
    if (this.state.status !== "available" && !retry)
      throw Error(errors.nothingToDownload);
    this.set({
      status: "downloading",
      percent: 0,
      error: undefined,
      phase: undefined,
    });
    try {
      await this.updater.downloadUpdate();
      return this.set({ status: "downloaded", percent: 100 });
    } catch (error) {
      this.log?.(error);
      return this.set({
        status: "error",
        phase: "download",
        error: errors.download,
        percent: undefined,
      });
    }
  }
  /** Throws unless an update is ready; call before asking windows to close. */
  assertReady() {
    if (this.state.status !== "downloaded")
      throw Error(errors.nothingToInstall);
  }
  /** Installs the downloaded update and starts the new version. */
  installAndRestart() {
    this.assertReady();
    this.updater.quitAndInstall(true, true);
  }
}

module.exports = { UpdateService, compareVersions, updateErrors: errors };
