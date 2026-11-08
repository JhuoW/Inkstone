"use strict";
// These keys belong to retired services. Only preference keys/command bindings
// are removed: document text, snippets, CSS and local asset paths are untouched.
const retiredPreference =
  /^(?:upload.*|autoUpload|cloud.*|sync(?:Enabled|Provider|Endpoint|Token|Account|Folder|Settings)?|searchURL)$/i;
const retiredCommand =
  /^(?:upload.*|autoUpload|cloud.*|sync(?:Now|Settings|Folder)?|webSearch)$/i;
function removeRetiredSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { settings: input, removed: [] };
  const cleaned = {},
    removed = [];
  for (const [key, value] of Object.entries(input)) {
    if (retiredPreference.test(key)) {
      removed.push(key);
      continue;
    }
    if (
      key === "shortcuts" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const shortcuts = Object.fromEntries(
        Object.entries(value).filter(([command]) => {
          if (!retiredCommand.test(command)) return true;
          removed.push(`shortcuts.${command}`);
          return false;
        }),
      );
      Object.defineProperty(cleaned, key, {
        value: shortcuts,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else
      Object.defineProperty(cleaned, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return { settings: cleaned, removed };
}
module.exports = { removeRetiredSettings };
