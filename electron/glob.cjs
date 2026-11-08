"use strict";
const path = require("node:path");
function patterns(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,]+/);
  return list
    .map((v) => String(v).trim().replaceAll("\\", "/").replace(/^\.\//, ""))
    .filter(Boolean)
    .slice(0, 100);
}
function compile(glob) {
  let expression = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        expression += "(?:.*/)?";
      } else expression += ".*";
    } else if (ch === "*") expression += "[^/]*";
    else if (ch === "?") expression += "[^/]";
    else expression += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${expression}$`, process.platform === "win32" ? "i" : "");
}
function filterPaths(include, exclude) {
  const includes = patterns(include).map((glob) => ({
    glob,
    re: compile(glob),
  }));
  const excludes = patterns(exclude).map((glob) => ({
    glob,
    re: compile(glob),
  }));
  const matches = (entry, relative, isDirectory) =>
    entry.re.test(relative) ||
    (!entry.glob.includes("/") &&
      entry.re.test(path.posix.basename(relative))) ||
    (isDirectory &&
      entry.glob.endsWith("/**") &&
      compile(entry.glob.slice(0, -3)).test(relative));
  return (relative, isDirectory = false) => {
    relative = relative.split(path.sep).join("/");
    if (excludes.some((entry) => matches(entry, relative, isDirectory)))
      return false;
    return (
      isDirectory ||
      !includes.length ||
      includes.some((entry) => matches(entry, relative, false))
    );
  };
}
module.exports = { patterns, compile, filterPaths };
