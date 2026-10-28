"use client";

import { t } from "@/lib/i18n/store";

import type { MacroRollMode } from "@/lib/vers/types";
import { toggleMacroRollMode } from "@/lib/vers/macro-roll";

export function MacroRollModeOptions({
  mode,
  onChange,
  includeBonusHint = true,
}: {
  mode: MacroRollMode;
  onChange: (mode: MacroRollMode) => void;
  includeBonusHint?: boolean;
}) {
  return (
    <>
      {(["adv", "dis"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="menuitemcheckbox"
          aria-checked={mode === option}
          className="macro-roll-mode-option"
          onClick={() => onChange(toggleMacroRollMode(mode, option))}
          title={t("Due tiri dei dadi{p0}: scegli il totale più {p1}.{p2}", { p0: includeBonusHint ? t(" base") : "", p1: option === "adv" ? t("alto") : t("basso"), p2: includeBonusHint ? t(" Bonus e bonus temporanei una sola volta.") : "" })}
        >
          <span className="macro-roll-mode-check" aria-hidden="true">
            {mode === option ? "✓" : ""}
          </span>
          {option === "adv" ? t("ADV · Vantaggio") : t("DIS · Svantaggio")}
        </button>
      ))}
    </>
  );
}

export function MacroRollModeBadge({ mode }: { mode: MacroRollMode }) {
  if (mode === "normal") return null;
  return (
    <span className="macro-roll-mode-badge" aria-hidden="true">
      {mode.toUpperCase()}
    </span>
  );
}
