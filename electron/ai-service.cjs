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
  providerDefaults,
  catalog,
} = require("./ai-provider.cjs");
const { getProvider } = require("./ai-catalog.cjs");

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
    this.profiles = {};
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
          if (bytes.length > 1024 * 1024) throw Error();
          return JSON.parse(bytes);
        } catch (e) {
          if (e.code === "ENOENT") return {};
          throw e;
        }
      };
      const stored = await read("ai-models.json");
      if (stored.schemaVersion === 2) {
        if (
          !stored.profiles ||
          typeof stored.profiles !== "object" ||
          Array.isArray(stored.profiles)
        )
          throw Error();
        for (const [provider, profile] of Object.entries(stored.profiles)) {
          const settings = validateSettings({ ...profile, provider });
          this.profiles[settings.provider] = settings;
        }
        if (!getProvider(stored.activeProvider)) throw Error();
        this.settings =
          this.profiles[stored.activeProvider] ||
          providerDefaults(stored.activeProvider);
      } else {
        this.settings = validateSettings(stored);
        if (Object.keys(stored).length)
          this.profiles[this.settings.provider] = this.settings;
      }
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
      this.keys = { ...keys };
      // Previous releases keyed cloud credentials only by provider. Migrate only
      // to that provider's official endpoint, never to a configured proxy.
      for (const provider of ["openai", "anthropic"]) {
        if (keys[provider]) {
          const slot = this.slot(providerDefaults(provider));
          this.keys[slot] ||= keys[provider];
          delete this.keys[provider];
        }
      }
      for (const [slot, encrypted] of Object.entries(keys)) {
        if (!slot.startsWith("local:")) continue;
        const settings = validateSettings({
          provider: "local",
          endpoint: slot.slice(6),
        });
        this.keys[this.slot(settings)] ||= encrypted;
        delete this.keys[slot];
      }
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
    return `${settings.provider}:${settings.endpoint}`;
  }
  candidate(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new AIError("AI: Invalid model configuration.");
    const provider = payload.provider || this.settings.provider;
    const prior =
      this.profiles[provider] ||
      (provider === this.settings.provider
        ? this.settings
        : provider === "local"
          ? defaults
          : providerDefaults(provider));
    return validateSettings(payload, prior);
  }
  validateKey(payload) {
    if (
      Object.hasOwn(payload, "apiKey") &&
      (typeof payload.apiKey !== "string" ||
        payload.apiKey.length > 4096 ||
        /[\r\n\0]/.test(payload.apiKey))
    )
      throw new AIError("AI: Invalid API key.");
  }
  async getSettings(payload = {}) {
    await this.ready;
    if (this.loadFailed)
      throw new AIError(
        "AI: Model configuration is damaged or unreadable. Restore ai-models.json / ai-credentials.json from a backup; existing files were preserved.",
      );
    const settings = this.candidate(payload);
    const secureStorageAvailable = await this.secureAvailable();
    const hasKey = !!this.keys[this.slot(settings)];
    const profiles = Object.fromEntries(
      catalog.map((definition) => {
        const profile =
          this.profiles[definition.id] || providerDefaults(definition.id);
        return [
          definition.id,
          {
            ...profile,
            hasKey: !!this.keys[this.slot(profile)],
            profileSaved: Object.hasOwn(this.profiles, definition.id),
          },
        ];
      }),
    );
    return {
      ...settings,
      profileSaved: Object.hasOwn(this.profiles, settings.provider),
      hasKey,
      secureStorageAvailable,
      ready: !!(
        settings.endpoint &&
        settings.model &&
        (!getProvider(settings.provider).requiresKey || hasKey) &&
        (!hasKey || secureStorageAvailable)
      ),
      providers: catalog,
      profiles,
    };
  }
  async resolveDraft(payload = {}) {
    await this.getSettings();
    this.validateKey(payload);
    const settings = this.candidate(payload);
    const key = payload.clearKey
      ? ""
      : payload.apiKey?.trim() || (await this.key(settings));
    return { settings, key };
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
      const settings = this.candidate(payload),
        keys = { ...this.keys },
        slot = this.slot(settings);
      this.validateKey(payload);
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
        const profiles = { ...this.profiles, [settings.provider]: settings };
        await atomicWrite(
          path.join(this.directory, "ai-models.json"),
          JSON.stringify(
            { schemaVersion: 2, activeProvider: settings.provider, profiles },
            null,
            2,
          ),
        );
        this.settings = settings;
        this.profiles = profiles;
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
          (attempt, of) => emit({ type: "retry", attempt, of }),
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
  async models(owner, payload = {}) {
    const item = this.begin(owner, "models", 30000);
    try {
      await this.ready;
      await this.queue;
      const { settings, key } = await this.resolveDraft(payload);
      clearTimeout(item.timer);
      item.timer = setTimeout(
        () => item.controller.abort("timeout"),
        Math.min(settings.timeoutMs, 30000),
      );
      item.timer.unref?.();
      item.controller.signal.throwIfAborted();
      return await listModels(
        settings,
        key,
        item.controller.signal,
        this.fetch,
      );
    } catch (error) {
      throw new AIError(safeError(error, item.controller.signal));
    } finally {
      this.end(owner, item);
    }
  }
  async test(owner, payload = {}) {
    const item = this.begin(owner, "test", 60000);
    try {
      await this.ready;
      await this.queue;
      const { settings, key } = await this.resolveDraft(payload);
      settings.maxTokens = Math.max(2048, Math.min(settings.maxTokens, 4096));
      clearTimeout(item.timer);
      item.timer = setTimeout(
        () => item.controller.abort("timeout"),
        Math.min(settings.timeoutMs, 60000),
      );
      item.timer.unref?.();
      item.controller.signal.throwIfAborted();
      await streamCompletion(
        settings,
        key,
        {
          task: "chat",
          text: "Connection test.",
          question: "Reply with OK.",
          history: [],
          locale: "en",
          documentType: "general",
          connectionTest: true,
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
