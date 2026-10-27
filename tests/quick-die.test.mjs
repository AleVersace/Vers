import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  MAX_QUICK_DICE_COUNT,
  normalizeQuickDiceCount,
  quickDiceFormula,
  rollQuickDice,
} from "../lib/vers/macro-roll.ts";

function sequence(sides, count, mode, values) {
  const draws = [];
  const result = rollQuickDice(sides, count, mode, (size) => {
    assert.equal(size, sides);
    const value = values[draws.length];
    assert.ok(value >= 1 && value <= size, "unexpected die roll");
    draws.push(value);
    return value;
  });
  assert.equal(draws.length, values.length);
  return result;
}

test("one normal quick die keeps its original formula, result and breakdown", () => {
  const result = sequence(20, 1, "normal", [13]);
  assert.equal(result.formula, "d20");
  assert.equal(result.breakdown, "d20: 13");
  assert.equal(result.total, 13);
  assert.equal(result.comparison, undefined);
});

test("normal spot rolls include every die once and show their sum", () => {
  const result = sequence(6, 3, "normal", [2, 6, 4]);
  assert.equal(result.formula, "3d6");
  assert.equal(result.breakdown, "3d6: 2 + 6 + 4 = 12");
  assert.equal(result.total, 12);
  assert.deepEqual(result.baseRolls.map((die) => die.result), [2, 6, 4]);
  assert.deepEqual(result.temporaryRolls, []);
});

test("ADV and DIS work with a single quick die", () => {
  for (const [mode, total] of [["adv", 17], ["dis", 4]]) {
    const result = sequence(20, 1, mode, [4, 17]);
    assert.equal(result.total, total);
    assert.equal(result.baseRolls.length, 1);
    assert.match(result.breakdown, new RegExp(mode.toUpperCase()));
    assert.deepEqual(result.comparison.rolls.map((roll) => roll.total), [4, 17]);
  }
});

test("ADV/DIS compare complete pools by total, without mixing individual dice", () => {
  const advantage = sequence(6, 3, "adv", [6, 1, 1, 3, 3, 3]);
  assert.deepEqual(advantage.baseRolls.map((die) => die.result), [3, 3, 3]);
  assert.equal(advantage.total, 9);
  assert.equal(advantage.comparison.selected, 1);
  assert.equal(advantage.breakdown, "ADV · dadi 8 / 9 → tiro 2: 9 · 3d6: 3 + 3 + 3 = 9");
  const disadvantage = sequence(6, 3, "dis", [6, 1, 1, 3, 3, 3]);
  assert.deepEqual(disadvantage.baseRolls.map((die) => die.result), [6, 1, 1]);
  assert.equal(disadvantage.total, 8);
  assert.equal(disadvantage.comparison.selected, 0);
});

test("ties use the first pool and never cause an extra roll", () => {
  for (const mode of ["adv", "dis"]) {
    const result = sequence(6, 2, mode, [6, 1, 3, 4]);
    assert.equal(result.comparison.selected, 0);
    assert.deepEqual(result.baseRolls.map((die) => die.result), [6, 1]);
  }
});

test("count settings are bounded and tolerate invalid or missing browser storage", () => {
  for (const input of [null, undefined, "", "bad", NaN, Infinity, -2, 0, {}]) {
    assert.equal(normalizeQuickDiceCount(input), 1);
  }
  assert.equal(normalizeQuickDiceCount("12"), 12);
  assert.equal(normalizeQuickDiceCount(3.8), 3);
  assert.equal(normalizeQuickDiceCount(999999), MAX_QUICK_DICE_COUNT);
  assert.equal(quickDiceFormula(100, 2), "2d100");
});

test("maximum quantity and custom faces stay within the existing log limits", () => {
  const result = sequence(10000, 50, "adv", Array(100).fill(10000));
  assert.equal(result.formula, "50d10000");
  assert.equal(result.baseRolls.length, 50);
  assert.equal(result.total, 500000);
  assert.ok(result.breakdown.length < 5000);
  assert.equal(result.total, result.baseRolls.reduce((total, die) => total + die.result, 0));
});

// Verify the actual quick-die UI handler's log/popup contract as well as math.
const source = readFileSync(new URL("../app/VersTable.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("VersTable.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) nodes.set(node.name.text, node.initializer);
  ts.forEachChild(node, visit);
}
visit(ast);
function handler(name, bindings) {
  const code = ts.transpileModule(`const fn = ${nodes.get(name).getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return fn;`)(...Object.values(bindings));
}

function loggedRoll(mode = "normal", count = 1, sides = 20, values = [13]) {
  const entries = [], popups = [], closed = [], callbacks = [];
  let index = 0;
  handler("rollQuickDie", {
    rollQuickDice, quickDieSides: sides, quickDieCount: count, quickDieMode: mode,
    rollDie: () => values[index++], profileDisplayName: "Player",
    macroRollTimerRef: { current: null }, macroRollSequenceRef: { current: 0 },
    window: { clearTimeout() {}, setTimeout(fn) { callbacks.push(fn); return 1; } },
    recordDiceRoll: (entry) => entries.push(entry),
    setMacroRollResult: (value) => popups.push(typeof value === "function" ? value(popups.at(-1)) : value),
    setQuickDiePickerOpen: (open) => closed.push(open), setMacroMenu: () => {},
  })();
  return { entries, popups, closed, callbacks, draws: index };
}

test("the existing single-die chat payload is unchanged", () => {
  const result = loggedRoll();
  assert.deepEqual(result.entries, [{
    characterId: null, kind: "quick_die", actorName: "Player", rollName: "Dado rapido · d20",
    formula: "d20", breakdown: "d20: 13", total: 13,
    details: { dice: [{ sides: 20, result: 13, temporary: false, damage_type: "" }], bonuses: [] },
  }]);
  assert.equal(result.draws, 1);
});

test("spot-roll logs preserve both attempts, selected dice and popup mode", () => {
  const { entries, popups, closed, callbacks, draws } = loggedRoll("adv", 3, 6, [6, 1, 1, 3, 3, 3]);
  assert.equal(draws, 6);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "quick_die");
  assert.equal(entries[0].formula, "3d6");
  assert.equal(entries[0].total, 9);
  assert.deepEqual(entries[0].details.dice.map((die) => die.result), [3, 3, 3]);
  assert.deepEqual(entries[0].details.bonuses, []);
  assert.deepEqual(entries[0].details.comparison.rolls.map((roll) => roll.dice), [[6, 1, 1], [3, 3, 3]]);
  assert.equal(popups[0].macroName, "3d6 · ADV");
  assert.deepEqual(closed, [false]);
  callbacks[0]();
  assert.equal(popups.at(-1).rolling, false);
});

test("quantity remains usable when saving local preferences fails", () => {
  let selected;
  handler("chooseQuickDieCount", {
    normalizeQuickDiceCount, setQuickDieCount: (value) => { selected = value; },
    QUICK_DIE_COUNT_STORAGE_KEY: "count", localStorage: { setItem() { throw new Error("blocked"); } },
  })(3);
  assert.equal(selected, 3);
});
