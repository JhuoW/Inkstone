import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

// INKSTONE_README_IMAGES writes to another folder, e.g. to review before replacing.
const output = path.resolve(
  process.env.INKSTONE_README_IMAGES || "docs/images",
);
await fs.mkdir(output, { recursive: true });

for (const locale of ["en", "zh-CN"]) {
  const chinese = locale === "zh-CN";
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-feature-gallery-")),
  );
  const workspace = path.join(directory, chinese ? "我的笔记" : "My notes");
  const profile = path.join(directory, "profile");
  await fs.mkdir(workspace);
  await fs.mkdir(profile);
  const scenes = [
    {
      id: "math",
      name: chinese ? "公式编辑.md" : "Math.md",
      theme: "light",
      text: chinese
        ? "# 让公式融入文字\n\n在记录思路时，自然地写下数学表达式。\n\n## 阅读时，公式就在原位\n\n能量与质量的关系是 $E = mc^2$。\n\n## 点击公式，直接编辑\n\n试着修改 $a = b + c$，不必离开正在写的段落。\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$\n\n无论行内公式还是独立公式，都保存在你的 Markdown 文件中。\n\n"
        : "# Math, as you write\n\nKeep equations in the flow of your notes.\n\n## Read naturally\n\nEnergy and mass are related by $E = mc^2$.\n\n## Click a formula to edit\n\nTry changing $a = b + c$ without leaving the paragraph.\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$\n\nInline or on its own, every formula stays in your Markdown file.\n\n",
    },
    {
      id: "code",
      name: chinese ? "代码笔记.md" : "Code notes.md",
      theme: "dark",
      text:
        (chinese
          ? "# 让代码专注于表达\n\n直接输入或粘贴代码，为每个代码块选择合适的语言。\n\n"
          : "# Code with room to think\n\nType or paste directly. Pick the language for each block.\n\n") +
        '```python\ndef capture(thought):\n    return {"idea": thought, "status": "draft"}\n\nnote = capture("' +
        (chinese ? "让想法落在纸上" : "A place for your thoughts") +
        '")\nprint(note["idea"])\n```\n\n' +
        "```sql\nSELECT title, updated_at\nFROM notes\nWHERE status = 'draft'\nORDER BY updated_at DESC;\n```\n\n" +
        (chinese
          ? "语法高亮跟随语言切换，代码始终保持可编辑。\n\n"
          : "Highlighting follows your language choice. Your code stays editable.\n\n"),
    },
    {
      id: "tables",
      name: chinese ? "写作计划.md" : "Writing plan.md",
      theme: "light",
      text: chinese
        ? "# 给想法一点结构\n\n用表格整理计划，通过右键菜单调整行与列。\n\n| 阶段 | 内容 | 状态 |\n| --- | --- | --- |\n| 构思 | 收集灵感与参考资料 | 已完成 |\n| 写作 | 写下第一版草稿 | 进行中 |\n| 修改 | 打磨结构与细节 | 待开始 |\n\n为下一个想法，留出一点空间。\n\n"
        : "# Give ideas a little structure\n\nOrganize your plan, then use the context menu to adjust rows and columns.\n\n| Stage | Focus | Status |\n| --- | --- | --- |\n| Explore | Gather ideas and references | Done |\n| Write | Put the first draft into words | In progress |\n| Refine | Shape the structure and details | Up next |\n\nMake a little room for your next idea.\n\n",
    },
  ];
  for (const scene of scenes)
    await fs.writeFile(path.join(workspace, scene.name), scene.text);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale,
      theme: "light",
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
    const initial = path.join(workspace, scenes[0].name);
    app = await electron.launch({
      executablePath,
      args: executablePath
        ? [workspace, initial]
        : [process.cwd(), workspace, initial],
      env,
      chromiumSandbox: true,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1280, 900),
    );
    await page.waitForFunction(
      () =>
        window.__inkstone?.getDocument().path &&
        !__inkstone.editor.view.state.readOnly,
    );
    for (const scene of scenes) {
      await page.keyboard.press("Escape");
      await page.evaluate(
        async ({ file, theme }) => {
          await __inkstone.invoke("updateSettings", { theme });
          await __inkstone.loadDocument(
            await __inkstone.invoke("openFile", { path: file }),
          );
          __inkstone.editor.setSelection({
            anchor: __inkstone.editor.view.state.doc.length,
          });
          await document.fonts.ready;
        },
        { file: path.join(workspace, scene.name), theme: scene.theme },
      );
      await page
        .locator(`.brand-artwork-${scene.theme}`)
        .evaluate((img) => img.decode());
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
      if (scene.id === "math") {
        await page.locator(".katex").nth(2).waitFor();
        const point = await page
          .locator(".katex-html")
          .nth(1)
          .evaluate((element) => {
            const symbol = [...element.querySelectorAll("span")].find(
              (node) => !node.children.length && node.textContent === "b",
            );
            const box = symbol.getBoundingClientRect();
            return { x: box.left + 2, y: (box.top + box.bottom) / 2 };
          });
        await page.mouse.click(point.x, point.y);
        await page.locator(".cm-math-source").waitFor();
        assert.equal(
          await page.evaluate(() => __inkstone.editor.getSelection().head),
          scene.text.indexOf("b + c"),
        );
        assert.equal(
          await page.locator(".cm-math-source").textContent(),
          "$a = b + c$",
        );
      } else if (scene.id === "code") {
        await page.locator('.cm-code-line span:text-is("def")').waitFor();
        assert.equal(await page.locator(".cm-code-language").count(), 2);
        assert.ok(
          (await page
            .locator(".cm-code-language")
            .first()
            .locator("option")
            .count()) > 30,
        );
        await page.evaluate(() => {
          const editor = __inkstone.editor;
          editor.setSelection({
            anchor: editor.getText().indexOf("return") + 7,
          });
          editor.focus();
        });
      } else {
        await page
          .locator(".cm-live-block td")
          .first()
          .click({ button: "right" });
        await page.locator('[data-context-submenu="table"]').hover();
        await page
          .locator('.editor-context-menu[data-context-depth="1"]')
          .waitFor();
      }
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.deepEqual(errors, []);
      assert.equal(
        await page.evaluate(() => __inkstone.editor.getText()),
        scene.text,
      );
      await page.screenshot({
        path: path.join(output, `${scene.id}-${locale}.png`),
        caret: "initial",
      });
      console.log(`Captured ${scene.id}/${locale} from the desktop app`);
    }
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}
