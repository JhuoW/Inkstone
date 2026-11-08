import { modal, esc, icon, toast } from "./ui.js";

export async function offerDefaultApp(invoke, locale) {
  const offer = await invoke("claimDefaultAppPrompt");
  if (!offer?.offered) return null;
  const t = (zh, en) => (locale === "en" ? en : zh);
  const d = modal(
    t("用墨石打开 Markdown 文件", "Open Markdown files with Inkstone"),
    `<div class="default-app-welcome">${icon.mark}<p class="dialog-message">${t(
      "是否将 Inkstone 设为 Markdown 文件的默认打开应用？",
      "Would you like to make Inkstone your default Markdown app?",
    )}</p><p class="muted">${t(
      "点击下方按钮后，在 Windows 默认应用设置中选择 Inkstone。你也可以稍后在偏好设置 → 文件中更改。",
      "Choose Inkstone in Windows Default apps after clicking below. You can also do this later in Preferences → Files.",
    )}</p>${offer.currentDefault?.name ? `<p class="muted">${t("当前默认：", "Current default: ")}${esc(offer.currentDefault.name)}</p>` : ""}<footer><button type="button" data-default-later>${t("暂不设置", "Not now")}</button><button type="button" class="primary" data-default-open>${t("在 Windows 中设置", "Set in Windows")}</button></footer></div>`,
  );
  d.el.classList.add("default-app-dialog");
  d.el.querySelector("[data-default-later]").onclick = d.close;
  const openButton = d.el.querySelector("[data-default-open]");
  let opening = false;
  openButton.onclick = async () => {
    if (opening) return;
    opening = true;
    openButton.disabled = true;
    d.setBusy(true);
    try {
      const result = await invoke("openDefaultApps");
      if (!result?.opened)
        throw Error(
          t(
            "Windows 默认应用设置不可用。",
            "Windows Default apps is unavailable.",
          ),
        );
      d.setBusy(false);
      d.close();
      toast(
        t(
          "已打开 Windows 默认应用设置，请选择 Inkstone。",
          "Windows Default apps is open. Choose Inkstone to confirm.",
        ),
      );
    } catch (error) {
      d.setBusy(false);
      toast(error.message, true);
    } finally {
      opening = false;
      openButton.disabled = false;
    }
  };
  d.el.querySelector("[data-default-later]").focus();
  return d;
}
