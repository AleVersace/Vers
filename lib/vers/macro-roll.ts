import type {
  CharacterMacro,
  DamageTypeValue,
  MacroRollComparison,
  MacroRollMode,
} from "./types";

interface MacroDieRoll {
  sides: number;
  result: number;
  damageType: DamageTypeValue;
}

type MacroDiceInput = Pick<
  CharacterMacro,
  | "dice_sides"
  | "dice_damage_types"
  | "bonuses"
  | "is_damage_macro"
  | "temporary_dice_sides"
  | "temporary_dice_damage_types"
  | "temporary_bonuses"
>;

export const toggleMacroRollMode = (
  current: MacroRollMode,
  selected: "adv" | "dis",
): MacroRollMode => current === selected ? "normal" : selected;

export function rollMacroDice(
  macro: MacroDiceInput,
  mode: MacroRollMode,
  rollDie: (sides: number) => number,
) {
  const rollPool = (sides: number[], damageTypes: DamageTypeValue[]): MacroDieRoll[] =>
    sides.map((dieSides, index) => ({
      sides: dieSides,
      result: rollDie(dieSides),
      damageType: macro.is_damage_macro ? (damageTypes[index] ?? "") : "",
    }));
  const sum = (rolls: MacroDieRoll[]) =>
    rolls.reduce((total, roll) => total + roll.result, 0);

  let baseRolls = rollPool(macro.dice_sides, macro.dice_damage_types);
  let comparison: MacroRollComparison | undefined;
  if (mode !== "normal") {
    const secondRolls = rollPool(macro.dice_sides, macro.dice_damage_types);
    const firstTotal = sum(baseRolls);
    const secondTotal = sum(secondRolls);
    const selected = (mode === "adv"
      ? secondTotal > firstTotal
      : secondTotal < firstTotal) ? 1 : 0;
    comparison = {
      mode,
      rolls: [
        { dice: baseRolls.map((roll) => roll.result), total: firstTotal },
        { dice: secondRolls.map((roll) => roll.result), total: secondTotal },
      ],
      selected,
    };
    if (selected === 1) baseRolls = secondRolls;
  }

  // Temporary dice and all flat modifiers apply once, after choosing the pool.
  const temporaryRolls = rollPool(
    macro.temporary_dice_sides,
    macro.temporary_dice_damage_types,
  );
  const total = sum(baseRolls) + sum(temporaryRolls) +
    [...macro.bonuses, ...macro.temporary_bonuses].reduce(
      (value, bonus) => value + bonus,
      0,
    );
  return { baseRolls, temporaryRolls, total, comparison };
}

export function macroRollComparisonSummary(comparison?: MacroRollComparison) {
  if (!comparison) return "";
  const [first, second] = comparison.rolls;
  const selected = comparison.rolls[comparison.selected];
  return `${comparison.mode.toUpperCase()} · dadi ${first.total} / ${second.total} → tiro ${comparison.selected + 1}: ${selected.total}`;
}

export const MAX_QUICK_DICE_COUNT = 50;

export function normalizeQuickDiceCount(value: unknown): number {
  const count = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : 1;
  return Math.min(MAX_QUICK_DICE_COUNT, Math.max(1, Math.trunc(
    Number.isFinite(count) ? count : 1,
  )));
}

export function quickDiceFormula(sides: number, count: number) {
  const diceCount = normalizeQuickDiceCount(count);
  return `${diceCount === 1 ? "" : diceCount}d${sides}`;
}

export function rollQuickDice(
  sides: number,
  count: number,
  mode: MacroRollMode,
  rollDie: (sides: number) => number,
) {
  const diceCount = normalizeQuickDiceCount(count);
  const roll = rollMacroDice({
    dice_sides: Array.from({ length: diceCount }, () => sides),
    dice_damage_types: [],
    bonuses: [],
    is_damage_macro: false,
    temporary_dice_sides: [],
    temporary_dice_damage_types: [],
    temporary_bonuses: [],
  }, mode, rollDie);
  const formula = quickDiceFormula(sides, diceCount);
  const expression = `${formula}: ${roll.baseRolls.map((die) => die.result).join(" + ")}${diceCount > 1 ? ` = ${roll.total}` : ""}`;
  return {
    ...roll,
    formula,
    breakdown: [macroRollComparisonSummary(roll.comparison), expression]
      .filter(Boolean)
      .join(" · "),
  };
}
