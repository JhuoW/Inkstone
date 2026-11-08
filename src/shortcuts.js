const modifierNames = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  meta: "Meta",
  alt: "Alt",
  shift: "Shift",
};
const keyNames = {
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  plus: "+",
  minus: "-",
};

function parseShortcut(binding) {
  if (typeof binding !== "string" || !binding.trim() || binding.length > 128)
    return null;
  const raw = binding.trim();
  const parts = raw.endsWith("--")
    ? [...raw.slice(0, -2).split("-").filter(Boolean), "-"]
    : raw.split("-");
  const value = parts.pop();
  if (!value || parts.some((part) => !part)) return null;
  const modifiers = parts.map((part) =>
    Object.hasOwn(modifierNames, part.toLowerCase())
      ? modifierNames[part.toLowerCase()]
      : null,
  );
  if (
    modifiers.some((part) => !part) ||
    new Set(modifiers).size !== modifiers.length
  )
    return null;
  let key = Object.hasOwn(keyNames, value.toLowerCase())
    ? keyNames[value.toLowerCase()]
    : null;
  if (!key && /^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(value))
    key = value.toUpperCase();
  if (
    !key &&
    value.length === 1 &&
    "abcdefghijklmnopqrstuvwxyz0123456789,./;=[]\\'`+-".includes(
      value.toLowerCase(),
    )
  )
    key = value.toLowerCase();
  return key ? { key, modifiers } : null;
}

/** Use the same key aliases accepted by the native menu in CodeMirror keymaps. */
export function normalizeShortcut(binding) {
  const parsed = parseShortcut(binding);
  return parsed ? [...parsed.modifiers, parsed.key].join("-") : null;
}

/** Match native menu shortcut spelling against Chromium KeyboardEvent keys. */
export function shortcutMatches(event, binding) {
  const parsed = parseShortcut(binding);
  if (!parsed || typeof event?.key !== "string" || event.isComposing)
    return false;
  const key = parsed.key === "Space" ? " " : parsed.key;
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    Boolean(event.ctrlKey) === parsed.modifiers.includes("Ctrl") &&
    Boolean(event.metaKey) === parsed.modifiers.includes("Meta") &&
    Boolean(event.altKey) === parsed.modifiers.includes("Alt") &&
    // '+' may be a numpad key or a shifted character on the main keyboard.
    ((key === "+" && !parsed.modifiers.includes("Shift")) ||
      Boolean(event.shiftKey) === parsed.modifiers.includes("Shift"))
  );
}
