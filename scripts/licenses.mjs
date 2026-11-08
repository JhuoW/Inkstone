import fs from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
let output =
  "# Third-party notices\n\nInkstone source is MIT licensed. This file records installed dependency licenses, including bundled renderer libraries and build/test tools. Electron distributions additionally contain LICENSE.electron.txt and LICENSES.chromium.html. No Typora source, assets, themes, or binaries are included.\n\nDOMPurify is used under its Apache-2.0 licensing option. KaTeX fonts are distributed under their upstream license. External Pandoc is user-installed and not bundled. Build-time platform tooling is not a product capability.\n";
const seen = new Set();
for (const [location, entry] of Object.entries(lock.packages).sort()) {
  if (!location) continue;
  let pkg;
  try {
    pkg = JSON.parse(
      await fs.readFile(path.join(location, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  const key = pkg.name + "@" + pkg.version;
  if (seen.has(key)) continue;
  seen.add(key);
  output +=
    "\n## " +
    key +
    "\n\nLicense: " +
    (typeof pkg.license === "string"
      ? pkg.license
      : JSON.stringify(pkg.license || "See upstream license")) +
    "\n";
  const files = (await fs.readdir(location)).filter((name) =>
    /^(licen[sc]e|copying|notice)(\.|$)/i.test(name),
  );
  for (const file of files) {
    const filename = path.join(location, file);
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 500000) continue;
    output +=
      "\n" +
      file +
      "\n\n\x60\x60\x60text\n" +
      (await fs.readFile(filename, "utf8")).replaceAll("\x60\x60\x60", "~~~") +
      "\n\x60\x60\x60\n";
  }
}
for (const [name, license] of [
  ["Chromium en-US Hunspell/SCOWL dictionary (upstream notices)", "electron/dictionaries/README_en_US.txt"],
  [
    "js-sequence-diagrams 2.0.1 (vendored, BSD-2-Clause)",
    "src/vendor/sequence-diagrams/LICENCE",
  ],
  [
    "DOMPurify export-window copy (Apache-2.0 option)",
    "electron/vendor/DOMPurify-LICENSE",
  ],
]) {
  output +=
    "\n## " +
    name +
    "\n\n\x60\x60\x60text\n" +
    (await fs.readFile(license, "utf8")) +
    "\n\x60\x60\x60\n";
}
await fs.writeFile("THIRD_PARTY_NOTICES.md", output);
console.log("Recorded " + seen.size + " package notices and vendor licenses");
