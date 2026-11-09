"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { atomicWrite } = require("./storage.cjs");
const {
  AIError,
  defaults,
  validateSettings,
  validateRequest,
  streamCompletion,
  listModels,
  safeError,
} = require("./ai-provider.cjs");

class AIService {
  constructor({
    directory,
    safeStorage,
    platform = process.platform,
    fetchImpl = fetch,
  }) {
    this.directory = directory;
    this.safeStorage = safeStorage;
    this.platform = platform;
    this.fetch = fetchImpl;
    this.settings = { ...defaults };
    this.keys = {};
    this.active = new Map();
    this.closed = new Set();
    this.queue = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    try {
      const read = async (name) => {
        try {
          const bytes = await fs.readFile(path.join(this.directory, name));
          if (bytes.length > 65536) throw Error();
          return JSON.parse(bytes);
        } catch (e) {
          if (e.code === "ENOENT") return {};
          throw e;
        }
      };
      this.settings = validateSettings(await read("ai-models.json"));
      const keys = await read("ai-credentials.json");
      if (
        !keys ||
        typeof keys !== "object" ||
        Array.isArray(keys) ||
        Object.values(keys).some(
          (v) => typeof v !== "string" || v.length > 16000,
        )
      )
        throw Error();
      this.keys = keys;
    } catch {
      this.loadFailed = true;
    }
  }
  async secureAvailable() {
    try {
      if (
        this.platform === "linux" &&
        ["basic_text", "unknown"].includes(
          this.safeStorage.getSelectedStorageBackend(),
        )
      )
        return false;
      return await this.safeStorage.isAsyncEncryptionAvailable();
    } catch {
      return false;
    }
  }
  slot(settings = this.settings) {
    return settings.provider === "local"
      ? `local:${settings.endpoint}`
      : settings.provider;
  }
  async getSettings() {
    await this.ready;
    if (this.loadFailed)
      throw new AIError(
        "AI: Model configuration is damaged or unreadable. Restore ai-models.json / ai-credentials.json from a backup; existing files were preserved.",
      );
    return {
      ...this.settings,
      hasKey: !!this.keys[this.slot()],
      secureStorageAvailable: await this.secureAvailable(),
    };
  }
  async key(settings) {
    const encrypted = this.keys[this.slot(settings)];
    if (!encrypted) return "";
    if (!(await this.secureAvailable()))
      throw new AIError(
        "AI: Secure key storage is unavailable. Unlock your OS keyring or remove the saved key and use a local model.",
      );
    try {
      const result = await this.safeStorage.decryptStringAsync(
        Buffer.from(encrypted, "base64"),
      );
      return result.result;
    } catch {
      throw new AIError(
        "AI: The saved API key cannot be decrypted. Enter it again in AI / Models.",
      );
    }
  }
  saveSettings(payload) {
    const work = this.queue.then(async () => {
      await this.getSettings();
      const settings = validateSettings(payload, this.settings),
        keys = { ...this.keys },
        slot = this.slot(settings);
      if (
        Object.hasOwn(payload, "apiKey") &&
        (typeof payload.apiKey !== "string" ||
          payload.apiKey.length > 4096 ||
          /[\r\n\0]/.test(payload.apiKey))
      )
        throw new AIError("AI: Invalid API key.");
      if (payload.clearKey) delete keys[slot];
      else if (payload.apiKey?.trim()) {
        if (!(await this.secureAvailable()))
          throw new AIError(
            "AI: Secure OS key storage is unavailable. Configure a keyring or use a local model without a key.",
          );
        try {
          keys[slot] = (
            await this.safeStorage.encryptStringAsync(payload.apiKey.trim())
          ).toString("base64");
        } catch {
          throw new AIError(
            "AI: Could not encrypt the API key. Nothing was saved.",
          );
        }
      }
      try {
        await fs.mkdir(this.directory, { recursive: true });
        // Credentials contain only OS-encrypted bytes, never plaintext keys.
        await atomicWrite(
          path.join(this.directory, "ai-credentials.json"),
          JSON.stringify(keys),
        );
        this.keys = keys;
        await atomicWrite(
          path.join(this.directory, "ai-models.json"),
          JSON.stringify(settings, null, 2),
        );
        this.settings = settings;
      } catch {
        throw new AIError(
          "AI: Model settings could not be saved. Check disk space and permissions.",
        );
      }
      return this.getSettings();
    });
    this.queue = work.catch(() => {});
    return work;
  }
  begin(owner, id, timeout) {
    if (this.closed.has(owner))
      throw new AIError("AI: This window has closed.");
    this.cancel(owner);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeout);
    timer.unref?.();
    const item = { id, controller, timer };
    this.active.set(owner, item);
    return item;
  }
  end(owner, item) {
    clearTimeout(item.timer);
    if (this.active.get(owner) === item) this.active.delete(owner);
  }
  cancel(owner, id) {
    const item = this.active.get(owner);
    if (item && (!id || item.id === id)) {
      item.controller.abort("cancelled");
      clearTimeout(item.timer);
      this.active.delete(owner);
    }
    return { ok: true };
  }
  start(owner, payload, send) {
    const request = validateRequest(payload);
    const item = this.begin(owner, request.id, 600000);
    // Start after the IPC acknowledgement, so listeners can register before deltas arrive.
    setImmediate(async () => {
      const emit = (event) => {
        if (!this.closed.has(owner)) {
          try {
            send({ id: request.id, ...event });
          } catch {
            item.controller.abort("cancelled");
          }
        }
      };
      try {
        await this.ready;
        await this.queue;
        const settings = { ...(await this.getSettings()) };
        clearTimeout(item.timer);
        item.timer = setTimeout(
          () => item.controller.abort("timeout"),
          settings.timeoutMs,
        );
        item.timer.unref?.();
        item.controller.signal.throwIfAborted();
        const text = await streamCompletion(
          settings,
          await this.key(settings),
          request,
          item.controller.signal,
          (delta) => emit({ type: "delta", text: delta }),
          this.fetch,
        );
        item.controller.signal.throwIfAborted();
        emit({ type: "done", text });
      } catch (error) {
        emit({
          type: "error",
          message: safeError(error, item.controller.signal),
        });
      } finally {
        this.end(owner, item);
      }
    });
    return { id: request.id };
  }
  async models(owner) {
    await this.ready;
    await this.queue;
    const settings = { ...(await this.getSettings()) };
    const item = this.begin(
      owner,
      "models",
      Math.min(settings.timeoutMs, 30000),
    );
    try {
      return await listModels(
        settings,
        await this.key(settings),
        item.controller.signal,
        this.fetch,
      );
    } catch (error) {
      throw new AIError(safeError(error, item.controller.signal));
    } finally {
      this.end(owner, item);
    }
  }
  async test(owner) {
    await this.ready;
    await this.queue;
    const settings = { ...(await this.getSettings()), maxTokens: 64 };
    const item = this.begin(owner, "test", Math.min(settings.timeoutMs, 30000));
    try {
      await streamCompletion(
        settings,
        await this.key(settings),
        {
          task: "chat",
          text: "Connection test.",
          question: "Reply with OK.",
          history: [],
          locale: "en",
          documentType: "general",
        },
        item.controller.signal,
        () => {},
        this.fetch,
      );
      return {
        ok: true,
        message: "Connection successful. The selected model responded.",
      };
    } catch (error) {
      throw new AIError(safeError(error, item.controller.signal));
    } finally {
      this.end(owner, item);
    }
  }
  close(owner) {
    this.closed.add(owner);
    this.cancel(owner);
  }
  dispose() {
    for (const owner of this.active.keys()) this.close(owner);
  }
}
module.exports = { AIService };
