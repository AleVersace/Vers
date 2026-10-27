import assert from "node:assert/strict";
import test from "node:test";
import {
  beginLatestLoad,
  createKeyedTaskQueue,
  invalidateLatestLoad,
  isLatestLoad,
  mergeNewestEntriesById,
  RealtimeDeadlineExceededError,
  shouldRunRealtimeWatchdog,
  withRealtimeDeadline,
} from "../lib/vers/realtime.ts";

test("only the newest asynchronous load may commit", () => {
  const sequence = { current: 0 };
  const first = beginLatestLoad(sequence);
  const second = beginLatestLoad(sequence);

  assert.equal(isLatestLoad(sequence, first), false);
  assert.equal(isLatestLoad(sequence, second), true);

  invalidateLatestLoad(sequence);
  assert.equal(isLatestLoad(sequence, second), false);
});

test("a snapshot cannot remove a live entry received while it was loading", () => {
  const serverEntries = [
    { id: "older", created_at: "2026-08-30T18:00:00.000Z", value: 12 },
  ];
  const currentEntries = [
    { id: "live", created_at: "2026-08-30T18:01:00.000Z", value: 19 },
    { id: "older", created_at: "2026-08-30T18:00:00.000Z", value: 8 },
  ];

  assert.deepEqual(mergeNewestEntriesById(serverEntries, currentEntries, 100), [
    currentEntries[0],
    serverEntries[0],
  ]);
});

test("a replacement waits for the previous channel cleanup", async () => {
  const runTask = createKeyedTaskQueue();
  const order = [];
  let finishCleanup = () => undefined;
  const cleanupGate = new Promise((resolve) => {
    finishCleanup = resolve;
  });

  const cleanup = runTask("campaign-1", async () => {
    order.push("cleanup:start");
    await cleanupGate;
    order.push("cleanup:end");
  });
  await Promise.resolve();
  const reconnect = runTask("campaign-1", async () => {
    order.push("reconnect:start");
  });
  await Promise.resolve();

  assert.deepEqual(order, ["cleanup:start"]);
  finishCleanup();
  await Promise.all([cleanup, reconnect]);
  assert.deepEqual(order, [
    "cleanup:start",
    "cleanup:end",
    "reconnect:start",
  ]);
});

test("the watchdog reconciles after inactivity or at the hard deadline", () => {
  const thresholds = { idleAfterMs: 60_000, hardAfterMs: 120_000 };

  assert.equal(
    shouldRunRealtimeWatchdog({
      ...thresholds,
      lastActivityAt: 50_000,
      lastReconciliationAt: 1_000,
      now: 60_999,
    }),
    false,
  );
  assert.equal(
    shouldRunRealtimeWatchdog({
      ...thresholds,
      lastActivityAt: 1_000,
      lastReconciliationAt: 1_000,
      now: 61_000,
    }),
    true,
  );
  assert.equal(
    shouldRunRealtimeWatchdog({
      ...thresholds,
      // Continuous events must not postpone a full reconciliation forever.
      lastActivityAt: 120_999,
      lastReconciliationAt: 1_000,
      now: 121_000,
    }),
    true,
  );
});

test("a hung realtime reconciliation is released by its deadline", async () => {
  let resolveOperation = () => undefined;
  const operation = new Promise((resolve) => {
    resolveOperation = resolve;
  });
  await assert.rejects(
    withRealtimeDeadline(operation, 5),
    (reason) =>
      reason instanceof RealtimeDeadlineExceededError &&
      reason.message.includes("5 ms"),
  );
  resolveOperation("too late");
  await Promise.resolve();
});

test("the realtime deadline is cleared after a successful reconciliation", async () => {
  assert.equal(
    await withRealtimeDeadline(Promise.resolve("current"), 1_000),
    "current",
  );
});
