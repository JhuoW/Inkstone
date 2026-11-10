import { $, esc, icon, toast } from "./ui.js";
import { t } from "./i18n.js";
import { displayError } from "./errors.js";

// Update status from the desktop process. An available, downloading or
// downloaded update shows a notice above the editor; checks the user starts
// also report "up to date" and errors. Automatic checks stay quiet otherwise.
export function createUpdateNotice({ invoke, native }) {
  let state = null;
  let hidden = "";
  const name = () => t("墨石", "Inkstone");
  const key = (value) => `${value?.status}:${value?.version}`;
  const latest = "https://github.com/JhuoW/Inkstone/releases/latest";

  function visible(value) {
    if (!value || key(value) === hidden) return false;
    if (["available", "downloading", "downloaded"].includes(value.status))
      return Boolean(value.version);
    return value.status === "error" && value.phase === "download";
  }
  function button(action, label, primary = false) {
    return `<button type="button" data-update="${action}"${primary ? ' class="primary"' : ""}>${label}</button>`;
  }
  function render() {
    const host = $("#update-notice");
    if (!host) return;
    host.hidden = !visible(state);
    if (host.hidden) return host.replaceChildren();
    const version = esc(state.version || "");
    const product = `<strong>${name()} ${version}</strong>`;
    let content = "";
    if (state.status === "available")
      content =
        `<span>${t(`${product} 已发布。`, `${product} is available.`)}</span>` +
        (state.canInstall
          ? button("download", t("下载并安装", "Download and install"), true) +
            button("page", t("更新说明", "What's new"))
          : button("page", t("前往下载", "Open download page"), true));
    else if (state.status === "downloading")
      content =
        `<span>${t(`正在下载${product}…`, `Downloading ${product}…`)}</span>` +
        `<progress max="100" value="${Number(state.percent) || 0}" aria-label="${t("下载进度", "Download progress")}"></progress>` +
        `<span class="update-percent">${Number(state.percent) || 0}%</span>`;
    else if (state.status === "downloaded")
      content =
        `<span>${t(
          `${product} 已下载。重启即可完成更新，退出时也会自动安装。`,
          `${product} is ready. Restart to finish updating, or it installs when you quit.`,
        )}</span>` + button("restart", t("立即重启", "Restart now"), true);
    else
      content =
        `<span>${esc(displayError(state.error))}</span>` +
        button("download", t("重试", "Try again"), true) +
        button("page", t("前往下载", "Open download page"));
    host.innerHTML =
      content +
      `<button type="button" class="icon-button update-dismiss" data-update="hide" aria-label="${t("暂时隐藏", "Hide for now")}" title="${t("暂时隐藏", "Hide for now")}">${icon.close}</button>`;
    for (const element of host.querySelectorAll("[data-update]"))
      element.onclick = () => void act(element.dataset.update);
  }
  async function act(action) {
    try {
      if (action === "hide") {
        hidden = key(state);
        return render();
      }
      if (action === "page")
        return await invoke("openExternal", {
          url: state?.releaseURL || latest,
        });
      if (action === "download") return update(await invoke("downloadUpdate"));
      if (action === "restart") return await invoke("restartToUpdate");
    } catch (error) {
      toast(error, true);
    }
  }
  function update(next) {
    if (next && typeof next === "object") state = next;
    render();
  }
  native?.on("update-status", update);
  void invoke("getUpdateStatus")
    .then(update)
    .catch(() => {});

  /** Runs a check the user asked for and reports the outcome. */
  async function check() {
    toast(t("正在检查更新…", "Checking for updates…"));
    const result = await invoke("checkForUpdates");
    hidden = "";
    update(result);
    if (result.status === "unsupported")
      toast(
        t(
          "这个版本不会自动检查更新，新版本请到发布页面下载。",
          "This copy of Inkstone does not check for updates. Get new versions from the release page.",
        ),
      );
    else if (result.status === "current")
      toast(
        t(
          `已是最新版本（${result.current}）。`,
          `Inkstone ${result.current} is up to date.`,
        ),
      );
    else if (result.status === "error") toast(result.error, true);
    else if (result.version)
      toast(
        t(
          `${name()} ${result.version} 已发布。`,
          `${name()} ${result.version} is available.`,
        ),
      );
    return result;
  }
  return { check, refresh: render, state: () => state };
}
