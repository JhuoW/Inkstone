import test from "node:test";
import assert from "node:assert/strict";
import { readDocumentConfig } from "../src/document-config.js";

test("document image configuration reads quoted Unicode strings without changing source", () => {
  const source =
    "\uFEFF---\r\ntitle: Do not change\r\ntypora-root-url: \"../网站\"\r\ntypora-copy-images-to: 'assets/${filename}'\r\n---\r\n\r\n![图](/img.png)";
  const copy = source;
  assert.deepEqual(readDocumentConfig(source), {
    imageRoot: "../网站",
    imageFolder: "assets/${filename}",
  });
  assert.equal(source, copy);
});
test("only allowlisted scalar string settings are accepted", () => {
  assert.deepEqual(
    readDocumentConfig(
      "---\ntypora-root-url: [a, b]\ntypora-copy-images-to: 123\ncommand: rm -rf\n---\nbody",
    ),
    {},
  );
  assert.deepEqual(
    readDocumentConfig(
      "---\ntypora-root-url: &x /root\ntypora-copy-images-to: *x\n---\nbody",
    ),
    { imageRoot: "/root" },
  );
  assert.deepEqual(
    readDocumentConfig(
      '---\ntypora-root-url: !!js/function "function() {}"\n---\nbody',
    ),
    {},
  );
});
test("invalid, duplicate, unclosed and oversized metadata fails closed", () => {
  assert.deepEqual(
    readDocumentConfig(
      "---\ntypora-root-url: a\ntypora-root-url: b\n---\nbody",
    ),
    {},
  );
  assert.deepEqual(
    readDocumentConfig("before\n---\ntypora-root-url: /root\n---"),
    {},
  );
  assert.deepEqual(
    readDocumentConfig(
      "---\ntypora-root-url: /root\n" + " ".repeat(70000) + "\n---",
    ),
    {},
  );
  assert.deepEqual(
    readDocumentConfig("---\ntypora-root-url: [broken\n---"),
    {},
  );
});
