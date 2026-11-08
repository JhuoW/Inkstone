import test from "node:test";
import assert from "node:assert/strict";
import { codeLanguages, resolveCodeLanguage } from "../src/code-fences.js";

test("Every selectable code language resolves to its bundled highlighting grammar", async () => {
  assert.ok(codeLanguages.length > 100);
  assert.equal(
    new Set(codeLanguages.map((language) => language.value)).size,
    codeLanguages.length,
  );
  for (const language of codeLanguages) {
    const description = resolveCodeLanguage(language.value);
    assert.equal(description?.name, language.name, language.value);
  }
  for (const value of ["gss", "spec", "webidl", "xu"])
    assert.ok((await resolveCodeLanguage(value).load()).language, value);
});

test("Existing fence aliases and metadata resolve without assigning a grammar to plain or unknown text", () => {
  assert.equal(resolveCodeLanguage("js")?.name, "JavaScript");
  assert.equal(resolveCodeLanguage("PYTHON linenos=1")?.name, "Python");
  assert.equal(resolveCodeLanguage(""), null);
  assert.equal(resolveCodeLanguage("plain"), null);
  assert.equal(resolveCodeLanguage("custom-unknown-language"), null);
});
