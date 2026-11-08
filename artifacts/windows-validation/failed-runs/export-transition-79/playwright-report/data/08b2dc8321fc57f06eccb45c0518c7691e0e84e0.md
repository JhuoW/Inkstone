# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: desktop.spec.js >> real UI exports self-contained Chinese HTML, PDF, and PNG with hydrated math and Mermaid
- Location: tests\desktop.spec.js:345:1

# Error details

```
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('select[name="format"]')

```

# Test source

```ts
  260 |     e.setSelection({
  261 |       anchor: at,
  262 |       head: at + e.view.state.doc.toString().slice(at).indexOf("$$", 2) + 2,
  263 |     });
  264 |     return __inkstone.execute("copyMathML");
  265 |   });
  266 |   const math = await app.evaluate(async ({ clipboard }) => {
  267 |     const items = await clipboard.read();
  268 |     return (await items[0].getType("text/plain")).text();
  269 |   });
  270 |   expect(math).toContain("<math");
  271 |   expect(math).toContain("mc");
  272 |   await page.locator("#sidebar-resize").focus();
  273 |   await page.keyboard.press("ArrowRight");
  274 |   await expect
  275 |     .poll(
  276 |       async () =>
  277 |         (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings
  278 |           .sidebarWidth,
  279 |     )
  280 |     .toBe(266);
  281 |   const css = path.join(temp, "my-theme.css");
  282 |   await fs.writeFile(css, ".cm-live-block h1 { color: rgb(127, 40, 65); }");
  283 |   await app.evaluate(({ dialog }, file) => {
  284 |     dialog.showOpenDialog = async () => ({
  285 |       canceled: false,
  286 |       filePaths: [file],
  287 |     });
  288 |   }, css);
  289 |   await page.evaluate(() => __inkstone.execute("settings"));
  290 |   await page.locator('[data-section="appearance"]').click();
  291 |   await page.locator("#import-theme").click();
  292 |   await expect(page.locator('textarea[name="customCSS"]')).toHaveValue(
  293 |     /rgb\(127, 40, 65\)/,
  294 |   );
  295 |   await page.locator('textarea[name="customCSS"]').fill("");
  296 |   await page.locator('textarea[name="customCSS"]').dispatchEvent("change");
  297 |   await page.locator("#settings-done").click();
  298 |   await page.evaluate(() => __inkstone.execute("export"));
  299 |   await page.locator('select[name="format"]').selectOption("jpeg");
  300 |   await page.locator('input[name="quality"]').fill("78");
  301 |   await page.locator("#save-export-profile").click();
  302 |   await page.locator('dialog input[name="value"]').fill("测试预设");
  303 |   await page.locator('dialog form button[type="submit"]').last().click();
  304 |   await expect
  305 |     .poll(
  306 |       async () =>
  307 |         (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings
  308 |           .exportProfiles?.[0]?.name,
  309 |     )
  310 |     .toBe("测试预设");
  311 |   await page.locator('select[name="format"]').selectOption("pdf");
  312 |   await page.locator('select[name="profile"]').selectOption("0");
  313 |   await expect(page.locator('select[name="format"]')).toHaveValue("jpeg");
  314 |   await expect(page.locator('input[name="quality"]')).toHaveValue("78");
  315 |   await page.locator("dialog .close").click();
  316 | });
  317 | 
  318 | test("external edit conflict keeps unsaved text and disk contents", async () => {
  319 |   await page.evaluate(() => {
  320 |     const e = __inkstone.editor;
  321 |     e.setSelection({
  322 |       anchor: e.view.state.doc.length,
  323 |       head: e.view.state.doc.length,
  324 |     });
  325 |     e.insert("本地未保存");
  326 |   });
  327 |   await fs.appendFile(fixture, "\r\n外部新增\r\n");
  328 |   await expect(page.locator("#conflict-banner")).toBeVisible({
  329 |     timeout: 10000,
  330 |   });
  331 |   await page.evaluate(() => __inkstone.execute("save"));
  332 |   expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
  333 |     "本地未保存",
  334 |   );
  335 |   expect(await fs.readFile(fixture, "utf8")).toContain("外部新增");
  336 |   expect(await fs.readFile(fixture, "utf8")).not.toContain("本地未保存");
  337 |   await page.locator('[data-conflict="reload"]').click();
  338 |   await expect
  339 |     .poll(() => page.evaluate(() => __inkstone.getDocument().text))
  340 |     .toContain("外部新增");
  341 |   const data = await page.evaluate(() => __inkstone.invoke("bootstrap"));
  342 |   expect(data.recovery.some((r) => r.text?.includes("本地未保存"))).toBe(true);
  343 | });
  344 | 
  345 | test("real UI exports self-contained Chinese HTML, PDF, and PNG with hydrated math and Mermaid", async () => {
  346 |   await fs.mkdir(artifactPath("desktop-validation"), {
  347 |     recursive: true,
  348 |   });
  349 |   const paths = {};
  350 |   for (const format of ["html", "pdf", "png"]) {
  351 |     const output = path.join(temp, "ui-export." + format);
  352 |     paths[format] = output;
  353 |     await app.evaluate(({ dialog }, target) => {
  354 |       dialog.showSaveDialog = async () => ({
  355 |         canceled: false,
  356 |         filePath: target,
  357 |       });
  358 |     }, output);
  359 |     await page.evaluate(() => __inkstone.execute("export"));
> 360 |     await page.locator('select[name="format"]').selectOption(format);
      |                                                 ^ TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
  361 |     await page.locator('#export-form button[type="submit"]').click();
  362 |     await expect(page.locator(".export-status")).toContainText("导出完成", {
  363 |       timeout: 60000,
  364 |     });
  365 |     await page.locator("dialog .close").click();
  366 |     expect((await fs.stat(output)).size).toBeGreaterThan(5000);
  367 |     await fs.copyFile(
  368 |       output,
  369 |       artifactPath("desktop-validation", "writing." + format),
  370 |     );
  371 |   }
  372 |   const html = await fs.readFile(paths.html, "utf8");
  373 |   expect(html).toContain('data-rendered="true"');
  374 |   expect(html).toContain("katex");
  375 |   expect(html).toContain("中文写作");
  376 |   const pdfText = execFileSync("pdftotext", [paths.pdf, "-"], {
  377 |     encoding: "utf8",
  378 |   });
  379 |   expect(pdfText).toMatch(/中文\s+写作|中文写作/);
  380 |   expect(pdfText).toContain("E");
  381 |   expect(pdfText).toContain("mc");
  382 |   const nodes = await page.locator(".diagram svg").textContent();
  383 |   expect(nodes).toContain("中文");
  384 |   expect(nodes).toContain("写作");
  385 |   await page.evaluate(() => {
  386 |     const e = __inkstone.editor;
  387 |     e.setSelection({
  388 |       anchor: e.view.state.doc.length,
  389 |       head: e.view.state.doc.length,
  390 |     });
  391 |     e.view.scrollDOM.scrollTop = 0;
  392 |   });
  393 |   await page.waitForTimeout(100);
  394 |   await page.evaluate(() => {
  395 |     __inkstone.editor.view.scrollDOM.scrollTop = 0;
  396 |   });
  397 |   await page.screenshot({
  398 |     path: artifactPath("desktop-validation", "inkstone-desktop.png"),
  399 |   });
  400 |   expect(errors).toEqual([]);
  401 | });
  402 | 
  403 | test("Pandoc DOCX contains a rasterized Mermaid diagram and can be imported back", async () => {
  404 |   const pandoc = await findPandoc();
  405 |   test.skip(!pandoc, "Install Pandoc to validate DOCX diagram embedding");
  406 |   const output = path.join(temp, "diagram.docx");
  407 |   await page.evaluate(
  408 |     (path) => __inkstone.invoke("updateSettings", { pandocPath: path }),
  409 |     pandoc,
  410 |   );
  411 |   await app.evaluate(({ dialog }, target) => {
  412 |     dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  413 |   }, output);
  414 |   await page.evaluate(() => __inkstone.execute("export"));
  415 |   await page.locator('select[name="format"]').selectOption("docx");
  416 |   await page.locator('#export-form button[type="submit"]').click();
  417 |   await expect(page.locator(".export-status")).toContainText("导出完成", {
  418 |     timeout: 60000,
  419 |   });
  420 |   await page.locator("dialog .close").click();
  421 |   const extracted = path.join(temp, "diagram-docx");
  422 |   await extract(output, { dir: extracted });
  423 |   const media = path.join(extracted, "word", "media");
  424 |   const image = (await fs.readdir(media)).find((name) => name.endsWith(".png"));
  425 |   expect(image).toBeTruthy();
  426 |   expect((await fs.readFile(path.join(media, image))).subarray(0, 8)).toEqual(
  427 |     Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  428 |   );
  429 |   const imported = await page.evaluate(
  430 |     (path) => __inkstone.invoke("runPandoc", { direction: "import", path }),
  431 |     output,
  432 |   );
  433 |   expect(imported.text).toContain("data:image/png;base64,");
  434 |   expect(imported.text).toContain("中文写作");
  435 |   await fs.copyFile(output, artifactPath("desktop-validation", "writing.docx"));
  436 | });
  437 | 
  438 | test("complete offline acceptance sample renders native legacy diagrams and advanced math in the desktop CSP", async () => {
  439 |   const sample = path.join(root, "samples", "acceptance.md"),
  440 |     output = path.join(temp, "acceptance.html");
  441 |   await app.evaluate(({ dialog }, file) => {
  442 |     dialog.showOpenDialog = async () => ({
  443 |       canceled: false,
  444 |       filePaths: [file],
  445 |     });
  446 |   }, sample);
  447 |   await page.evaluate(() => __inkstone.execute("open"));
  448 |   await expect(page.locator("#document-title")).toHaveText("acceptance.md");
  449 |   await app.evaluate(({ dialog }, file) => {
  450 |     dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  451 |   }, output);
  452 |   await page.evaluate(() => __inkstone.execute("export"));
  453 |   await page.locator('select[name="format"]').selectOption("html");
  454 |   await page.locator('#export-form button[type="submit"]').click();
  455 |   await expect(page.locator(".export-status")).toContainText("导出完成", {
  456 |     timeout: 60000,
  457 |   });
  458 |   await page.locator("dialog .close").click();
  459 |   const html = await fs.readFile(output, "utf8");
  460 |   expect(html).not.toContain('class="math-error"');
```