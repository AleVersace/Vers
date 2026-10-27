import assert from "node:assert/strict";
import test from "node:test";
import {
  createFogStrokeCells,
  fogBrushBounds,
  FogStateTracker,
  isTokenVisibleThroughFog,
  paintFogCells,
} from "../lib/vers/fog.ts";
import {
  beginLatestLoad,
  createKeyedTaskQueue,
  isLatestLoad,
} from "../lib/vers/realtime.ts";

test("player tokens are hidden in unrevealed cells and return when revealed", () => {
  const token = { x: 2, y: 3, size: 1 };
  assert.equal(isTokenVisibleThroughFog(token, true, new Set(), false), false);
  assert.equal(
    isTokenVisibleThroughFog(token, true, new Set(["2:3"]), false),
    true,
  );
  assert.equal(
    isTokenVisibleThroughFog(token, true, new Set(["1:3", "3:3", "2:2", "2:4"]), false),
    false,
  );
});

test("masters see covered tokens, but player preview and ownership do not bypass fog", () => {
  const token = { x: 2, y: 3, size: 1, owner_user_id: "player" };
  assert.equal(isTokenVisibleThroughFog(token, true, new Set(), true), true);
  assert.equal(isTokenVisibleThroughFog(token, true, new Set(), false), false);
  assert.equal(isTokenVisibleThroughFog(token, false, new Set(), false), true);
});

test("large and fractional tokens stay visible only while overlapping a revealed cell", () => {
  const large = { x: 2, y: 3, size: 2 };
  assert.equal(isTokenVisibleThroughFog(large, true, new Set(["3:4"]), false), true);
  assert.equal(isTokenVisibleThroughFog(large, true, new Set(["4:3"]), false), false);
  const fractional = { x: 1.5, y: 0.5, size: 1 };
  assert.equal(isTokenVisibleThroughFog(fractional, true, new Set(["2:1"]), false), true);
  assert.equal(isTokenVisibleThroughFog(fractional, true, new Set(["3:1"]), false), false);
  const small = { x: 2.5, y: 3.5, size: 0.5 };
  assert.equal(isTokenVisibleThroughFog(small, true, new Set(["2:3"]), false), true);
  assert.equal(isTokenVisibleThroughFog(small, true, new Set(["3:3"]), false), false);
});

test("disabled fog cannot start either brush or replace the saved mask", () => {
  for (const savedMask of [[], ["1:1", "2:1"]]) {
    const state = { fog_enabled: false, revealed_cells: [...savedMask] };
    assert.equal(createFogStrokeCells(state), null);
    assert.deepEqual(state, { fog_enabled: false, revealed_cells: savedMask });

    // Explicit activation restores the original coverage, including a new map.
    const restored = createFogStrokeCells({ ...state, fog_enabled: true });
    assert.deepEqual([...restored], savedMask);
  }
});

test("revealing and covering preserve the other revealed cells", () => {
  const state = { fog_enabled: true, revealed_cells: ["0:0", "1:0"] };
  const cells = createFogStrokeCells(state);
  paintFogCells(cells, null, { x: 5, y: 3 }, true, 1, 6, 4);
  assert.deepEqual([...cells], ["0:0", "1:0", "5:3"]);
  assert.equal(paintFogCells(cells, null, { x: 5, y: 3 }, true, 1, 6, 4), false);
  paintFogCells(cells, null, { x: 1, y: 0 }, false, 1, 6, 4);
  assert.deepEqual([...cells], ["0:0", "5:3"]);
  assert.deepEqual(state.revealed_cells, ["0:0", "1:0"]);
});

test("a fast brush drag paints every cell between pointer samples", () => {
  const cells = new Set();
  paintFogCells(cells, { x: 0, y: 0 }, { x: 5, y: 5 }, true, 1, 6, 6);
  assert.deepEqual([...cells], ["0:0", "1:1", "2:2", "3:3", "4:4", "5:5"]);
  paintFogCells(cells, { x: 5, y: 5 }, { x: 0, y: 0 }, false, 1, 6, 6);
  assert.equal(cells.size, 0);
  paintFogCells(cells, { x: 0, y: 2 }, { x: 5, y: 2 }, true, 1, 6, 6);
  assert.deepEqual([...cells], ["0:2", "1:2", "2:2", "3:2", "4:2", "5:2"]);
});

test("the fog brush fits both map corners and maps smaller than the brush", () => {
  assert.deepEqual(fogBrushBounds({ x: 0, y: 0 }, 3, 6, 4), {
    startX: 0, startY: 0, endX: 2, endY: 2,
  });
  assert.deepEqual(fogBrushBounds({ x: 5, y: 3 }, 3, 6, 4), {
    startX: 3, startY: 1, endX: 5, endY: 3,
  });
  const cells = new Set();
  paintFogCells(cells, null, { x: 1, y: 0 }, true, 15, 2, 1);
  assert.deepEqual([...cells], ["0:0", "1:0"]);
});

test("a scene reload cannot erase a stroke, and stale completion cannot clear a newer toggle", () => {
  const tracker = new FogStateTracker();
  const server = { fog_enabled: false, revealed_cells: [], name: "Scene" };
  const first = tracker.stage("scene", { fog_enabled: true, revealed_cells: ["1:1"] });
  assert.deepEqual(tracker.apply("scene", server), { ...server, ...first });
  const second = tracker.stage("scene", { fog_enabled: false, revealed_cells: ["1:1"] });
  assert.equal(tracker.confirm("scene", first), false);
  assert.equal(tracker.discard("scene", first), false);
  assert.deepEqual(tracker.apply("scene", { ...server, ...first }), { ...server, ...second });
  assert.equal(tracker.apply("other-scene", server), server);
  assert.equal(tracker.discard("scene", second), true);
  assert.equal(tracker.apply("scene", server), server);
});

test("rapid fog saves persist in order while the latest stroke stays visible", async () => {
  const queue = createKeyedTaskQueue();
  const tracker = new FogStateTracker();
  const first = tracker.stage("scene", { fog_enabled: true, revealed_cells: ["1:1"] });
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const writes = [];
  const firstSave = queue("scene", async () => {
    writes.push(first);
    await gate;
    tracker.confirm("scene", first);
  });
  await Promise.resolve();
  await Promise.resolve();
  const second = tracker.stage("scene", { fog_enabled: true, revealed_cells: ["1:1", "2:2"] });
  const secondSave = queue("scene", async () => {
    assert.deepEqual(tracker.apply("scene", first), second);
    writes.push(second);
    tracker.confirm("scene", second);
  });
  assert.deepEqual(writes, [first]);
  releaseFirst();
  await Promise.all([firstSave, secondSave]);
  assert.deepEqual(writes, [first, second]);
});

test("a failed fog save does not block the next stroke or another scene", async () => {
  const queue = createKeyedTaskQueue();
  const tracker = new FogStateTracker();
  const first = tracker.stage("scene", { fog_enabled: true, revealed_cells: ["1:1"] });
  const next = tracker.stage("scene", { fog_enabled: true, revealed_cells: ["1:1", "2:2"] });
  const failed = queue("scene", async () => { throw new Error("offline"); });
  const recovery = queue("scene", async () => {
    assert.equal(tracker.discard("scene", first), false);
    assert.deepEqual(tracker.apply("scene", first), next);
    return "saved";
  });
  const independent = queue("other-scene", async () => "other saved");
  await assert.rejects(failed, /offline/);
  assert.equal(await recovery, "saved");
  assert.equal(await independent, "other saved");
});

test("confirming fog preserves an in-flight campaign read and its unrelated updates", () => {
  const tracker = new FogStateTracker();
  const sequence = { current: 0 };
  const request = beginLatestLoad(sequence);
  const fogReadVersion = tracker.captureReadVersion();
  const patch = tracker.stage("scene", {
    fog_enabled: true,
    revealed_cells: ["1:1"],
  });
  tracker.confirm("scene", patch);

  // This server snapshot predates the fog save, but has a new name and map.
  const incoming = {
    name: "Updated scene",
    map_asset_id: "new-map",
    fog_enabled: false,
    revealed_cells: [],
  };
  assert.equal(isLatestLoad(sequence, request), true);
  assert.deepEqual(tracker.apply("scene", incoming, fogReadVersion), {
    ...incoming,
    ...patch,
  });
  const otherScene = { ...incoming, name: "Other scene" };
  assert.equal(tracker.apply("other-scene", otherScene, fogReadVersion), otherScene);
});

test("a post-confirmation read can accept later remote fog edits", () => {
  const tracker = new FogStateTracker();
  const patch = tracker.stage("scene", {
    fog_enabled: true,
    revealed_cells: ["1:1"],
  });
  const olderReadVersion = tracker.captureReadVersion();
  tracker.confirm("scene", patch);
  const incoming = { fog_enabled: false, revealed_cells: ["2:2"] };
  assert.deepEqual(tracker.apply("scene", incoming, olderReadVersion), patch);

  const freshReadVersion = tracker.captureReadVersion();
  assert.equal(tracker.apply("scene", incoming, freshReadVersion), incoming);
  assert.equal(tracker.apply("scene", incoming), incoming);
});

test("a read between two saves cannot undo the second confirmed stroke", () => {
  const tracker = new FogStateTracker();
  const first = tracker.stage("scene", {
    fog_enabled: true,
    revealed_cells: ["1:1"],
  });
  tracker.confirm("scene", first);
  const readVersion = tracker.captureReadVersion();
  const second = tracker.stage("scene", {
    fog_enabled: true,
    revealed_cells: ["1:1", "2:2"],
  });
  tracker.confirm("scene", second);
  assert.deepEqual(tracker.apply("scene", first, readVersion), second);
  assert.deepEqual(
    tracker.apply("scene", second, tracker.captureReadVersion()),
    second,
  );
});

test("ending an older stroke must not re-enable fog after an explicit toggle", () => {
  const tracker = new FogStateTracker();
  const stroke = tracker.stage("scene", {
    fog_enabled: true,
    revealed_cells: ["1:1", "2:2"],
  });
  const disabled = tracker.stage("scene", {
    ...stroke,
    fog_enabled: false,
  });
  assert.equal(tracker.isCurrent("scene", stroke), false);
  assert.equal(tracker.isCurrent("scene", disabled), true);
  tracker.confirm("scene", disabled);
  assert.equal(tracker.isCurrent("scene", stroke), false);
  assert.deepEqual(tracker.apply("scene", stroke), disabled);
});
