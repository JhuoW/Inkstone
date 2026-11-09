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

/** Display a binding the way menus show it, for example "Ctrl+Shift+A". */
export function formatShortcut(binding) {
  const parsed = parseShortcut(binding);
  if (!parsed) return "";
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  return [...parsed.modifiers, key].join("+");
}

const codeKeys = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  Space: "Space",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

/**
 * Convert a keydown event into a stored binding such as "Mod-Shift-a".
 * Returns undefined while only modifiers are held, and null for combinations
 * that cannot be used: no Ctrl/Alt/Meta (except function keys), or Shift with
 * punctuation whose character differs between keyboard layouts.
 */
export function bindingFromEvent(event) {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key))
    return undefined;
  const code = String(event.code || "");
  let key = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (Object.hasOwn(codeKeys, code)) key = codeKeys[code];
  if (!key) return null;
  if (key.length === 1 && !/[a-z0-9]/.test(key) && event.shiftKey) return null;
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Mod");
  if (event.metaKey) modifiers.push("Meta");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (!/^F\d+$/.test(key) && !modifiers.some((part) => part !== "Shift"))
    return null;
  const binding = [...modifiers, key].join("-");
  return parseShortcut(binding) ? binding : null;
}
