import { modal, esc } from "./ui.js";
import { brandMark } from "./branding.js";
import { getLocale } from "./i18n.js";
import "./about-dialog.css";

const projectURL = "https://github.com/JhuoW/Inkstone";
const contributorURL = "https://wei2hu0.github.io/";
const licenseURL = "https://www.gnu.org/licenses/agpl-3.0.html";
const dialogs = new WeakMap();

/** Runtime metadata and the actual bundled LICENSE are provided by getAboutInfo. */
export function showAbout(info, invoke, { locale = getLocale() } = {}) {
  const previous = dialogs.get(document);
  if (previous?.el.isConnected) {
    previous.el.querySelector("[data-about-close]").focus();
    return previous;
  }
  const t = (zh, en) => (locale === "zh-CN" ? zh : en);
  const version =
    typeof info?.version === "string" && info.version.trim()
      ? info.version.trim()
      : t("版本信息不可用", "Version unavailable");
  const licenseText =
    typeof info?.licenseText === "string" ? info.licenseText : "";
  const contributorNames = Array.isArray(info?.contributors)
    ? info.contributors.filter(
        (name) => typeof name === "string" && name.trim(),
      )
    : typeof info?.contributors === "string" && info.contributors.trim()
      ? [info.contributors]
      : [];
  const contributors = (
    contributorNames.length ? contributorNames : ["Wei Zhuo"]
  )
    .map((name) =>
      name === "Wei Zhuo"
        ? `<a href="${contributorURL}" data-about-contributor>${esc(name)}</a>`
        : esc(name),
    )
    .join(" · ");
  const copyright =
    typeof info?.copyright === "string" && info.copyright.trim()
      ? info.copyright
      : t("© Inkstone 贡献者", "© Inkstone contributors");
  const title = t("关于 Inkstone", "About Inkstone");
  const d = modal(
    title,
    `
    <div class="about-overview" data-about-overview>
      <div class="about-hero">
        <div class="about-artwork" aria-hidden="true">${brandMark()}</div>
        <div class="about-identity">
          <p class="about-eyebrow">${t("Markdown 编辑器", "Markdown editor")}</p>
          <h3 class="about-product">Inkstone <span lang="zh-CN">墨石</span></h3>
          <p class="about-version"><span>${t("版本", "Version")}</span> <strong data-about-version>${esc(version)}</strong></p>
        </div>
      </div>
      <p class="about-description" data-about-description>${t("让想法落在纸上", "A place for your thoughts")}</p>
      <dl class="about-details">
        <div><dt>${t("项目源码", "Source code")}</dt><dd><a href="${projectURL}" data-about-source>${t("在 GitHub 查看 Inkstone", "Inkstone on GitHub")} <span aria-hidden="true">↗</span></a></dd></div>
        <div><dt>${t("开源许可", "License")}</dt><dd class="about-license-row"><span class="about-license-badge">AGPL-3.0</span><button type="button" class="about-text-button" data-about-view-license ${licenseText ? "" : "disabled"}>${t("查看许可证", "View license")}</button></dd></div>
        <div><dt>${t("贡献者", "Contributors")}</dt><dd data-about-contributors>${contributors}</dd></div>
      </dl>
      <p class="about-copyright" data-about-copyright>${esc(copyright)}</p>
    </div>
    <section class="about-license-view" data-about-license-view hidden>
      <div class="about-license-navigation"><button type="button" class="about-text-button" data-about-back><span aria-hidden="true">←</span> ${t("返回关于", "Back to About")}</button><a href="${licenseURL}" data-about-license-link>${t("GNU 官方说明", "GNU license page")} <span aria-hidden="true">↗</span></a></div>
      <h3 class="about-license-title" data-about-license-title>GNU Affero General Public License</h3>
      <p class="about-license-intro" data-about-license-intro>${t("以下为此安装包随附的许可证原文，可离线阅读和复制。", "The license text bundled with this installation is available below, including offline.")}</p>
      <pre class="about-license-text" data-about-license-text tabindex="0" role="region" aria-label="${t("许可证全文", "Full license text")}" lang="en"></pre>
    </section>
    <p class="about-message" data-about-message role="status" aria-live="polite" ${licenseText ? "hidden" : ""}>${licenseText ? "" : t("此安装包中的许可证文本不可用。", "The bundled license text is unavailable in this installation.")}</p>
    <footer class="about-footer"><span class="about-footer-note">${t("本地文稿，自由书写。", "Local files. Room to write.")}</span><button type="button" class="primary" data-about-close>${t("关闭", "Close")}</button></footer>
  `,
  );
  d.el.classList.add("about-dialog");
  dialogs.set(document, d);
  const overview = d.el.querySelector("[data-about-overview]");
  const licenseView = d.el.querySelector("[data-about-license-view]");
  const licenseButton = d.el.querySelector("[data-about-view-license]");
  const licenseRegion = d.el.querySelector("[data-about-license-text]");
  const description = d.el.querySelector("[data-about-description]");
  const licenseIntro = d.el.querySelector("[data-about-license-intro]");
  const heading = d.el.querySelector("header h2");
  const message = d.el.querySelector("[data-about-message]");
  description.id = `${heading.id}-description`;
  licenseIntro.id = `${heading.id}-license-description`;
  d.el.setAttribute("aria-describedby", description.id);
  d.el
    .querySelector("header .close")
    .setAttribute("aria-label", t("关闭", "Close"));
  licenseRegion.textContent = licenseText;
  licenseButton.onclick = () => {
    overview.hidden = true;
    licenseView.hidden = false;
    heading.textContent = t("开源许可证", "Open-source license");
    d.el.setAttribute("aria-describedby", licenseIntro.id);
    licenseRegion.scrollTop = 0;
    licenseRegion.focus({ preventScroll: true });
  };
  d.el.querySelector("[data-about-back]").onclick = () => {
    licenseView.hidden = true;
    overview.hidden = false;
    heading.textContent = title;
    d.el.setAttribute("aria-describedby", description.id);
    licenseButton.focus({ preventScroll: true });
  };
  for (const [selector, url] of [
    ["[data-about-source]", projectURL],
    ["[data-about-contributor]", contributorURL],
    ["[data-about-license-link]", licenseURL],
  ]) {
    const link = d.el.querySelector(selector);
    if (!link) continue;
    link.onclick = async (event) => {
      event.preventDefault();
      try {
        await invoke("openExternal", { url });
      } catch {
        if (!d.el.isConnected) return;
        message.textContent = t(
          "无法打开链接，请重试。",
          "The link could not be opened. Try again.",
        );
        message.hidden = false;
      }
    };
  }
  d.el.querySelector("[data-about-close]").onclick = d.close;
  d.el.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.isComposing) return;
    const focusable = [
      ...d.el.querySelectorAll(
        'a[href], button:not(:disabled), [tabindex="0"]',
      ),
    ].filter(
      (element) =>
        !element.closest("[hidden]") && element.getClientRects().length > 0,
    );
    const at = focusable.indexOf(document.activeElement);
    if (!focusable.length) return;
    if (event.shiftKey ? at <= 0 : at === focusable.length - 1) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  });
  d.el.addEventListener(
    "close",
    () => {
      if (dialogs.get(document) === d) dialogs.delete(document);
    },
    { once: true },
  );
  d.el.querySelector("[data-about-close]").focus({ preventScroll: true });
  return d;
}
