const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CloseCoordinator } = require("../electron/close-coordinator.cjs");

function fixture() {
  const events = [],
    closed = [],
    open = new Set([1, 2]);
  let notify;
  const coordinator = new CloseCoordinator({
    isOpen: (id) => open.has(id),
    send: (id, event, payload) => {
      events.push({ id, event, ...payload });
      notify?.();
    },
    close: (ids, reason) => {
      closed.push({ ids, reason });
      ids.forEach((id) => open.delete(id));
    },
  });
  const next = async () => {
    if (!events.length)
      await new Promise((resolve) => {
        notify = resolve;
      });
    notify = null;
    return events.shift();
  };
  const answer = (event, allow) =>
    coordinator.respond(
      event.id,
      event.requestId,
      event.event === "before-close" ? "prepare" : "commit",
      allow,
    );
  return { coordinator, events, closed, next, answer };
}
test("quit cancellation retains every window including already approved clean windows", async () => {
  const { coordinator, closed, next, answer } = fixture();
  coordinator.ready(1);
  coordinator.ready(2);
  const finished = coordinator.request([1, 2], "quit");
  const first = await next();
  assert.equal(first.event, "before-close");
  answer(first, true);
  const second = await next();
  assert.equal(second.id, 2);
  assert.deepEqual(closed, []);
  answer(second, false);
  assert.equal(await finished, false);
  assert.deepEqual(closed, []);
  assert.equal((await next()).event, "close-aborted");
  assert.equal((await next()).event, "close-aborted");
  assert.equal(coordinator.busy, false);
});
test("commit persistence failure preserves all windows and a later quit can succeed", async () => {
  const { coordinator, closed, next, answer } = fixture();
  coordinator.ready(1);
  coordinator.ready(2);
  const firstAttempt = coordinator.request([1, 2], "quit");
  answer(await next(), true);
  answer(await next(), true);
  const commit = await next();
  assert.equal(commit.event, "before-close-commit");
  answer(commit, false);
  assert.equal(await firstAttempt, false);
  assert.deepEqual(closed, []);
  await next();
  await next();
  const secondAttempt = coordinator.request([1, 2], "quit");
  const first = await next();
  assert.equal(
    coordinator.respond(1, commit.requestId, "prepare", true),
    false,
  );
  answer(first, true);
  answer(await next(), true);
  answer(await next(), true);
  assert.deepEqual(closed, []);
  answer(await next(), true);
  assert.equal(await secondAttempt, true);
  assert.deepEqual(closed, [{ ids: [1, 2], reason: "quit" }]);
});
test("early close waits for renderer readiness and repeated quit shares one transaction", async () => {
  const { coordinator, events, closed, next, answer } = fixture();
  const initial = coordinator.request([1]);
  await Promise.resolve();
  assert.equal(events.length, 0);
  const quit = coordinator.request([1, 2], "quit");
  assert.equal(initial, quit);
  coordinator.ready(1);
  coordinator.ready(2);
  const first = await next();
  assert.equal(first.reason, "quit");
  assert.equal(answer(first, true), true);
  assert.equal(answer(first, true), false);
  answer(await next(), true);
  answer(await next(), true);
  answer(await next(), true);
  assert.equal(await initial, true);
  assert.deepEqual(closed, [{ ids: [1, 2], reason: "quit" }]);
});
test("unready timeout requests a native decision and never discards without explicit approval", async () => {
  const events = [],
    closed = [];
  let decide,
    fallbackCount = 0;
  const coordinator = new CloseCoordinator({
    isOpen: () => true,
    send: (id, event, payload) => events.push({ id, event, ...payload }),
    close: (ids, reason, forced) => closed.push({ ids, reason, forced }),
    readinessTimeout: 5,
    onUnready: () => {
      fallbackCount++;
      return new Promise((resolve) => {
        decide = resolve;
      });
    },
  });
  const canceled = coordinator.request([1]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fallbackCount, 1);
  assert.deepEqual(closed, []);
  decide("cancel");
  assert.equal(await canceled, false);
  assert.deepEqual(closed, []);
  assert.equal(events.at(-1).event, "close-aborted");
  const approved = coordinator.request([1]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(closed, []);
  decide("close");
  assert.equal(await approved, true);
  assert.deepEqual(closed, [{ ids: [1], reason: "close", forced: [1] }]);
});
test("normal save decisions have no readiness deadline after the renderer is ready", async () => {
  let recoveries = 0,
    pending;
  const coordinator = new CloseCoordinator({
    isOpen: () => true,
    send: (id, event, payload) => {
      pending = { id, event, ...payload };
    },
    close: () => assert.fail("a pending user choice must never close"),
    readinessTimeout: 5,
    onUnready: () => {
      recoveries++;
      return "close";
    },
  });
  coordinator.ready(1);
  const result = coordinator.request([1]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(recoveries, 0);
  coordinator.respond(1, pending.requestId, "prepare", false);
  assert.equal(await result, false);
});
test("a batch choice reaches only the windows it was made for", async () => {
  const { coordinator, next, answer } = fixture();
  coordinator.ready(1);
  coordinator.ready(2);
  const quit = coordinator.request([1, 2], "quit", {
    mode: "save",
    ids: [2],
  });
  const first = await next();
  assert.equal(first.batch, undefined);
  answer(first, true);
  const second = await next();
  assert.equal(second.batch, "save");
  answer(second, true);
  answer(await next(), true);
  answer(await next(), true);
  assert.equal(await quit, true);
  // "review" and unknown modes are not batches: every window asks.
  const { coordinator: other, next: nextOther } = fixture();
  other.ready(1);
  void other.request([1], "quit", { mode: "review", ids: [1] });
  assert.equal((await nextOther()).batch, undefined);
});
