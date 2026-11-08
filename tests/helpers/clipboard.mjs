import { randomUUID } from "node:crypto";

/** Keep native clipboard payloads in the Electron process, never in test output. */
export async function captureClipboard(application) {
  const key = `__integrationClipboard_${randomUUID()}`;
  await application.evaluate(async ({ clipboard, ClipboardItem }, key) => {
    global[key] = await Promise.all(
      // Windows may return an item with no MIME types for an empty clipboard.
      (await clipboard.read())
        .filter((item) => item.types.length)
        .map(
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
  }, key);
  return () =>
    application.evaluate(async ({ clipboard }, key) => {
      try {
        if (global[key].length) await clipboard.write(global[key]);
        else clipboard.clear();
      } finally {
        delete global[key];
      }
    }, key);
}

export async function withPreservedClipboard(application, run) {
  const restore = await captureClipboard(application);
  try {
    return await run();
  } finally {
    await restore();
  }
}
