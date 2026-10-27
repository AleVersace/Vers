import assert from "node:assert/strict";
import test from "node:test";
import {
  characterMacroDockId,
  mergeMacroDockOrder,
  moveMacroDock,
  QUICK_DIE_DOCK_ID as die,
  readMacroDockOrder,
} from "../lib/vers/macro-dock-order.ts";

const characterA = characterMacroDockId("characterA");
const characterB = characterMacroDockId("characterB");
const characterC = characterMacroDockId("characterC");

test("old or malformed profiles retain a single quick die dock", () => {
  for (const layout of [null, {}, { version: 4 }, { macroDockOrder: "bad" }]) {
    assert.deepEqual(readMacroDockOrder(layout), [die]);
  }
  assert.deepEqual(readMacroDockOrder({
    macroDockOrder: [characterA, null, "unknown", "character:", characterA, die, die],
  }), [characterA, die]);
  assert.deepEqual(readMacroDockOrder({ macroDockOrder: [characterA] }), [die, characterA]);
});

test("the die and any character can move in both directions among several docks", () => {
  const original = [die, characterA, characterB, characterC];
  const movedDie = moveMacroDock(original, die, characterB, "after");
  assert.deepEqual(movedDie, [characterA, characterB, die, characterC]);
  assert.deepEqual(moveMacroDock(movedDie, characterC, characterA, "before"), [characterC, characterA, characterB, die]);
  assert.deepEqual(moveMacroDock(movedDie, die, characterA, "before"), original);
  assert.deepEqual(original, [die, characterA, characterB, characterC]);
});

test("closing and reopening a character preserves its place after saving and reloading", () => {
  const saved = JSON.parse(JSON.stringify({
    version: 4,
    macroDockOrder: [characterA, die, characterB],
  }));
  const restored = readMacroDockOrder(saved);
  const closed = mergeMacroDockOrder(restored, [die, characterB]);
  const reordered = moveMacroDock(closed, characterB, die, "before");
  assert.deepEqual(mergeMacroDockOrder(reordered, [die, characterA, characterB, characterC]),
    [characterA, characterB, die, characterC]);
});

test("self drops and unknown sources or targets do not alter saved positions", () => {
  const order = [characterA, die, characterB];
  assert.equal(moveMacroDock(order, die, die, "after"), order);
  assert.equal(moveMacroDock(order, "missing", characterA, "before"), order);
  assert.equal(moveMacroDock(order, die, "missing", "after"), order);
});
