import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOptimisticTokenPositions,
  clearMatchingOptimisticTokenPositions,
  hasMatchingOptimisticTokenPosition,
  restoreMatchingOptimisticTokenPositions,
  TokenMoveSaveCoordinator,
} from "../lib/vers/token-movement.ts";

test("an optimistic move preserves unrelated local token fields", () => {
  const patches = new Map([["token", { size: 2 }]]);
  applyOptimisticTokenPositions(patches, [{ id: "token", x: 8, y: 5 }]);
  assert.deepEqual(patches.get("token"), { size: 2, x: 8, y: 5 });
});

test("a failed current move clears only its optimistic coordinates", () => {
  const patches = new Map([["token", { size: 2, x: 8, y: 5 }]]);
  const cleared = clearMatchingOptimisticTokenPositions(patches, [
    { id: "token", x: 8, y: 5 },
  ]);
  assert.deepEqual([...cleared], ["token"]);
  assert.deepEqual(patches.get("token"), { size: 2 });
});

test("an older failed move cannot clear a newer optimistic position", () => {
  const patches = new Map([["token", { x: 12, y: 9 }]]);
  const cleared = clearMatchingOptimisticTokenPositions(patches, [
    { id: "token", x: 8, y: 5 },
  ]);
  assert.equal(cleared.size, 0);
  assert.deepEqual(patches.get("token"), { x: 12, y: 9 });
});

test("a confirmation reload is needed only while the move is still pending", () => {
  const patches = new Map([["token", { x: 12, y: 9 }]]);
  assert.equal(
    hasMatchingOptimisticTokenPosition(patches, [
      { id: "token", x: 12, y: 9 },
    ]),
    true,
  );
  assert.equal(
    hasMatchingOptimisticTokenPosition(patches, [
      { id: "token", x: 8, y: 5 },
    ]),
    false,
  );
});

test("cancelling a drag restores the optimistic move that preceded it", () => {
  const patches = new Map([["token", { size: 2, x: 12, y: 9 }]]);
  const restored = restoreMatchingOptimisticTokenPositions(
    patches,
    [
      {
        tokenId: "token",
        priorOptimisticPosition: { x: 8, y: 5 },
      },
    ],
    [{ id: "token", x: 12, y: 9 }],
  );
  assert.deepEqual([...restored], ["token"]);
  assert.deepEqual(patches.get("token"), { size: 2, x: 8, y: 5 });
});

test("moves sharing a token are persisted in invocation order", async () => {
  const coordinator = new TokenMoveSaveCoordinator();
  const events = [];
  let releaseFirst = () => undefined;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const first = coordinator.run(["token"], async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
  });
  const second = coordinator.run(["token"], async () => {
    events.push("second:start");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("moves on unrelated tokens do not block one another", async () => {
  const coordinator = new TokenMoveSaveCoordinator();
  const events = [];
  let releaseFirst = () => undefined;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const first = coordinator.run(["token-a"], async () => {
    events.push("a:start");
    await firstGate;
    events.push("a:end");
  });
  const second = coordinator.run(["token-b"], async () => {
    events.push("b:start");
  });

  await second;
  assert.deepEqual(events, ["a:start", "b:start"]);
  releaseFirst();
  await first;
});
