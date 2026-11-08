# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: native-context.spec.js >> native context dispatch uses CSS coordinates at 150 percent zoom before the DOM menu opens
- Location: tests\native-context.spec.js:105:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 2
Received:   275
```

# Test source

```ts
  63  |   const labels = await app.evaluate(() => global.__nativeContexts[0]);
  64  |   expect(labels).toContain("Copy");
  65  |   expect(labels).toContain("Paste");
  66  |   expect(labels).toContain("Select all");
  67  | });
  68  | 
  69  | test("source-mode context hit testing reparses edited offsets and excludes fenced table examples", async () => {
  70  |   const result = await page.evaluate(() => {
  71  |     const editor = __inkstone.editor;
  72  |     editor.setDocument(
  73  |       "```md\n| A | B |\n| --- | --- |\n| example | sample |\n```\n\n| Real | Table |\n| --- | --- |\n| one | two |\n",
  74  |     );
  75  |     editor.setMode("source");
  76  |     editor.view.dispatch({ changes: { from: 0, insert: "Prefix\n\n" } });
  77  |     const source = editor.view.state.doc.toString();
  78  |     const at = (needle) => {
  79  |       const position = source.indexOf(needle);
  80  |       const rect = editor.view.coordsAtPos(position);
  81  |       return editor.prepareContextMenu({
  82  |         x: rect.left + 1,
  83  |         y: (rect.top + rect.bottom) / 2,
  84  |         target: document.elementFromPoint(
  85  |           rect.left + 1,
  86  |           (rect.top + rect.bottom) / 2,
  87  |         ),
  88  |         preserveSelection: false,
  89  |       });
  90  |     };
  91  |     return {
  92  |       example: at("example"),
  93  |       real: at("two"),
  94  |       expectedFrom: source.indexOf("| Real"),
  95  |     };
  96  |   });
  97  |   expect(result.example.table).toBeNull();
  98  |   expect(result.example.block.type).toBe("fence");
  99  |   expect(result.real.table.from).toBe(result.expectedFrom);
  100 |   expect(result.real.table.row).toBe(2);
  101 |   expect(result.real.table.col).toBe(1);
  102 | });
  103 | 
  104 | for (const zoom of [0.75, 1.5, 2]) {
  105 |   test(`native context dispatch uses CSS coordinates at ${zoom * 100} percent zoom before the DOM menu opens`, async () => {
  106 |     const window = await app.browserWindow(page);
  107 |     await window.evaluate(
  108 |       (window, zoom) => window.webContents.setZoomFactor(zoom),
  109 |       zoom,
  110 |     );
  111 |     await app.evaluate(({ BrowserWindow, Menu }) => {
  112 |       global.__zoomContext = { native: 0, custom: 0 };
  113 |       Menu.prototype.popup = function () {
  114 |         global.__zoomContext.native++;
  115 |       };
  116 |       const contents = BrowserWindow.getAllWindows()[0].webContents;
  117 |       const send = contents.send.bind(contents);
  118 |       contents.send = (channel, ...args) => {
  119 |         if (channel === "inkstone:context-menu-details") {
  120 |           global.__zoomContext.custom++;
  121 |           global.__zoomContext.details = args[0];
  122 |         }
  123 |         return send(channel, ...args);
  124 |       };
  125 |     });
  126 |     await page.evaluate(() => {
  127 |       __inkstone.editor.setMode("source");
  128 |       // Exercise native hit testing even when the renderer menu opens first.
  129 |       const query = document.querySelector.bind(document);
  130 |       document.querySelector = (selector) =>
  131 |         selector ===
  132 |         '[data-inkstone-context-menu="true"][role="menu"]:not([hidden])'
  133 |           ? null
  134 |           : query(selector);
  135 |       document.addEventListener(
  136 |         "contextmenu",
  137 |         (event) => {
  138 |           window.__testContextPoint = { x: event.clientX, y: event.clientY };
  139 |         },
  140 |         true,
  141 |       );
  142 |     });
  143 |     await page
  144 |       .locator(".cm-line")
  145 |       .filter({ hasText: "Editor text." })
  146 |       .click({ button: "right" });
  147 |     await expect(
  148 |       page.locator('.editor-context-menu[data-context-depth="0"]'),
  149 |     ).toBeVisible();
  150 |     await expect
  151 |       .poll(() =>
  152 |         app.evaluate(
  153 |           () => global.__zoomContext.custom + global.__zoomContext.native,
  154 |         ),
  155 |       )
  156 |       .toBe(1);
  157 |     const dispatched = await app.evaluate(() => global.__zoomContext);
  158 |     expect(dispatched).toMatchObject({
  159 |       native: 0,
  160 |       custom: 1,
  161 |     });
  162 |     const point = await page.evaluate(() => window.__testContextPoint);
> 163 |     expect(Math.abs(dispatched.details.x - point.x)).toBeLessThan(2);
      |                                                      ^ Error: expect(received).toBeLessThan(expected)
  164 |     expect(Math.abs(dispatched.details.y - point.y)).toBeLessThan(2);
  165 |   });
  166 | }
  167 | 
  168 | test("native dictionary additions reject empty, multiword and oversized input", async () => {
  169 |   for (const word of ["", "two words", "word\nnext", "x".repeat(257)])
  170 |     await expect(
  171 |       page.evaluate(
  172 |         (word) => __inkstone.invoke("addDictionaryWord", { word }),
  173 |         word,
  174 |       ),
  175 |     ).rejects.toThrow(/SPELLCHECK/);
  176 | });
  177 | 
```