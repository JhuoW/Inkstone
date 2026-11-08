import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const output = path.resolve("docs/images");
await fs.mkdir(output, { recursive: true });
for (const locale of ["en", "zh-CN"]) {
  const chinese = locale === "zh-CN";
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkstone-readme-"),
  );
  const workspace = path.join(directory, chinese ? "我的笔记" : "My notes");
  const profile = path.join(directory, "profile");
  const filename = chinese ? "灵感.md" : "Ideas.md";
  const file = path.join(workspace, filename);
  await fs.mkdir(workspace);
  await fs.mkdir(profile);
  const text = chinese
    ? '# 让想法落在纸上\n\n从一个念头开始，慢慢写成自己的篇章。\n\n## 在文字中思考\n\n**文字属于你。** 用 Markdown 梳理思路，让写作自然发生。\n\n- [x] 记录一个新想法\n- [ ] 把想法展开成文章\n\n## 给想法一点结构\n\n行内公式 $E = mc^2$ 与文字融为一体。\n\n| 写作方式 | 用途 |\n| --- | --- |\n| 即时编辑 | 专注内容与思路 |\n| 源码模式 | 精确控制 Markdown |\n\n```python\ndef capture(thought):\n    return f"Inkstone: {thought}"\n```\n\n你的下一篇文章，从这里开始。\n\n'
    : '# A place for your thoughts\n\nBegin with an idea. Give it room to become something more.\n\n## Think through writing\n\n**Your words belong to you.** Shape your ideas with Markdown and let the writing flow.\n\n- [x] Capture a new idea\n- [ ] Turn it into a story\n\n## Give ideas a little structure\n\nInline mathematics $E = mc^2$ sits naturally alongside your words.\n\n| Writing mode | Purpose |\n| --- | --- |\n| Live editing | Focus on ideas and structure |\n| Source mode | Keep precise control of Markdown |\n\n```python\ndef capture(thought):\n    return f"Inkstone: {thought}"\n```\n\nYour next story begins here.\n\n';
  await fs.writeFile(file, text);
  await fs.writeFile(
    path.join(workspace, chinese ? "阅读清单.md" : "Reading list.md"),
    "# Notes\n",
  );
  await fs.writeFile(
    path.join(workspace, chinese ? "写作计划.md" : "Writing plan.md"),
    "# Notes\n",
  );
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale,
      theme: "dark",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
      sidebarWidth: 238,
      fontSize: 16,
      lineHeight: 1.6,
      contentWidth: 820,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  let app;
  try {
    app = await electron.launch({
      executablePath,
      args: executablePath
        ? [workspace, file]
        : [process.cwd(), workspace, file],
      env,
      chromiumSandbox: true,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1280, 1030),
    );
    await page.waitForFunction(
      (filename) =>
        window.__inkstone?.getDocument().path?.endsWith(filename) &&
        !__inkstone.editor.view.state.readOnly,
      filename,
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      __inkstone.editor.setSelection({
        anchor: __inkstone.editor.view.state.doc.length,
      });
      __inkstone.editor.view.scrollDOM.scrollTop = 0;
    });
    await page.locator(".katex").first().waitFor();
    await page.locator('.cm-code-line span:text-is("def")').waitFor();
    await page
      .locator(".brand-artwork-dark")
      .evaluate((image) => image.decode());
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.evaluate(() => {
      __inkstone.editor.view.contentDOM.blur();
      __inkstone.editor.view.scrollDOM.scrollTop = 0;
    });
    await page.waitForFunction(
      () => __inkstone.editor.view.scrollDOM.scrollTop === 0,
    );
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => __inkstone.editor.getText()), text);
    await page.screenshot({ path: path.join(output, `main-${locale}.png`) });
    console.log(`Captured ${locale} from the actual desktop app`);
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}
