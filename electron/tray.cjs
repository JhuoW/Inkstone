"use strict";
/**
 * The notification-area (tray) icon. Clicking it shows Inkstone's windows;
 * its menu reopens Inkstone or a recent document, or exits through the usual
 * unsaved-changes check. On Linux, desktops show the menu on any click.
 */
const path = require("node:path");

// "&" marks a mnemonic in Windows and Linux menu labels.
const menuText = (text) => String(text).replace(/&/g, "&&");

function recentLabels(files) {
  const names = files.map((file) => path.basename(file));
  return files.map((file, index) =>
    names.indexOf(names[index]) !== names.lastIndexOf(names[index])
      ? `${names[index]} — ${path.basename(path.dirname(file))}`
      : names[index],
  );
}

function trayMenu({ localize, recentFiles = [], actions }) {
  const recent = recentFiles.slice(0, 10);
  const labels = recentLabels(recent);
  return [
    {
      label: localize("Open Inkstone", "打开 Inkstone"),
      click: () => actions.show(),
    },
    {
      label: localize("Recent Documents", "最近文档"),
      enabled: recent.length > 0,
      submenu: recent.length
        ? recent.map((file, index) => ({
            label: menuText(labels[index]),
            click: () => actions.open(file),
          }))
        : [{ label: localize("None", "无"), enabled: false }],
    },
    { type: "separator" },
    {
      label: localize("Exit Inkstone", "退出 Inkstone"),
      click: () => actions.quit(),
    },
  ];
}

function createTray({
  Tray,
  Menu,
  nativeImage,
  icon,
  platform = process.platform,
  localize,
  recentFiles = () => [],
  actions,
}) {
  let tray = null;
  const image = () =>
    // Windows picks the right size for the display from the .ico file.
    platform === "win32"
      ? icon
      : nativeImage
          .createFromPath(icon)
          .resize({ width: 32, height: 32, quality: "best" });
  const menu = () =>
    Menu.buildFromTemplate(
      trayMenu({ localize, recentFiles: recentFiles(), actions }),
    );
  const active = () => !!tray && !tray.isDestroyed();
  return {
    get active() {
      return active();
    },
    show() {
      if (active()) return tray;
      tray = new Tray(image());
      tray.setToolTip("Inkstone");
      tray.on("click", () => actions.show());
      tray.setContextMenu(menu());
      return tray;
    },
    /** Rebuilds the menu after the language or recent documents change. */
    refresh() {
      if (active()) tray.setContextMenu(menu());
    },
    destroy() {
      if (active()) tray.destroy();
      tray = null;
    },
  };
}

module.exports = { createTray, trayMenu };
