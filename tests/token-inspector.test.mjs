import { translate } from "../lib/i18n/translate.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Run the production pointer handlers, including their propagation and tool
// branches, with isolated state and persistence instead of a live campaign.
const source = readFileSync(new URL("../app/VersTable.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("VersTable.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    nodes.set(node.name.text, node.initializer);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const expression = (name) => nodes.get(name).getText(ast);
const handlers = [
  "startTokenMove", "boardPointerDown", "boardPointerMove", "boardPointerUp",
  "updateTokenSelectionBox", "startSceneAssetMove", "chooseBoardTool",
  "viewportPointerDown", "viewportPointerMove", "viewportPointerUp",
  "deleteToken", "deleteSelectedTokens",
];
const code = ts.transpileModule([
  ...handlers.map((name) => `globalThis.${name} = ${expression(name)};`),
  `globalThis.resolveSelectedToken = () => (${expression("selectedToken")});`,
  `globalThis.canViewStats = () => (${expression("canViewSelectedTokenStats")});`,
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const a = { id: "a", name: "Example token", scene_id: "scene", x: 1, y: 1, size: 1, owner_user_id: "me", hp_current: 20 };
  const b = { ...a, id: "b", name: "Altro token", x: 6, owner_user_id: "other" };
  const c = { ...b, id: "c", x: 10 };
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  class Element {
    closest() { return null; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
  }
  const ctx = {
    t: (key, values) => translate(key, "it", values),
    Element, Math, Set, Map,
    activeSceneId: "scene",
    activeScene: { id: "scene", grid_cell_px: 20, grid_offset_x: 0, grid_offset_y: 0, fog_enabled: true },
    tokens: [a, b, c], revealedTokens: [a, b, c], revealedTokenIds: new Set(["a", "b", "c"]),
    inspectedTokenId: "a", selectedTokenId: "a", selectedTokenIds: ["a"],
    selectedSceneAssetId: null, selectedDrawingId: null, tokenSelectionBox: null,
    tool: "select", drawMode: "freehand", drawings: [], fogBrushPreview: null,
    hasMasterAccess: true, isMaster: true, user: { uid: "me" }, deletingTokenSelection: false,
    pointerRef: { current: null }, pingHoldTimerRef: { current: null },
    optimisticTokenPatchesRef: { current: new Map() },
    tokenSaveTimersRef: { current: new Map() }, pendingTokenPatchesRef: { current: new Map() },
    inFlightTokenPatchesRef: { current: new Map() },
    fogStateTrackerRef: { current: { apply: (_id, scene) => scene } },
    PING_HOLD_MS: 500, PING_HOLD_MOVE_TOLERANCE_PX: 5, DRAWING_SELECT_TOLERANCE_PX: 8,
    BOARD_INTERACTIVE_SELECTOR: "button", DRAWING_MIN_HALF_SIZE_PX: 4,
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    boardPoint: (x, y) => ({ x, y }), pointToCell: (x, y) => ({ x: Math.floor(x / 20), y: Math.floor(y / 20) }),
    canControlToken: (token) => ctx.hasMasterAccess || token.owner_user_id === "me",
    canManipulateDrawing: () => true, drawingTouchesPoint: () => true,
    snapPointToGrid: (_scene, point) => point, constrainedShapePoint: (_start, point) => point,
    createFogStrokeCells: () => new Set(), rollerColor: () => "#fff",
    paintFog: () => { calls.push("fog"); ctx.pointerRef.current.patch = { fog_enabled: true }; },
    persistFogState: async () => { calls.push("save-fog"); },
    eraseDrawingsAtPoint: () => { calls.push("erase"); ctx.pointerRef.current.erasedIds.push("drawing"); },
    persistDrawingPatch: async () => { calls.push("save-drawing"); },
    firePing: () => { calls.push("ping"); },
    loadSceneData: async () => { calls.push("refresh"); },
    window: {
      setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
      clearTimeout(id) { timers.delete(id); }, confirm: () => true,
    },
    supabase: {
      from(table) {
        calls.push(table);
        const query = {
          insert(value) { calls.push(["insert", value]); return this; },
          delete() { calls.push("delete"); return this; },
          eq(key, value) { calls.push([key, value]); return this; },
          in(key, value) { calls.push([key, value]); return this; },
          then(resolve) { return Promise.resolve({ error: ctx.databaseError ?? null }).then(resolve); },
        };
        return query;
      },
    },
  };
  for (const name of [
    "inspectedTokenId", "selectedTokenId", "selectedTokenIds", "selectedSceneAssetId",
    "selectedDrawingId", "tokenSelectionBox", "tool", "drawToolMenuOpen", "eraserMenuOpen",
    "fogBrushMenuTool", "drawDraft", "measurePreview", "fogBrushPreview", "movePreview",
    "drawings", "sceneAssets", "isPanning", "viewport", "deletingTokenSelection", "error", "tokens",
  ]) {
    ctx[`set${name[0].toUpperCase()}${name.slice(1)}`] = (value) => {
      ctx[name] = typeof value === "function" ? value(ctx[name]) : value;
    };
  }
  ctx.notify = (message) => calls.push(message);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  Object.defineProperty(ctx, "selectedToken", { get: () => ctx.resolveSelectedToken() });
  Object.defineProperty(ctx, "drawingsRef", { get: () => ({ current: ctx.drawings }) });
  const target = new Element();
  const event = (changes = {}) => ({
    button: 0, pointerId: 1, type: "pointerup", clientX: 80, clientY: 80,
    target, currentTarget: target,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
    ...changes,
  });
  return { ctx, a, b, c, calls, timers, target, event };
}

test("empty map click and long-press ping retain the inspector while clearing the movement group", async () => {
  const { ctx, event, timers, calls } = setup();
  ctx.selectedTokenIds = ["a", "b"];
  ctx.boardPointerDown(event());
  assert.equal(ctx.selectedToken.name, "Example token");
  assert.equal(ctx.selectedTokenId, null);
  assert.deepEqual(plain(ctx.selectedTokenIds), []);
  assert.equal(ctx.pointerRef.current.mode, "ping");
  [...timers.values()][0]();
  assert.ok(calls.includes("ping"));
  await ctx.boardPointerUp(event());
  assert.equal(ctx.selectedToken.id, "a");
  assert.equal(ctx.pointerRef.current, null);
});

test("explicit token clicks switch the inspector and retain normal/group movement", () => {
  const { ctx, b, event } = setup();
  const click = event();
  ctx.startTokenMove(click, b);
  assert.equal(ctx.selectedToken.id, "b");
  assert.equal(ctx.pointerRef.current.mode, "token");
  assert.deepEqual(plain(ctx.pointerRef.current.origins.map((item) => item.tokenId)), ["b"]);
  assert.equal(click.stopped, true);
  ctx.selectedTokenIds = ["a", "b"];
  ctx.startTokenMove(event(), b);
  assert.deepEqual(plain(ctx.pointerRef.current.origins.map((item) => item.tokenId)), ["a", "b"]);
  ctx.startTokenMove(event({ shiftKey: true }), b);
  assert.deepEqual(plain(ctx.selectedTokenIds), ["a"]);
  assert.equal(ctx.selectedToken.id, "b", "group membership does not choose another inspector token");
});

test("marquee selection keeps its own members without changing the inspected token", async () => {
  const { ctx, event } = setup();
  ctx.boardPointerDown(event({ clientX: 110, clientY: 10 }));
  ctx.boardPointerMove(event({ clientX: 230, clientY: 50 }));
  assert.equal(ctx.pointerRef.current.mode, "token-select");
  assert.deepEqual(plain(ctx.selectedTokenIds), ["b", "c"]);
  assert.equal(ctx.selectedToken.id, "a");
  await ctx.boardPointerUp(event());
  assert.equal(ctx.tokenSelectionBox, null);
  ctx.updateTokenSelectionBox({ startX: 300, startY: 300, endX: 310, endY: 310 });
  assert.deepEqual(plain(ctx.selectedTokenIds), []);
  assert.equal(ctx.selectedToken.id, "a");
});

test("drawing, erasing, measurement and both fog tools still work over another token", async () => {
  for (const tool of ["draw", "erase", "measure", "reveal", "hide"]) {
    const { ctx, b, event, calls } = setup();
    ctx.chooseBoardTool(tool);
    const down = event();
    ctx.startTokenMove(down, b);
    assert.notEqual(down.stopped, true, "the tool must receive the pointer event");
    ctx.boardPointerDown(down);
    assert.equal(ctx.pointerRef.current.mode, ["reveal", "hide"].includes(tool) ? "fog" : tool);
    ctx.boardPointerMove(event({ clientX: 100, clientY: 100 }));
    await ctx.boardPointerUp(event());
    assert.equal(ctx.selectedToken.id, "a", tool);
    if (tool === "draw") assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "insert"));
    if (tool === "erase") assert.ok(calls.includes("erase") && calls.includes("delete"));
    if (tool === "measure") assert.equal(ctx.measurePreview.endX, 100);
    if (["reveal", "hide"].includes(tool)) assert.ok(calls.includes("save-fog"));
  }
});

test("selecting/moving a drawing or prop leaves the token inspector available", async () => {
  const { ctx, event, calls } = setup();
  ctx.drawings = [{ id: "drawing", kind: "freehand", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }];
  ctx.boardPointerDown(event());
  assert.equal(ctx.selectedDrawingId, "drawing");
  assert.equal(ctx.selectedTokenId, null);
  ctx.boardPointerMove(event({ clientX: 100 }));
  await ctx.boardPointerUp(event());
  assert.ok(calls.includes("save-drawing"));
  assert.equal(ctx.selectedToken.id, "a");
  ctx.startSceneAssetMove(event(), { id: "prop", x: 0, y: 0, width: 50, height: 50 });
  assert.equal(ctx.pointerRef.current.mode, "scene-asset-move");
  assert.equal(ctx.selectedSceneAssetId, "prop");
  assert.equal(ctx.selectedToken.id, "a");
});

test("right-button panning does not switch the inspector or interfere with fog painting", () => {
  const { ctx, b, event } = setup();
  ctx.startTokenMove(event({ button: 2 }), b);
  ctx.viewportPointerDown(event({ button: 2 }));
  ctx.viewportPointerMove(event({ clientX: 100, clientY: 90 }));
  ctx.viewportPointerUp(event());
  assert.deepEqual(plain(ctx.viewport.pan), { x: 20, y: 10 });
  assert.equal(ctx.selectedToken.id, "a");
  ctx.pointerRef.current = { mode: "fog" };
  ctx.viewportPointerDown(event({ button: 2 }));
  assert.equal(ctx.pointerRef.current.mode, "fog");
});

test("locked tokens can be inspected; hidden tokens and private stats keep their restrictions", () => {
  const { ctx, b, event } = setup();
  b.locked = true;
  ctx.startTokenMove(event(), b);
  assert.equal(ctx.selectedToken.id, "b");
  assert.equal(ctx.pointerRef.current, null);
  ctx.hasMasterAccess = false;
  assert.equal(ctx.canViewStats(), false);
  ctx.inspectedTokenId = "a";
  ctx.revealedTokenIds.delete("b");
  ctx.startTokenMove(event(), b);
  assert.equal(ctx.selectedToken.id, "a");
  ctx.revealedTokens = [b];
  assert.equal(ctx.selectedToken, null, "a token hidden by fog cannot remain in the panel");
});

test("the inspector resolves current data and clears for another scene or a removed token", () => {
  const { ctx, a } = setup();
  ctx.revealedTokens = [{ ...a, hp_current: 8 }];
  assert.equal(ctx.selectedToken.hp_current, 8);
  ctx.activeSceneId = "another-scene";
  assert.equal(ctx.selectedToken, null);
  ctx.activeSceneId = "scene";
  ctx.revealedTokens = [];
  assert.equal(ctx.selectedToken, null);
});

test("deleting the inspected token clears it without clearing another movement selection", async () => {
  const { ctx, calls } = setup();
  ctx.selectedTokenId = "b";
  ctx.selectedTokenIds = ["b"];
  await ctx.deleteToken();
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "id" && call[1] === "a"));
  assert.equal(ctx.inspectedTokenId, null);
  assert.equal(ctx.selectedTokenId, "b");
  assert.deepEqual(plain(ctx.selectedTokenIds), ["b"]);
});

test("group deletion only clears the inspector if its token was part of the group", async () => {
  for (const selected of [["b", "c"], ["a", "b"]]) {
    const { ctx } = setup();
    ctx.selectedTokenIds = selected;
    await ctx.deleteSelectedTokens();
    assert.equal(ctx.inspectedTokenId, selected.includes("a") ? null : "a");
    assert.deepEqual(plain(ctx.selectedTokenIds), []);
  }
  const { ctx } = setup();
  ctx.databaseError = { message: "denied" };
  await ctx.deleteToken();
  assert.equal(ctx.selectedToken.id, "a");
});
