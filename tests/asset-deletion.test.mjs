import { translate } from "../lib/i18n/translate.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the actual table handler with an isolated backend and React state.
const source = readFileSync(new URL("../app/VersTable.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("VersTable.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "deleteCampaignSceneAsset") {
    handler = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, "campaign asset deletion handler exists");
const compiled = ts.transpileModule(`const handler = ${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const asset = {
  id: "cart", campaign_id: "campaign", kind: "prop", name: "Carretto",
  storage_path: "campaign/props/cart.png",
};
const otherAsset = { ...asset, id: "table", name: "Tavolo" };
const placements = [
  { id: "cart-1", asset_id: asset.id },
  { id: "cart-2", asset_id: asset.id },
  { id: "table-1", asset_id: otherAsset.id },
];

function setup(options = {}) {
  const events = [];
  const state = {
    assets: [asset, otherAsset], placements: [...placements],
    selected: options.selected ?? "cart-1", deleting: null, error: "old error", notice: null,
  };
  const assetUrlsRef = { current: { cart: "cart-url", table: "table-url" } };
  const setter = (key) => (value) => {
    state[key] = typeof value === "function" ? value(state[key]) : value;
  };
  const query = {
    delete() { events.push(["delete"]); return this; },
    eq(key, value) { events.push(["eq", key, value]); return this; },
    select(columns) { events.push(["select", columns]); return this; },
    async single() {
      events.push(["database"]);
      if (options.databaseReject) throw new Error("network unavailable");
      return options.databaseResult ?? { data: asset, error: null };
    },
  };
  const bindings = {
    t: (key, values) => translate(key, "it", values),
    ASSET_BUCKET: options.assetBucket ?? "vers-assets",
    hasMasterAccess: options.hasMasterAccess ?? true,
    deletingCampaignAssetId: options.deletingCampaignAssetId ?? null,
    campaign: { id: "campaign" },
    window: { confirm(message) { events.push(["confirm", message]); return options.confirm ?? true; } },
    supabase: {
      from(table) { events.push(["from", table]); return query; },
      storage: {
        from(bucket) {
          events.push(["bucket", bucket]);
          return { async remove(paths) {
            events.push(["remove", paths]);
            assert.equal(state.assets.length, 1, "UI follows the confirmed database deletion");
            if (options.storageWait) await options.storageWait;
            if (options.storageReject) throw new Error("storage unavailable");
            return { error: options.storageError ?? null };
          } };
        },
      },
    },
    assetUrlsRef, sceneAssetsRef: { current: state.placements },
    setDeletingCampaignAssetId: setter("deleting"), setError: setter("error"),
    setAssets: setter("assets"), setSceneAssets: setter("placements"),
    setSelectedSceneAssetId: setter("selected"), notify: setter("notice"),
  };
  const remove = new Function(...Object.keys(bindings), `${compiled}; return handler;`)(...Object.values(bindings));
  return { remove, state, events, urls: assetUrlsRef.current };
}

test("only the master can delete props from the current campaign", async () => {
  for (const [options, input] of [
    [{ hasMasterAccess: false }, asset],
    [{ deletingCampaignAssetId: "other" }, asset],
    [{}, { ...asset, campaign_id: "another-campaign" }],
    [{}, { ...asset, kind: "map" }],
    [{}, { ...asset, kind: "token" }],
  ]) {
    const run = setup(options);
    await run.remove(input);
    assert.deepEqual(run.events, []);
    assert.deepEqual(run.state.assets, [asset, otherAsset]);
  }
});

test("cancelling confirmation preserves the file, library and every placement", async () => {
  const run = setup({ confirm: false });
  await run.remove(asset);
  assert.equal(run.events.length, 1);
  assert.match(run.events[0][1], /Carretto.*tutte le scene/);
  assert.deepEqual(run.state.placements, placements);
  assert.equal(run.urls.cart, "cart-url");
});

test("delete is scoped, clears all matching copies, then removes the stored file", async () => {
  const run = setup();
  await run.remove(asset);
  assert.deepEqual(run.events.slice(1), [
    ["from", "assets"], ["delete"], ["eq", "id", "cart"],
    ["eq", "campaign_id", "campaign"], ["eq", "kind", "prop"],
    ["select", "id, storage_path"], ["database"],
    ["bucket", "vers-assets"], ["remove", [asset.storage_path]],
  ]);
  assert.deepEqual(run.state.assets, [otherAsset]);
  assert.deepEqual(run.state.placements, [placements[2]]);
  assert.equal(run.state.selected, null);
  assert.deepEqual(run.urls, { table: "table-url" });
  assert.equal(run.state.deleting, null);
  assert.equal(run.state.error, "");
  assert.equal(run.state.notice, "Asset eliminato dalla campagna");
});

test("deleting one asset preserves selection on a different asset", async () => {
  const run = setup({ selected: "table-1" });
  await run.remove(asset);
  assert.equal(run.state.selected, "table-1");
});

test("denied, zero-row and failed database deletes never remove storage or local data", async () => {
  for (const options of [
    { databaseResult: { data: null, error: { message: "permission denied" } } },
    { databaseResult: { data: null, error: { code: "PGRST116", message: "zero rows" } } },
    { databaseReject: true },
  ]) {
    const run = setup(options);
    await run.remove(asset);
    assert.ok(!run.events.some(([event]) => event === "remove"));
    assert.deepEqual(run.state.assets, [asset, otherAsset]);
    assert.deepEqual(run.state.placements, placements);
    assert.equal(run.urls.cart, "cart-url");
    assert.equal(run.state.deleting, null);
    assert.ok(run.state.error);
    assert.equal(run.state.notice, null);
  }
});

test("storage failure reports partial completion without restoring deleted placements", async () => {
  for (const options of [{ storageError: { message: "denied" } }, { storageReject: true }]) {
    const run = setup(options);
    await run.remove(asset);
    assert.deepEqual(run.state.assets, [otherAsset]);
    assert.deepEqual(run.state.placements, [placements[2]]);
    assert.match(run.state.error, /Asset eliminato.*file caricato/);
    assert.equal(run.state.deleting, null);
    assert.equal(run.state.notice, null);
  }
});

test("deletion stays busy until file removal completes", async () => {
  let finish;
  const storageWait = new Promise((resolve) => { finish = resolve; });
  const run = setup({ storageWait });
  const pending = run.remove(asset);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.state.deleting, asset.id);
  finish();
  await pending;
  assert.equal(run.state.deleting, null);
});


test("an upgraded installation deletes from its configured existing bucket", async () => {
  const run = setup({ assetBucket: "previous-assets" });
  await run.remove(asset);
  assert.ok(run.events.some(([event, bucket]) => event === "bucket" && bucket === "previous-assets"));
  assert.ok(!run.events.some(([event, bucket]) => event === "bucket" && bucket === "vers-assets"));
  assert.deepEqual(run.state.assets, [otherAsset]);
});
