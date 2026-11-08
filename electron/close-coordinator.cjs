"use strict";
const { randomUUID } = require("node:crypto");

// Every exit first asks all affected renderers to prepare, then to finish
// persistence. No native window closes until both phases have succeeded.
class CloseCoordinator {
  constructor({ send, close, isOpen, onUnready, readinessTimeout = 30000 }) {
    this.send = send;
    this.close = close;
    this.isOpen = isOpen;
    this.onUnready = onUnready;
    this.readinessTimeout = readinessTimeout;
    this.readyWindows = new Set();
    this.current = null;
  }
  get busy() {
    return !!this.current;
  }
  ready(id) {
    this.readyWindows.add(id);
    const request = this.current?.requests.get(id);
    if (request?.pending && !request.sent && !request.recovering)
      this.deliver(request);
  }
  request(ids, reason = "close") {
    if (this.current) {
      if (this.current.phase === "prepare") {
        for (const id of ids) this.current.ids.add(id);
        if (reason === "quit") this.current.reason = "quit";
        return this.current.promise;
      }
      return this.current.promise.then((result) =>
        result
          ? this.request(
              ids.filter((id) => this.isOpen(id)),
              reason,
            )
          : false,
      );
    }
    const operation = {
      ids: new Set(ids),
      reason,
      phase: "prepare",
      requests: new Map(),
    };
    this.current = operation;
    operation.promise = Promise.resolve().then(() => this.run(operation));
    return operation.promise;
  }
  deliver(request) {
    clearTimeout(request.timer);
    request.sent = true;
    this.send(
      request.id,
      request.phase === "prepare" ? "before-close" : "before-close-commit",
      {
        requestId: request.requestId,
        reason: this.current.reason,
      },
    );
  }
  armReadinessTimeout(request) {
    if (!this.onUnready) return;
    clearTimeout(request.timer);
    request.timer = setTimeout(() => {
      if (request.pending && !request.sent) void this.recover(request);
    }, this.readinessTimeout);
    request.timer.unref?.();
  }
  async recover(request) {
    if (!request.pending || request.recovering || !this.onUnready) return;
    request.recovering = true;
    let decision;
    try {
      decision = await this.onUnready(request.id);
    } catch {
      decision = "cancel";
    }
    request.recovering = false;
    if (!request.pending) return;
    if (decision === "close") {
      request.nativeApproved = true;
      this.respond(request.id, request.requestId, request.phase, true);
    } else if (decision === "retry") {
      if (this.readyWindows.has(request.id)) {
        if (!request.sent) this.deliver(request);
      } else this.armReadinessTimeout(request);
    } else this.respond(request.id, request.requestId, request.phase, false);
  }
  unresponsive(id) {
    const request = this.current?.requests.get(id);
    if (request?.pending) void this.recover(request);
  }
  wait(operation, id, phase) {
    let request = operation.requests.get(id);
    if (!request) {
      request = { id, requestId: randomUUID() };
      operation.requests.set(id, request);
    }
    request.phase = phase;
    request.sent = false;
    return new Promise((resolve) => {
      request.pending = resolve;
      if (this.readyWindows.has(id)) this.deliver(request);
      else this.armReadinessTimeout(request);
    });
  }
  respond(id, requestId, phase, allow, error) {
    const request = this.current?.requests.get(id);
    if (
      !request ||
      request.requestId !== requestId ||
      request.phase !== phase ||
      !request.pending
    )
      return false;
    const resolve = request.pending;
    clearTimeout(request.timer);
    request.pending = null;
    resolve({ allow: allow === true, error });
    return true;
  }
  removed(id) {
    this.readyWindows.delete(id);
    const request = this.current?.requests.get(id);
    if (request?.pending)
      this.respond(id, request.requestId, request.phase, false);
  }
  abort(operation, error) {
    for (const request of operation.requests.values()) {
      clearTimeout(request.timer);
      request.pending = null;
      if (this.isOpen(request.id))
        this.send(request.id, "close-aborted", {
          requestId: request.requestId,
          ...(error ? { error } : {}),
        });
    }
    if (this.current === operation) this.current = null;
    return false;
  }
  async run(operation) {
    try {
      for (const id of operation.ids) {
        if (!this.isOpen(id)) continue;
        const decision = await this.wait(operation, id, "prepare");
        if (!decision.allow) return this.abort(operation, decision.error);
      }
      operation.phase = "commit";
      for (const id of operation.ids) {
        if (!this.isOpen(id)) continue;
        if (operation.requests.get(id)?.nativeApproved) continue;
        const decision = await this.wait(operation, id, "commit");
        if (!decision.allow) return this.abort(operation, decision.error);
      }
      this.current = null;
      this.close(
        [...operation.ids].filter((id) => this.isOpen(id)),
        operation.reason,
        [...operation.requests.values()]
          .filter((request) => request.nativeApproved)
          .map((request) => request.id),
      );
      return true;
    } catch (error) {
      return this.abort(operation, error.message);
    }
  }
}
module.exports = { CloseCoordinator };
