const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  FileStore,
  atomicWrite,
  decode,
  preserveEndings,
} = require("../electron/storage.cjs");
const { initialLanguage } = require("../electron/language.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new FileStore(path.join(dir, "data"));
  await store.init();
  return { dir, store, file: path.join(dir, "note.md") };
}
test("discarded document recovery cannot return from pending or late writes", async (t) => {
  const { store, file } = await fixture(t);
  await store.recovery({ id: "old-session", path: file, text: "old" });
  await store.recovery({
    id: "other-window",
    path: file,
    text: "independent edits",
  });
  const pending = store.recovery({
    id: "current",
    path: file,
    text: "pending",
  });
  const result = await store.discardRecoveries({
    id: "current",
    path: file,
    excludeIds: ["other-window"],
  });
  await pending;
  assert.deepEqual(result.discarded.sort(), ["current", "old-session"]);
  await store.recovery({ id: "current", path: file, text: "late stale save" });
  await store.recovery({
    id: "old-session",
    path: file,
    text: "late stale history",
  });
  assert.deepEqual(
    (await store.recoveries()).map((item) => item.id),
    ["other-window"],
  );
  const restarted = new FileStore(store.dataDir);
  assert.deepEqual(
    (await restarted.recoveries()).map((item) => item.id),
    ["other-window"],
  );
  await store.recovery({
    id: "fresh-after-cancel",
    path: file,
    text: "continued editing",
  });
  assert.equal((await store.recoveries()).length, 2);
});
test("ordinary recovery cleanup after saving still permits recovery of subsequent edits", async (t) => {
  const { store, file } = await fixture(t);
  await store.recovery({
    id: "continuous-document",
    path: file,
    text: "before save",
  });
  await store.recovery({ id: "continuous-document", discard: true });
  assert.deepEqual(await store.recoveries(), []);
  await store.recovery({
    id: "continuous-document",
    path: file,
    text: "edits after save",
  });
  assert.equal((await store.recoveries())[0].text, "edits after save");
});
test("first language defaults to English and installer language never replaces saved preferences", async (t) => {
  const { dir } = await fixture(t);
  assert.deepEqual(await initialLanguage({}, dir), {
    locale: "en",
    configured: false,
  });
  await fs.writeFile(
    path.join(dir, "installer-locale.json"),
    JSON.stringify({ locale: "zh-CN" }),
  );
  assert.deepEqual(await initialLanguage({}, dir), {
    locale: "zh-CN",
    configured: false,
    installerSeed: true,
  });
  assert.deepEqual(await initialLanguage({ locale: "en" }, dir), {
    locale: "en",
    configured: true,
  });
  await fs.writeFile(
    path.join(dir, "installer-locale.json"),
    JSON.stringify({ locale: "invalid" }),
  );
  assert.deepEqual(await initialLanguage({}, dir), {
    locale: "en",
    configured: false,
  });
});
test("invalid JSON with a failed backup blocks subsequent state writes and preserves the original bytes", async (t) => {
  const { store } = await fixture(t);
  const settings = path.join(store.dataDir, "settings.json");
  const original = '{"customCSS":"valuable contents", INVALID JSON';
  await fs.writeFile(settings, original);
  const copy = fs.copyFile;
  fs.copyFile = async (source, ...args) => {
    if (source === settings) {
      const error = new Error("simulated backup permission failure");
      error.code = "EACCES";
      throw error;
    }
    return copy(source, ...args);
  };
  try {
    assert.deepEqual(await store.readJson("settings", {}), {});
    assert.equal(store.blockedStateKeys.has("settings"), true);
    assert.match(store.stateWarnings[0].backupError, /permission failure/);
    await assert.rejects(
      store.writeJson("settings", { recentFiles: ["a.md"] }),
      /STATE_BACKUP/,
    );
    assert.equal(await fs.readFile(settings, "utf8"), original);
  } finally {
    fs.copyFile = copy;
  }
  const backup = await store.preserveBlockedState("settings");
  assert.equal(await fs.readFile(backup, "utf8"), original);
  await store.writeJson("settings", { recovered: true });
  assert.deepEqual(JSON.parse(await fs.readFile(settings, "utf8")), {
    recovered: true,
  });
});
test("untouched UTF-8 BOM and CRLF document is byte exact, no mtime update", async (t) => {
  const { file, store } = await fixture(t);
  const bytes = Buffer.from(
    '\ufeff---\r\ntitle: 中文\r\n---\r\n\r\n# 原文  \r\n<custom attr="x">未知</custom>\r\n',
  );
  await fs.writeFile(file, bytes);
  const opened = await store.read(file);
  const before = (await fs.stat(file)).mtimeMs;
  const saved = await store.save({
    ...opened,
    text: opened.text.replace(/\r\n/g, "\n"),
  });
  assert.equal(saved.unchanged, true);
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal((await fs.stat(file)).mtimeMs, before);
});
test("local edit preserves BOM, mixed line endings and unrelated content", async (t) => {
  const { file, store } = await fixture(t);
  await fs.writeFile(file, "\ufeff---\r\nx: 1\n---\r\n\r\n你好\nTAIL\r\n");
  const opened = await store.read(file);
  await store.save({
    ...opened,
    text: opened.text.replace(/\r\n/g, "\n").replace("你好", "您好"),
  });
  assert.equal(
    await fs.readFile(file, "utf8"),
    "\ufeff---\r\nx: 1\n---\r\n\r\n您好\nTAIL\r\n",
  );
});
test("external changes and deleted file cannot be silently overwritten", async (t) => {
  const { file, store } = await fixture(t);
  await fs.writeFile(file, "original");
  const opened = await store.read(file);
  await fs.writeFile(file, "external");
  await assert.rejects(store.save({ ...opened, text: "mine" }), /CONFLICT/);
  assert.equal(await fs.readFile(file, "utf8"), "external");
  await fs.unlink(file);
  await assert.rejects(store.save({ ...opened, text: "mine" }), /CONFLICT/);
});
test("parallel saves with same revision serialize and detect conflict", async (t) => {
  const { file, store } = await fixture(t);
  await fs.writeFile(file, "first");
  const opened = await store.read(file);
  const results = await Promise.allSettled([
    store.save({ ...opened, text: "second" }),
    store.save({ ...opened, text: "third" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("history restores content without touching live document", async (t) => {
  const { file, store } = await fixture(t);
  await fs.writeFile(file, "before");
  const opened = await store.read(file);
  await store.save({ ...opened, text: "after" });
  const history = await store.history(file);
  assert.equal(history.length, 1);
  const old = await store.historical({ path: file, id: history[0].id });
  assert.equal(old.text, "before");
  assert.equal(await fs.readFile(file, "utf8"), "after");
});
test("atomic write failure leaves original and no temporary file", async (t) => {
  const { file, dir } = await fixture(t);
  await fs.writeFile(file, "original");
  await assert.rejects(
    atomicWrite(file, "replacement", {
      beforeRename: () => {
        throw Error("abort");
      },
    }),
    /abort/,
  );
  assert.equal(await fs.readFile(file, "utf8"), "original");
  assert.equal(
    (await fs.readdir(dir)).filter((n) => n.endsWith(".tmp")).length,
    0,
  );
});
test("recovery drafts survive restart and can be explicitly dismissed", async (t) => {
  const { store, dir } = await fixture(t);
  await store.recovery({
    id: "draft-1",
    text: "未保存",
    path: null,
    revision: null,
  });
  const restored = new FileStore(path.join(dir, "data"));
  assert.equal((await restored.recoveries())[0].text, "未保存");
  await restored.recovery({ id: "draft-1", discard: true });
  assert.deepEqual(await restored.recoveries(), []);
});
test("unsafe encoding and missing revisions are rejected", async (t) => {
  const { file, store } = await fixture(t);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0, 0])), /ENCODING/);
  await fs.writeFile(file, "protected");
  await assert.rejects(store.save({ path: file, text: "oops" }), /CONFLICT/);
});
test("line endings in an inserted block follow the source convention", () => {
  assert.equal(
    preserveEndings("a\r\nb\r\n", "a\nnew\nb\n"),
    "a\r\nnew\r\nb\r\n",
  );
});

test("concurrent preference writes retain the most recently submitted state", async (t) => {
  const { store } = await fixture(t);
  await Promise.all(
    Array.from({ length: 20 }, (_, sequence) =>
      store.writeJson("settings", { sequence }),
    ),
  );
  assert.equal((await store.readJson("settings", {})).sequence, 19);
});
test("discard queued after a recovery write cannot resurrect the draft", async (t) => {
  const { store } = await fixture(t);
  await Promise.all([
    store.recovery({ id: "race", text: "old" }),
    store.recovery({ id: "race", text: "new" }),
    store.recovery({ id: "race", discard: true }),
  ]);
  assert.deepEqual(await store.recoveries(), []);
});

const { rebaseLocalLinks } = require("../electron/links.cjs");
test("Save As rebases only local link destination spans, preserving code and all surrounding source", () => {
  const original =
    '---\r\ntitle: "[ignore](x.md)"\r\n---\r\n\r\n![图](assets/a(b).png "title") and [文稿](other.md#part)\n[ref]: <assets/a b.png> "caption"\n<img src="assets/a.png" width="200">\n`![literal](code.png)`\n\n```md\n![literal](code.png)\n```\n![web](https://example.test/a.png)\n[anchor](#local)\n';
  const result = rebaseLocalLinks(original, "/notes/a.md", "/notes/sub/b.md");
  assert.equal(result.changed, 4);
  assert.ok(result.text.includes('![图](../assets/a%28b%29.png "title")'));
  assert.ok(result.text.includes("[文稿](../other.md#part)"));
  assert.ok(result.text.includes("<../assets/a%20b.png>"));
  assert.ok(result.text.includes('src="../assets/a.png"'));
  assert.ok(result.text.includes("`![literal](code.png)`"));
  assert.ok(result.text.includes("```md\n![literal](code.png)"));
  assert.ok(result.text.startsWith('---\r\ntitle: "[ignore](x.md)"'));
  assert.ok(result.text.includes("https://example.test/a.png"));
  assert.ok(result.text.includes("[anchor](#local)"));
});
test("Save As with custom YAML root reports review requirement without guessing links", () => {
  const text = "---\ntypora-root-url: ../static\n---\n![image](a.png)";
  const result = rebaseLocalLinks(text, "/a/doc.md", "/b/doc.md");
  assert.equal(result.text, text);
  assert.equal(result.warnings.length, 1);
});

const iconv = require("iconv-lite");
for (const [encoding, content] of [
  ["utf16le", "中文 😀"],
  ["utf16be", "中文 😀"],
  ["gb18030", "中文 😀"],
  ["windows1252", "Café déjà vu"],
  ["shiftjis", "日本語 東京"],
]) {
  test(`${encoding} explicitly opens, preserves exact bytes and encodes edits/history safely`, async (t) => {
    const { file, store } = await fixture(t);
    const bom = encoding.startsWith("utf16") ? "\ufeff" : "";
    const bytes = iconv.encode(
      bom + "# " + content + "\r\n\r\noriginal\r\n",
      encoding,
    );
    await fs.writeFile(file, bytes);
    await assert.rejects(store.read(file), /ENCODING/);
    const opened = await store.read(file, { encoding });
    assert.equal(opened.encoding, encoding);
    assert.ok(opened.text.includes(content));
    const mtime = (await fs.stat(file)).mtimeMs;
    const unchanged = await store.save({
      ...opened,
      text: opened.text.replace(/\r\n/g, "\n"),
    });
    assert.equal(unchanged.unchanged, true);
    assert.deepEqual(await fs.readFile(file), bytes);
    assert.equal((await fs.stat(file)).mtimeMs, mtime);
    const saved = await store.save({
      ...opened,
      text: opened.text.replace("original", "edited"),
    });
    assert.equal(saved.encoding, encoding);
    assert.ok(
      iconv.decode(await fs.readFile(file), encoding).includes("edited"),
    );
    const histories = await store.history(file);
    assert.equal(histories[0].encoding, encoding);
    const recovered = await store.historical({
      path: file,
      id: histories[0].id,
    });
    assert.equal(recovered.encoding, encoding);
    assert.equal(recovered.text, opened.text);
  });
}
test("unrepresentable legacy characters refuse saving, while explicit UTF-8 conversion succeeds", async (t) => {
  const { file, store } = await fixture(t);
  const bytes = iconv.encode("Café", "windows1252");
  await fs.writeFile(file, bytes);
  const opened = await store.read(file, { encoding: "windows1252" });
  await assert.rejects(
    store.save({ ...opened, text: "Café 中文 😀" }),
    /cannot represent/,
  );
  assert.deepEqual(await fs.readFile(file), bytes);
  const saved = await store.save({
    ...opened,
    text: "Café 中文 😀",
    encoding: "utf8",
  });
  assert.equal(saved.encoding, "utf8");
  assert.equal((await store.read(file)).text, "Café 中文 😀");
  assert.equal((await store.history(file))[0].encoding, "windows1252");
});

const {
  imageSpans,
  ImageResourceManager,
} = require("../electron/image-resources.cjs");
function resourceManager(store, root, trashed = []) {
  return new ImageResourceManager({
    store,
    authorize: async (file) => {
      const resolved = path.resolve(file);
      if (path.relative(root, resolved).startsWith("..")) throw Error("ACCESS");
      return resolved;
    },
    trash: async (file) => {
      trashed.push(file);
      await fs.rename(file, file + ".trash");
    },
    defaultFolder: () => "assets",
  });
}
test("image spans cover raw HTML and all reference forms while excluding YAML and code examples", () => {
  const raw =
    '---\r\nphoto: "![hidden](secret.png)"\r\n---\r\n\r\n' +
    '![inline](a%20one.png "A title")\r\n![full][shared] ![shared][] ![shared]\r\n\r\n' +
    '[shared]: <a%20one.png> "Ref title"\r\n' +
    '<img data-src="ignore.png" src=\'a%20one.png\' width="80">\r\n' +
    "- Nested\r\n    - ![nested](nested.png)\r\n\r\n" +
    '`![code](code.png) <img src="bad.png">`\r\n\r\n' +
    "    ![indented](indented.png)\r\n\r\n" +
    "```md\r\n![fence](fence.png)\r\n```\r\n<!-- ![comment](comment.png) -->\r\n";
  assert.equal(
    imageSpans("![not a reference][missing]\n[missing]: untouched.svg\n")
      .length,
    0,
  );
  const spans = imageSpans(raw);
  assert.deepEqual(
    spans.map((span) => span.kind),
    ["markdown", "reference", "reference", "reference", "html", "markdown"],
  );
  assert.deepEqual(
    spans.map((span) => raw.slice(span.destinationFrom, span.destinationTo)),
    [
      "a%20one.png",
      "a%20one.png",
      "a%20one.png",
      "a%20one.png",
      "a%20one.png",
      "nested.png",
    ],
  );
  assert.ok(
    spans.every(
      (span) =>
        !raw.slice(span.from, span.to).includes("ignore.png") ||
        span.kind === "html",
    ),
  );
});
test("prepared image rename updates destination spans only and commits document before retiring original", async (t) => {
  const { dir, store, file } = await fixture(t),
    old = path.join(dir, "old image.svg"),
    target = path.join(dir, "新图.svg"),
    trashed = [];
  await fs.writeFile(old, "<svg>original</svg>");
  const source =
    '\ufeff---\r\ncustom: untouched\n---\r\n\r\n![inline](old%20image.svg "T")\r\n![ref][a]\n\n[a]: <old%20image.svg> "Reference"\r\n<img src="old%20image.svg" width="25">\r\n`![example](old%20image.svg)`\n';
  await fs.writeFile(file, source);
  const document = await store.read(file),
    manager = resourceManager(store, dir, trashed);
  const listed = await manager.list({
    documentPath: file,
    text: document.text,
  });
  assert.equal(listed.references.length, 1);
  assert.equal(listed.references[0].occurrences.length, 3);
  const plan = await manager.prepare(
    {
      operation: "rename",
      documentPath: file,
      text: document.text + "unsaved paragraph\n",
      revision: document.revision,
      items: [{ id: listed.references[0].id, target }],
    },
    1,
  );
  assert.equal(plan.patches.length, 3);
  assert.equal(await fs.readFile(file, "utf8"), source);
  assert.equal(await fs.readFile(old, "utf8"), "<svg>original</svg>");
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
  const result = await manager.commit(plan.id, 1);
  assert.equal(result.document.text, result.text);
  assert.equal(result.resources[0].trashed, true);
  const saved = await fs.readFile(file, "utf8");
  assert.ok(saved.startsWith("\ufeff---\r\ncustom: untouched\n"));
  assert.ok(saved.includes("`![example](old%20image.svg)`"));
  assert.ok(saved.endsWith("unsaved paragraph\n"));
  assert.ok(saved.includes('<img src="%E6%96%B0%E5%9B%BE.svg" width="25">'));
  assert.equal(await fs.readFile(target, "utf8"), "<svg>original</svg>");
  assert.deepEqual(trashed, [old]);
  assert.equal((await store.history(file)).length, 1);
});
test("resource batch refuses document/source/destination races and rolls back only newly published files", async (t) => {
  const { dir, store, file } = await fixture(t),
    manager = resourceManager(store, dir),
    first = path.join(dir, "a.svg"),
    second = path.join(dir, "b.svg");
  await fs.writeFile(first, "<svg>A</svg>");
  await fs.writeFile(second, "<svg>B</svg>");
  await fs.writeFile(file, "![a](a.svg) ![b](b.svg)");
  let document = await store.read(file),
    plan = await manager.prepare(
      {
        operation: "copy",
        documentPath: file,
        text: document.text,
        revision: document.revision,
        targetFolder: "copies",
      },
      1,
    );
  await fs.mkdir(path.join(dir, "copies"));
  await fs.writeFile(plan.resources[1].target, "external target");
  await assert.rejects(manager.commit(plan.id, 1), { code: "EEXIST" });
  await assert.rejects(fs.stat(plan.resources[0].target), { code: "ENOENT" });
  assert.equal(
    await fs.readFile(plan.resources[1].target, "utf8"),
    "external target",
  );
  assert.equal(await fs.readFile(file, "utf8"), document.text);
  plan = await manager.prepare(
    {
      operation: "move",
      documentPath: file,
      text: document.text,
      revision: document.revision,
      targetFolder: "moved",
    },
    1,
  );
  await fs.writeFile(second, "external source");
  await assert.rejects(manager.commit(plan.id, 1), /CONFLICT/);
  await assert.rejects(fs.stat(plan.resources[0].target), { code: "ENOENT" });
  assert.equal(await fs.readFile(first, "utf8"), "<svg>A</svg>");
  plan = await manager.prepare(
    {
      operation: "copy",
      documentPath: file,
      text: document.text,
      revision: document.revision,
      targetFolder: "copies",
    },
    1,
  );
  await fs.writeFile(file, "external document");
  await assert.rejects(manager.commit(plan.id, 1), /CONFLICT/);
  assert.equal(await fs.readFile(file, "utf8"), "external document");
});
test("unlink removes image occurrences but preserves a shared link definition and original resource", async (t) => {
  const { dir, store, file } = await fixture(t),
    source = path.join(dir, "shared.svg"),
    manager = resourceManager(store, dir);
  await fs.writeFile(source, "<svg/>");
  await fs.writeFile(
    file,
    '![picture][asset]\n[ordinary link][asset]\n\n[asset]: shared.svg\n<img src="shared.svg">\n',
  );
  const document = await store.read(file),
    plan = await manager.prepare(
      {
        operation: "unlink",
        documentPath: file,
        text: document.text,
        revision: document.revision,
      },
      1,
    );
  await assert.rejects(manager.commit(plan.id, 2), /ACCESS/);
  const result = await manager.commit(plan.id, 1);
  assert.equal(
    result.text,
    "\n[ordinary link][asset]\n\n[asset]: shared.svg\n\n",
  );
  assert.equal(await fs.readFile(source, "utf8"), "<svg/>");
});

test("retired preference migration removes service keys and bindings without mutating document-like values", () => {
  const {
    removeRetiredSettings,
  } = require("../electron/settings-migration.cjs");
  const original = {
    theme: "dark",
    uploadCommand: "old",
    uploadArgs: ["--token", "old"],
    autoUpload: true,
    cloudSync: { enabled: true },
    searchURL: "https://example.invalid",
    shortcuts: { uploadImages: "Mod-u", webSearch: "Mod-w", save: "Mod-s" },
    imageFolder: "pictures",
    snippets: { text: "upload cloud sync are ordinary user words" },
    customCSS: 'body::after{content:"cloud"}',
  };
  const migrated = removeRetiredSettings(original);
  assert.deepEqual(migrated.settings, {
    theme: "dark",
    shortcuts: { save: "Mod-s" },
    imageFolder: "pictures",
    snippets: original.snippets,
    customCSS: original.customCSS,
  });
  assert.equal(original.uploadCommand, "old");
  assert.equal(original.shortcuts.webSearch, "Mod-w");
  assert.ok(migrated.removed.includes("shortcuts.uploadImages"));
  assert.deepEqual(removeRetiredSettings(migrated.settings), {
    settings: migrated.settings,
    removed: [],
  });
  assert.equal(removeRetiredSettings(null).settings, null);
});

test("offline dictionary installation preserves cached dictionaries and user words without network access", async (t) => {
  const { dir } = await fixture(t),
    { installDictionaryCache } = require("../electron/offline-spellcheck.cjs");
  const profile = path.join(dir, "spell-profile");
  await fs.mkdir(profile);
  const first = await installDictionaryCache(profile);
  assert.equal(first.warnings.length, 0);
  assert.equal(first.dictionaries[0].language, "en-US");
  assert.equal(first.dictionaries[0].bundled, true);
  const dictionary = first.dictionaries[0].path,
    before = await fs.readFile(dictionary),
    mtime = (await fs.stat(dictionary)).mtimeMs;
  const words = path.join(profile, "Custom Dictionary.txt");
  await fs.writeFile(words, "Inkstone\nlocalword\n");
  const second = await installDictionaryCache(profile);
  assert.equal(second.dictionaries.length, 1);
  assert.deepEqual(await fs.readFile(dictionary), before);
  assert.equal((await fs.stat(dictionary)).mtimeMs, mtime);
  assert.equal(await fs.readFile(words, "utf8"), "Inkstone\nlocalword\n");
  const blocked = path.join(dir, "blocked");
  await fs.writeFile(blocked, "not a directory");
  const unavailable = await installDictionaryCache(blocked);
  assert.deepEqual(unavailable.dictionaries, []);
  assert.ok(unavailable.warnings.length > 0);
});
