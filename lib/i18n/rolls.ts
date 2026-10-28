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
      (_, mode: string, first: string, second: string, chosen: string, total: string) =>
        translate("{p0} · dadi {p1} / {p2} → tiro {p3}: {p4}", language, {
          p0: mode, p1: first, p2: second, p3: chosen, p4: total,
        }),
    )
    .replace(/\bBT\b/g, translate("BT", language))
    .replace(
      /\[([^\]]+)\]/g,
      (_, label: string) => `[${translate(label, language)}]`,
    );
}
