import { translate, type Language } from "./translate.ts";

/** Localize only the generated dice notation, never character or macro names.
 * Stored roll payloads stay canonical so all players see the same dice/results.
 */
export function localizeRollBreakdown(
  breakdown: string,
  language: Language,
): string {
  if (language === "it") return breakdown;
  return breakdown
    .replace(
      /\b(ADV|DIS) · dadi (\d+) \/ (\d+) → tiro ([12]): (\d+)/g,
      "$1 · dice $2 / $3 → roll $4: $5",
    )
    .replace(/\bBT\b/g, "TB")
    .replace(
      /\[([^\]]+)\]/g,
      (_, label: string) => `[${translate(label, language)}]`,
    );
}
