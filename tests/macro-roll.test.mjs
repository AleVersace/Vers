import assert from "node:assert/strict";
import test from "node:test";
import {
  macroRollComparisonSummary,
  rollMacroDice,
  toggleMacroRollMode,
} from "../lib/vers/macro-roll.ts";

const macro = {
  dice_sides: [20, 20],
  dice_damage_types: ["fire", "cold"],
  bonuses: [5, -2],
  is_damage_macro: true,
  temporary_dice_sides: [6],
  temporary_dice_damage_types: ["poison"],
  temporary_bonuses: [3],
};

function rollSequence(mode, values, input = macro) {
  const draws = [];
  const result = rollMacroDice(input, mode, (sides) => {
    const value = values[draws.length];
    assert.ok(value >= 1 && value <= sides, "unexpected or invalid die draw");
    draws.push(sides);
    return value;
  });
  assert.equal(draws.length, values.length, "every expected draw must occur exactly once");
  return { ...result, draws };
}

test("normal rolls keep the original dice, signed bonuses and temporary bonuses", () => {
  const result = rollSequence("normal", [20, 1, 4]);
  assert.deepEqual(result.draws, [20, 20, 6]);
  assert.equal(result.total, 31);
  assert.equal(result.comparison, undefined);
  assert.deepEqual(result.baseRolls.map(die => die.result), [20, 1]);
  assert.deepEqual(result.temporaryRolls.map(die => die.result), [4]);
});

test("ADV chooses a complete pool by its sum, never the best of each individual die", () => {
  const result = rollSequence("adv", [20, 1, 11, 11, 4]);
  assert.deepEqual(result.baseRolls.map(die => die.result), [11, 11]);
  assert.equal(result.total, 32);
  assert.equal(result.comparison.selected, 1);
  assert.deepEqual(result.comparison.rolls.map(roll => roll.total), [21, 22]);
});

test("DIS chooses the lower complete pool, never the worst of each individual die", () => {
  const result = rollSequence("dis", [20, 1, 11, 11, 4]);
  assert.deepEqual(result.baseRolls.map(die => die.result), [20, 1]);
  assert.equal(result.total, 31);
  assert.equal(result.comparison.selected, 0);
});

test("either candidate can win in either mode", () => {
  assert.equal(rollSequence("adv", [20, 20, 1, 1, 2]).comparison.selected, 0);
  assert.equal(rollSequence("dis", [20, 20, 1, 1, 2]).comparison.selected, 1);
});

test("temporary dice and all bonuses apply once after selection", () => {
  for (const mode of ["adv", "dis"]) {
    const result = rollSequence(mode, [1, 20, 11, 11, 6]);
    assert.deepEqual(result.draws, [20, 20, 20, 20, 6]);
    assert.deepEqual(result.temporaryRolls, [{ sides: 6, result: 6, damageType: "poison" }]);
    const selectedTotal = mode === "adv" ? 22 : 21;
    assert.equal(result.total, selectedTotal + 6 + 5 - 2 + 3);
  }
});

test("ties retain the first pool without another reroll", () => {
  for (const mode of ["adv", "dis"]) {
    const result = rollSequence(mode, [19, 1, 10, 10, 3]);
    assert.equal(result.comparison.selected, 0);
    assert.deepEqual(result.baseRolls.map(die => die.result), [19, 1]);
  }
});

test("selected damage types stay aligned, and non-damage rolls ignore damage metadata", () => {
  const result = rollSequence("adv", [20, 1, 11, 11, 4]);
  assert.deepEqual(result.baseRolls.map(die => die.damageType), ["fire", "cold"]);
  const plain = rollSequence("adv", [20, 1, 11, 11, 4], { ...macro, is_damage_macro: false });
  assert.ok([...plain.baseRolls, ...plain.temporaryRolls].every(die => die.damageType === ""));
});

test("mixed die sizes preserve order, and large pools obey the same selection rule", () => {
  const mixed = rollSequence("adv", [1, 8, 6, 1, 2], { ...macro, dice_sides: [6, 8] });
  assert.deepEqual(mixed.draws, [6, 8, 6, 8, 6]);
  assert.deepEqual(mixed.baseRolls.map(die => die.result), [1, 8]);
  const large = rollSequence("adv", [
    ...Array(50).fill(1), ...Array(50).fill(20), ...Array(50).fill(6),
  ], { ...macro, dice_sides: Array(50).fill(20), temporary_dice_sides: Array(50).fill(6) });
  assert.equal(large.draws.length, 150);
  assert.equal(large.total, 1306);
});

test("switching modes is exclusive and unchecking restores normal rolls", () => {
  assert.equal(toggleMacroRollMode("normal", "adv"), "adv");
  assert.equal(toggleMacroRollMode("adv", "dis"), "dis");
  assert.equal(toggleMacroRollMode("dis", "adv"), "adv");
  assert.equal(toggleMacroRollMode("adv", "adv"), "normal");
  assert.equal(toggleMacroRollMode("dis", "dis"), "normal");
});

test("comparison snapshots survive log serialization without modifying the macro", () => {
  const before = structuredClone(macro);
  const result = rollSequence("adv", [20, 1, 11, 11, 4]);
  const comparison = JSON.parse(JSON.stringify(result.comparison));
  assert.deepEqual(comparison.rolls, [
    { dice: [20, 1], total: 21 },
    { dice: [11, 11], total: 22 },
  ]);
  assert.equal(macroRollComparisonSummary(comparison), "ADV · dadi 21 / 22 → tiro 2: 22");
  assert.equal(macroRollComparisonSummary(), "");
  assert.deepEqual(macro, before);
});
