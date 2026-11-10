/**
 * Checks the update metadata electron-builder wrote for the current platform:
 * - the feed file beside the packages (latest.yml / latest-linux.yml) names the
 *   built installer or AppImage with its real SHA-512, size and version;
 * - the packaged app carries app-update.yml pointing at this GitHub repository,
 *   with the signing publisher when the build was signed.
 * usage: node scripts/verify-update-metadata.mjs [win|linux]
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import YAML from "yaml";

const platform =
  process.argv[2] || (process.platform === "win32" ? "win" : "linux");
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const target = {
  win: {
    feed: "release/latest.yml",
    file: `Inkstone-${version}-windows-x64.exe`,
    config: "release/win-unpacked/resources/app-update.yml",
  },
  linux: {
    feed: "release/latest-linux.yml",
    file: `Inkstone-${version}.AppImage`,
    config: "release/linux-unpacked/resources/app-update.yml",
  },
}[platform];
assert.ok(target, `Unknown platform ${platform}; use win or linux.`);

const feed = YAML.parse(await fs.readFile(target.feed, "utf8"));
assert.equal(feed.version, version, `${target.feed}: version`);
const entry = feed.files?.find((file) => file.url === target.file);
assert.ok(entry, `${target.feed}: no entry for ${target.file}`);
const bytes = await fs.readFile(path.join("release", target.file));
const sha512 = crypto.createHash("sha512").update(bytes).digest("base64");
assert.equal(entry.sha512, sha512, `${target.feed}: SHA-512 of ${target.file}`);
// Without differential packages electron-builder may omit the size.
if (entry.size !== undefined)
  assert.equal(
    entry.size,
    bytes.length,
    `${target.feed}: size of ${target.file}`,
  );
if (feed.path) assert.equal(feed.path, target.file, `${target.feed}: path`);

const config = YAML.parse(await fs.readFile(target.config, "utf8"));
assert.equal(config.provider, "github", `${target.config}: provider`);
assert.equal(config.owner, "JhuoW", `${target.config}: owner`);
assert.equal(config.repo, "Inkstone", `${target.config}: repo`);
assert.ok(config.updaterCacheDirName, `${target.config}: updaterCacheDirName`);
const publisher = process.env.AZURE_SIGNING_PUBLISHER;
if (platform === "win" && process.env.SIGNING_ENABLED === "true")
  assert.deepEqual(
    [config.publisherName].flat(),
    [publisher],
    `${target.config}: publisherName must match the signing certificate`,
  );

console.log(
  JSON.stringify(
    {
      platform,
      version,
      feed: target.feed,
      file: target.file,
      size: bytes.length,
      publisherName: config.publisherName ?? null,
      passed: true,
    },
    null,
    2,
  ),
);
