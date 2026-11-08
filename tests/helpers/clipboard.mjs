/** Keep native clipboard payloads in the Electron process, never in test output. */
export async function withPreservedClipboard(application, run) {
  await application.evaluate(async ({ clipboard, ClipboardItem }) => {
    global.__integrationClipboardSnapshot = await Promise.all(
      (await clipboard.read()).map(
        async (item) =>
          new ClipboardItem(
            Object.fromEntries(
              await Promise.all(
                item.types.map(async (type) => [
                  type,
                  await item.getType(type),
                ]),
              ),
            ),
          ),
      ),
    );
  });
  try {
    return await run();
  } finally {
    await application.evaluate(async ({ clipboard }) => {
      try {
        await clipboard.write(global.__integrationClipboardSnapshot);
      } finally {
        delete global.__integrationClipboardSnapshot;
      }
    });
  }
}
