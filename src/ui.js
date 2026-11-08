import { brandMark } from "./branding.js";
import { t } from "./i18n.js";
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];
export function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
let timer;
export function toast(message, error = false) {
  const el = $("#toast");
  if (!el) return;
  el.hidden = false;
  el.replaceChildren();
  const content = document.createElement("span");
  content.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "toast-dismiss";
  dismiss.innerHTML = icon.close;
  dismiss.setAttribute("aria-label", t("关闭通知", "Dismiss notification"));
  dismiss.onclick = () => {
    clearTimeout(timer);
    el.className = "";
    el.hidden = true;
  };
  el.append(content, dismiss);
  el.setAttribute("role", error ? "alert" : "status");
  el.setAttribute("aria-live", error ? "assertive" : "polite");
  el.setAttribute("aria-atomic", "true");
  el.className = error ? "visible error" : "visible";
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        el.className = "";
        el.hidden = true;
      },
      error ? 12000 : 5000,
    );
  };
  el.onpointerenter = el.onfocusin = () => clearTimeout(timer);
  el.onpointerleave = schedule;
  el.onfocusout = (event) => {
    if (!el.contains(event.relatedTarget)) schedule();
  };
  schedule();
}
let dialogSequence = 0;
export function modal(title, content, { wide = false } = {}) {
  const previous = document.activeElement;
  const el = document.createElement("dialog");
  const titleId = "dialog-title-" + ++dialogSequence;
  el.className = wide ? "modal wide" : "modal";
  el.setAttribute("aria-labelledby", titleId);
  el.setAttribute("aria-modal", "true");
  el.innerHTML =
    '<header><h2 id="' +
    titleId +
    '">' +
    esc(title) +
    '</h2><button type="button" class="icon-button close" aria-label="' +
    t("关闭", "Close") +
    '">' +
    icon.close +
    '</button></header><div class="modal-body">' +
    content +
    "</div>";
  document.body.append(el);
  let busy = false,
    composing = false,
    closed = false;
  const finishClose = () => {
    if (closed) return;
    closed = true;
    el.remove();
    if (previous?.isConnected && !document.querySelector("dialog[open]"))
      previous.focus({ preventScroll: true });
  };
  const close = () => {
    if (busy || closed) return false;
    el.close();
    finishClose();
    return true;
  };
  el.querySelector(".close").onclick = close;
  el.addEventListener("click", (event) => {
    if (event.target !== el) return;
    const box = el.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      close();
  });
  el.addEventListener("compositionstart", () => {
    composing = true;
  });
  el.addEventListener("compositionend", () => {
    composing = false;
  });
  el.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!busy && !composing) close();
  });
  el.addEventListener("close", finishClose);
  el.showModal();
  const focusTarget =
    el.querySelector(
      '[autofocus], input:not([type="checkbox"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
    ) ||
    el.querySelector(
      "footer button:not([disabled]), .modal-body button:not([disabled])",
    );
  focusTarget?.focus({ preventScroll: true });
  return {
    el,
    close,
    body: el.querySelector(".modal-body"),
    setBusy(value) {
      busy = Boolean(value);
      el.setAttribute("aria-busy", String(busy));
      el.querySelector(".close").disabled = busy;
    },
  };
}
export function ask(title, message, choices) {
  return new Promise((resolve) => {
    const d = modal(
      title,
      '<p class="dialog-message">' +
        esc(message) +
        "</p><footer>" +
        choices
          .map(
            (choice, index) =>
              '<button type="button" data-choice="' +
              index +
              '" class="' +
              (index === 0 ? "primary" : "") +
              '">' +
              esc(choice.label) +
              "</button>",
          )
          .join("") +
        "</footer>",
    );
    let resolved = false;
    d.el.addEventListener("close", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
    d.el.querySelectorAll("[data-choice]").forEach((button) => {
      button.onclick = () => {
        if (resolved) return;
        resolved = true;
        resolve(choices[Number(button.dataset.choice)].value);
        d.close();
      };
    });
    d.el.querySelector("[data-choice]")?.focus({ preventScroll: true });
  });
}
export function promptText(title, label, value = "") {
  return new Promise((resolve) => {
    const d = modal(
      title,
      "<form><label>" +
        esc(label) +
        '<input name="value" value="' +
        esc(value) +
        '" required autocomplete="off"></label><footer><button type="button" data-cancel>' +
        t("取消", "Cancel") +
        '</button><button type="submit" class="primary">' +
        t("确定", "OK") +
        "</button></footer></form>",
    );
    let resolved = false;
    d.el.addEventListener("close", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
    $("[data-cancel]", d.el).onclick = d.close;
    $("form", d.el).onsubmit = (event) => {
      event.preventDefault();
      if (resolved) return;
      resolved = true;
      resolve($("input", d.el).value);
      d.close();
    };
    $("input", d.el).select();
  });
}
// One authored 20 px grid keeps controls consistent across system fonts and DPI.
const svg = (paths) =>
  `<svg class="ui-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
export const icon = {
  mark: brandMark(),
  folder: svg('<path d="M2 5h6l2 2h8v10H2Z"/>'),
  file: svg('<path d="M5 2h7l4 4v12H5Z"/><path d="M12 2v5h4M8 10h5M8 13h5"/>'),
  search: svg(
    '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.5 12.5 4.5 4.5"/>',
  ),
  outline: svg('<path d="M3 4h14M7 8h10M7 12h10M3 16h14"/>'),
  settings: svg(
    '<path d="M3 5h2m4 0h8M3 10h8m4 0h2M3 15h3m4 0h7"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/>',
  ),
  sidebar: svg(
    '<rect x="2" y="3" width="16" height="14" rx="1"/><path d="M7 3v14"/>',
  ),
  more: svg(
    '<circle cx="4" cy="10" r=".8"/><circle cx="10" cy="10" r=".8"/><circle cx="16" cy="10" r=".8"/>',
  ),
  bold: svg('<path d="M6 10h6a3 3 0 0 0 0-6H6v12h7a3 3 0 0 0 0-6Z"/>'),
  italic: svg('<path d="M8 4h7M5 16h7M12 4 8 16"/>'),
  strike: svg(
    '<path d="M14 5c-1-2-8-2-8 2 0 1.5 1 2 3 2.5M6 15c2 2 8 2 8-2 0-1-.5-1.5-1-2M3 10h14"/>',
  ),
  heading: svg('<path d="M4 4v12M12 4v12M4 10h8M15 12l2-1v6"/>'),
  quote: svg(
    '<path d="M3 5h5v5H3Zm9 0h5v5h-5ZM8 10c0 3-2 5-4 5m13-5c0 3-2 5-4 5"/>',
  ),
  bullet: svg(
    '<path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3" cy="5" r=".6"/><circle cx="3" cy="10" r=".6"/><circle cx="3" cy="15" r=".6"/>',
  ),
  task: svg(
    '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="m6 10 3 3 5-6"/>',
  ),
  link: svg(
    '<path d="m8 12 4-4M7 13l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m0 8a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1"/>',
  ),
  image: svg(
    '<rect x="2" y="3" width="16" height="14" rx="1"/><circle cx="6" cy="7" r="1"/><path d="m3 14 4-4 3 3 3-4 4 5"/>',
  ),
  table: svg(
    '<rect x="2" y="3" width="16" height="14" rx="1"/><path d="M2 8h16M2 12.5h16M7 8v9M12 8v9"/>',
  ),
  code: svg('<path d="m6 6-4 4 4 4m8-8 4 4-4 4M11.5 4l-3 12"/>'),
  preview: svg(
    '<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/>',
  ),
  pin: svg('<path d="m7 3 6 0-1 5 3 3H5l3-3ZM10 11v6"/>'),
  plus: svg('<path d="M10 3v14M3 10h14"/>'),
  chevronDown: svg('<path d="m5 8 5 5 5-5"/>'),
  chevronRight: svg('<path d="m8 5 5 5-5 5"/>'),
  close: svg('<path d="m5 5 10 10M5 15 15 5"/>'),
  export: svg('<path d="M10 13V2m-4 4 4-4 4 4M4 11v6h12v-6"/>'),
  command: svg('<path d="m3 5 5 5-5 5M11 15h6"/>'),
};

let activeMenu = null;
let menuSequence = 0;
// A native top-layer popover avoids clipping and preserves the editor selection.
export function commandMenu(anchor, items, onChoose) {
  if (activeMenu?.anchor === anchor) {
    activeMenu.close();
    return;
  }
  activeMenu?.close();
  const el = document.createElement("div");
  el.className = "command-menu";
  el.id = "command-menu-" + ++menuSequence;
  el.setAttribute("popover", "auto");
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", anchor.textContent.trim());
  for (const item of items) {
    if (item.group) {
      const label = document.createElement("div");
      label.className = "menu-group";
      label.setAttribute("role", "presentation");
      label.textContent = item.group;
      el.append(label);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.innerHTML =
      "<span>" +
      esc(item.label) +
      "</span>" +
      (item.shortcut ? "<kbd>" + esc(item.shortcut) + "</kbd>" : "");
    button.onclick = () => {
      close(true);
      onChoose(item.id);
    };
    el.append(button);
  }
  document.body.append(el);
  let closed = false;
  const close = (restoreFocus = false) => {
    if (closed) return;
    closed = true;
    el.hidePopover();
    el.remove();
    anchor.setAttribute("aria-expanded", "false");
    anchor.removeAttribute("aria-controls");
    window.removeEventListener("resize", onResize);
    if (activeMenu?.anchor === anchor) activeMenu = null;
    if (restoreFocus && anchor.isConnected)
      anchor.focus({ preventScroll: true });
  };
  const onResize = () => close();
  activeMenu = { anchor, close };
  anchor.setAttribute("aria-expanded", "true");
  anchor.setAttribute("aria-controls", el.id);
  el.showPopover();
  const box = anchor.getBoundingClientRect();
  const below = innerHeight - box.bottom - 12;
  const openBelow = below >= 120 || below >= box.top - 12;
  el.style.maxHeight = Math.max(48, openBelow ? below : box.top - 12) + "px";
  el.style.left =
    Math.max(8, Math.min(box.left, innerWidth - el.offsetWidth - 8)) + "px";
  el.style.top =
    (openBelow ? box.bottom + 4 : Math.max(8, box.top - el.offsetHeight - 4)) +
    "px";
  const buttons = [...el.querySelectorAll("button")];
  buttons[0]?.focus({ preventScroll: true });
  el.onkeydown = (event) => {
    if (event.isComposing) return;
    const at = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (at + 1) % buttons.length;
    if (event.key === "ArrowUp")
      next = (at - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      buttons[next]?.focus();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    if (event.key === "Tab") close(true);
  };
  el.addEventListener("toggle", (event) => {
    if (event.newState === "closed") close();
  });
  window.addEventListener("resize", onResize);
}
