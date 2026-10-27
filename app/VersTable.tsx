"use client";

import { LanguageToggle, useLanguage } from "./LanguageToggle";
import { localizeRollBreakdown } from "@/lib/i18n/rolls";

import { t, errorText, uiLocale, getLanguage } from "@/lib/i18n/store";

import { SourceLink } from "./SourceLink";

import type { User } from "firebase/auth";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MacroDockRow } from "./MacroDockRow";
import { MacroRollModeBadge, MacroRollModeOptions } from "./MacroRollModeControls";
import {
  macroRollComparisonSummary,
  MAX_QUICK_DICE_COUNT,
  normalizeQuickDiceCount,
  quickDiceFormula,
  rollMacroDice,
  rollQuickDice,
} from "@/lib/vers/macro-roll";
import {
  characterMacroDockId,
  QUICK_DIE_DOCK_ID,
  readMacroDockOrder,
} from "@/lib/vers/macro-dock-order";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { refreshAssetUrls, type AssetUrlLease } from "@/lib/vers/asset-urls";
import { ASSET_BUCKET } from "@/lib/vers/storage";
import { readBrowserPreference } from "@/lib/vers/browser-preferences";
import {
  beginLatestLoad,
  createKeyedTaskQueue,
  invalidateLatestLoad,
  isLatestLoad,
  mergeNewestEntriesById,
  shouldRunRealtimeWatchdog,
  withRealtimeDeadline,
} from "@/lib/vers/realtime";
import {
  applyOptimisticTokenPositions,
  clearMatchingOptimisticTokenPositions,
  hasMatchingOptimisticTokenPosition,
  restoreMatchingOptimisticTokenPositions,
  TokenMoveSaveCoordinator,
  type OptimisticTokenMoveOrigin,
  type TokenMovePosition,
} from "@/lib/vers/token-movement";
import {
  createFogStrokeCells,
  fogBrushBounds,
  FogStateTracker,
  isTokenVisibleThroughFog,
  paintFogCells,
  type FogState,
} from "@/lib/vers/fog";
import type {
  Asset,
  Campaign,
  CampaignChoice,
  Character,
  CharacterMacro,
  CharacterMacroCategory,
  DamageType,
  DamageTypeValue,
  DiceRollLogEntry,
  Drawing,
  InitiativeEntry,
  InitiativeState,
  Membership,
  MacroRollMode,
  Scene,
  SceneAssetPlacement,
  Token,
  Tool,
} from "@/lib/vers/types";

interface VersTableProps {
  initialChoice: CampaignChoice;
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

interface MovePreview {
  tokenId: string;
  tokenCount: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface TokenSelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface TokenMoveOrigin extends OptimisticTokenMoveOrigin {
  tokenId: string;
  x: number;
  y: number;
  size: number;
}

interface MeasurePreview {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface FogBrushPreview {
  x: number;
  y: number;
}

interface Ping {
  x: number;
  y: number;
  label: string;
  id: number;
}

interface UserProfile {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  table_layout: unknown;
}

interface MacroRollResult {
  rollId: number;
  macroId: string;
  macroName: string;
  total: number;
  breakdown: string;
  rolling: boolean;
}

interface TokenVisibilityBroadcast {
  tokenId: string;
  visible: boolean;
}

interface SceneDeleteEvent {
  campaign_id: string;
  scene_id: string | null;
  entity_table:
    | "assets"
    | "scenes"
    | "tokens"
    | "token_stats"
    | "scene_assets"
    | "drawings"
    | "initiative_entries"
    | "initiative_state";
  entity_id: string;
}

interface DiceRollLogDraft {
  characterId: string | null;
  kind: DiceRollLogEntry["roll_kind"];
  actorName: string;
  rollName: string;
  formula: string;
  breakdown: string;
  total: number;
  details: DiceRollLogEntry["details"];
}

type RealtimeStatus = "connecting" | "connected" | "error";
type RealtimeRefreshResource =
  | "campaign"
  | "scene"
  | "macros"
  | "macro-categories"
  | "profile"
  | "dice";

type MacroMenuSource = "board" | "token";
type CharacterLibraryKind = "player" | "npc";
type DrawMode = "freehand" | "rectangle" | "ellipse";

interface CharacterStatsDraft {
  hp_current: string;
  hp_max: string;
  armor_class: string;
  difficulty_class: string;
  saving_throws: Record<string, string>;
  speed_ft: string;
  notes: string;
}

type CharacterStatsPayload = Pick<
  Character,
  | "hp_current"
  | "hp_max"
  | "armor_class"
  | "difficulty_class"
  | "saving_throws"
  | "speed_ft"
  | "notes"
>;

interface MacroMenuState {
  macroId: string;
  source: MacroMenuSource;
}

interface MacroDragState {
  macroId: string;
  source: MacroMenuSource;
}

interface MacroDropTargetState {
  macroId: string;
  source: MacroMenuSource;
  placement: "before" | "after";
}

interface CategoryMenuState {
  categoryId: string;
  source: MacroMenuSource;
}

interface CategoryEditorState {
  characterId: string;
  categoryId: string | null;
  source: MacroMenuSource;
  name: string;
}

type FloatingPanelId =
  | "token"
  | "initiative"
  | "rolls"
  | "scene"
  | "scenes-list"
  | "characters-list"
  | "campaign-assets"
  | "asset-library";

interface FloatingPanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  dockedHeight: number;
  collapsed: boolean;
  z: number;
}

type FloatingPanelLayouts = Record<FloatingPanelId, FloatingPanelLayout>;

type PanelDockMode = "right" | "left" | "floating";

interface PanelDockPlacement {
  mode: PanelDockMode;
  order: number;
}

type PanelDockPlacements = Record<FloatingPanelId, PanelDockPlacement>;

interface FloatingPanelProps {
  id: FloatingPanelId;
  title: string;
  subtitle?: string;
  layout: FloatingPanelLayout;
  children: ReactNode;
  headerActions?: ReactNode;
  isDragSource?: boolean;
  onChange: (id: FloatingPanelId, layout: FloatingPanelLayout) => void;
  onCommit: () => void;
  onFocus: (id: FloatingPanelId) => void;
  onDockDragStart: (
    event: DragEvent<HTMLElement>,
    id: FloatingPanelId,
  ) => void;
  onDockDragEnd: (
    event: DragEvent<HTMLElement>,
    id: FloatingPanelId,
  ) => void;
}

type TokenDatabasePatch = Partial<Omit<Token, "imageUrl">>;

const TOKEN_STAT_FIELDS = new Set([
  "hp_current",
  "hp_max",
  "temp_hp",
  "armor_class",
  "difficulty_class",
  "saving_throws",
  "speed_ft",
  "notes",
]);

const EMPTY_CHARACTER_STATS = {
  hp_current: null,
  hp_max: null,
  armor_class: null,
  difficulty_class: null,
  saving_throws: null,
  speed_ft: null,
  notes: null,
};

const EMPTY_TOKEN_STATS = {
  ...EMPTY_CHARACTER_STATS,
  temp_hp: null,
};

const SAVING_THROWS = ["FOR", "DES", "COS", "INT", "SAG", "CAR"] as const;

const emptyCharacterStatsDraft = (): CharacterStatsDraft => ({
  hp_current: "",
  hp_max: "",
  armor_class: "",
  difficulty_class: "",
  saving_throws: Object.fromEntries(
    SAVING_THROWS.map((save) => [save, ""]),
  ),
  speed_ft: "",
  notes: "",
});

const gridRowsForMap = (columns: number, asset: Asset | null) => {
  if (!asset?.width || !asset.height) return null;
  return Math.max(1, Math.ceil(columns * (asset.height / asset.width)));
};

const TOOLBAR: Array<{
  id: Tool;
  icon: ReactNode;
  label: string;
  masterOnly?: boolean;
}> = [
  { id: "select", icon: "↖", label: "Seleziona" },
  { id: "draw", icon: "✎", label: "Disegna" },
  {
    id: "erase",
    icon: (
      <svg className="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8.3 19.6-4.4-4.4a1.9 1.9 0 0 1 0-2.7l9.2-9.2a1.9 1.9 0 0 1 2.7 0l4.9 4.9a1.9 1.9 0 0 1 0 2.7l-8.7 8.7" />
        <path d="m6.4 10.6 7.5 7.5" />
        <path d="M7.5 19.6H20" />
      </svg>
    ),
    label: "Gomma",
  },
  { id: "measure", icon: "↔", label: "Righello" },
  { id: "reveal", icon: "◌", label: "Rivela", masterOnly: true },
  { id: "hide", icon: "●", label: "Copri", masterOnly: true },
];

const PING_LIFETIME_MS = 3600;
const PING_HOLD_MS = 1000;
const PING_HOLD_MOVE_TOLERANCE_PX = 8;
const TOKEN_SAVE_DEBOUNCE_MS = 500;
const TOKEN_MOVE_CONFIRMATION_DELAY_MS = 1_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 90;
const REALTIME_WATCHDOG_INTERVAL_MS = 15_000;
const REALTIME_WATCHDOG_IDLE_MS = 60_000;
const REALTIME_WATCHDOG_HARD_MS = 120_000;
const REALTIME_RECONCILIATION_DEADLINE_MS = 30_000;
const DRAWING_SELECT_TOLERANCE_PX = 10;
const DRAWING_MIN_HALF_SIZE_PX = 6;
const DICE_ROLL_LOG_LIMIT = 50;
const MACRO_NAME_MAX_LENGTH = 64;
const SCENE_ASSET_DEFAULT_SIZE_PX = 128;
const SCENE_ASSET_MIN_SIZE_PX = 24;
const SCENE_ASSET_MAX_SIZE_PX = 4000;
const SCENE_ASSET_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const SCENE_ASSET_DRAG_MIME = "application/x-vers-scene-asset";
const runRealtimeChannelLifecycleTask = createKeyedTaskQueue();

const defaultSceneAssetDimensions = (
  asset: Asset,
  boardWidth: number,
  boardHeight: number,
) => {
  const intrinsicWidth = Math.max(1, asset.width ?? 1);
  const intrinsicHeight = Math.max(1, asset.height ?? 1);
  let scale =
    SCENE_ASSET_DEFAULT_SIZE_PX /
    Math.max(intrinsicWidth, intrinsicHeight);
  if (Math.min(intrinsicWidth, intrinsicHeight) * scale < SCENE_ASSET_MIN_SIZE_PX) {
    scale =
      SCENE_ASSET_MIN_SIZE_PX /
      Math.min(intrinsicWidth, intrinsicHeight);
  }
  const fitScale = Math.min(
    1,
    Math.max(SCENE_ASSET_MIN_SIZE_PX, boardWidth * 0.5) /
      (intrinsicWidth * scale),
    Math.max(SCENE_ASSET_MIN_SIZE_PX, boardHeight * 0.5) /
      (intrinsicHeight * scale),
  );
  return {
    width: Math.round(
      clampValue(
        intrinsicWidth * scale * fitScale,
        SCENE_ASSET_MIN_SIZE_PX,
        SCENE_ASSET_MAX_SIZE_PX,
      ),
    ),
    height: Math.round(
      clampValue(
        intrinsicHeight * scale * fitScale,
        SCENE_ASSET_MIN_SIZE_PX,
        SCENE_ASSET_MAX_SIZE_PX,
      ),
    ),
  };
};

const ROLLER_COLOR_HUES = [28, 205, 145, 335, 262, 52, 180, 0, 95, 310];

const rollerColor = (userId: string) => {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  const hue = ROLLER_COLOR_HUES[hash % ROLLER_COLOR_HUES.length];
  return `hsl(${hue} 58% 62%)`;
};
const QUICK_DIE_STORAGE_KEY = "vers:quick-die-sides";
const QUICK_DIE_COUNT_STORAGE_KEY = "vers:quick-die-count";
const QUICK_DIE_PRESETS = [4, 6, 8, 10, 12, 20, 100];
const BOARD_INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [data-board-interactive="true"]';

const palette = [
  "#d79b52",
  "#68a99d",
  "#a56b6b",
  "#768fc4",
  "#9b7ab7",
  "#899863",
];

const DAMAGE_TYPES: ReadonlyArray<{
  value: DamageType;
  label: string;
  aliases: string;
}> = [
  { value: "acid", label: "Acido", aliases: "acid" },
  {
    value: "bludgeoning",
    label: "Contundente",
    aliases: "bludgeoning contundenti",
  },
  { value: "cold", label: "Freddo", aliases: "cold gelo" },
  { value: "fire", label: "Fuoco", aliases: "fire" },
  { value: "force", label: "Forza", aliases: "force" },
  {
    value: "lightning",
    label: "Fulmine",
    aliases: "lightning elettrico elettricita elettricità",
  },
  { value: "necrotic", label: "Necrotico", aliases: "necrotic" },
  {
    value: "piercing",
    label: "Perforante",
    aliases: "piercing perforanti",
  },
  { value: "poison", label: "Veleno", aliases: "poison velenoso" },
  { value: "psychic", label: "Psichico", aliases: "psychic" },
  { value: "radiant", label: "Radiante", aliases: "radiant" },
  {
    value: "slashing",
    label: "Tagliente",
    aliases: "slashing taglienti",
  },
  { value: "thunder", label: "Tuono", aliases: "thunder sonoro" },
];

const DAMAGE_TYPE_VALUES = new Set<DamageType>(
  DAMAGE_TYPES.map((damageType) => damageType.value),
);

const searchableText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .trim();

const normalizeDamageType = (value: unknown): DamageTypeValue =>
  typeof value === "string" && DAMAGE_TYPE_VALUES.has(value as DamageType)
    ? (value as DamageType)
    : "";

const normalizeDamageTypes = (
  value: unknown,
  expectedLength: number,
): DamageTypeValue[] => {
  const values = Array.isArray(value) ? value : [];
  return Array.from({ length: expectedLength }, (_, index) =>
    normalizeDamageType(values[index]),
  );
};

const damageTypeLabel = (value: DamageTypeValue) =>
  DAMAGE_TYPES.find((damageType) => damageType.value === value)?.label ?? "";

// One line per die and per bonus, sorted by damage type with a subtotal per
// type, so the Master reads same-type damage already summed.
const damageRollBreakdownLines = (details: DiceRollLogEntry["details"]) => {
  const items = [
    ...(details?.dice ?? []).map((die, index) => ({
      key: `die-${index}`,
      type: die.damage_type,
      value: die.result,
      text: `d${die.sides} → ${die.result}`,
      temporary: die.temporary,
    })),
    ...(details?.bonuses ?? []).map((bonus, index) => ({
      key: `bonus-${index}`,
      type: bonus.damage_type,
      value: bonus.value,
      text:
        bonus.value >= 0 ? `+${bonus.value}` : `−${Math.abs(bonus.value)}`,
      temporary: bonus.temporary,
    })),
  ];
  const typeOrder = [...new Set(items.map((item) => item.type))].sort(
    (a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return t(damageTypeLabel(a)).localeCompare(t(damageTypeLabel(b)), uiLocale());
    },
  );
  const lines: Array<{ key: string; text: string; subtotal?: boolean }> = [];
  for (const type of typeOrder) {
    const group = items.filter((item) => item.type === type);
    for (const item of group) {
      lines.push({
        key: item.key,
        text: `${item.text}${
          item.type ? ` · ${t(damageTypeLabel(item.type))}` : ""
        }${item.temporary ? ` · ${t("BT")}` : ""}`,
      });
    }
    const sum = group.reduce((total, item) => total + item.value, 0);
    lines.push({
      key: `subtotal-${type || "none"}`,
      text: `= ${sum}${type ? ` ${t(damageTypeLabel(type))}` : ""}`,
      subtotal: true,
    });
  }
  return lines;
};

const damageTypeSuffix = (value: DamageTypeValue) => {
  const label = damageTypeLabel(value);
  return label ? ` [${label}]` : "";
};

interface DamageTypePickerProps {
  value: DamageTypeValue;
  label: string;
  onChange: (value: DamageTypeValue) => void;
}

interface DamageTypePopoverPosition {
  placement: "above" | "below";
  anchorOffset: number;
  left: number;
  width: number;
  maxHeight: number;
}

const DAMAGE_TYPE_POPOVER_GAP_PX = 6;
const DAMAGE_TYPE_POPOVER_PADDING_PX = 10;
const DAMAGE_TYPE_POPOVER_MAX_HEIGHT_PX = 218;
const PANEL_DRAG_MIME = "application/x-vers-panel";
const MACRO_DRAG_MIME = "application/x-vers-character-macro";
const FLOATING_PANEL_HEADER_HEIGHT_PX = 36;
const FLOATING_PANEL_MIN_WIDTH_PX = 280;
const FLOATING_PANEL_MIN_HEIGHT_PX = 220;
const DOCKED_PANEL_MIN_HEIGHT_PX = 120;
const FLOATING_PANEL_VIEWPORT_GAP_PX = 8;
const FLOATING_PANEL_TOP_PX = 60;

const viewportSize = () => ({
  width: typeof window === "undefined" ? 1440 : window.innerWidth,
  height: typeof window === "undefined" ? 900 : window.innerHeight,
});

const clampValue = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const normalizeFloatingPanelLayout = (
  layout: FloatingPanelLayout,
  viewportWidth = viewportSize().width,
  viewportHeight = viewportSize().height,
): FloatingPanelLayout => {
  const maxWidth = Math.max(180, viewportWidth - FLOATING_PANEL_VIEWPORT_GAP_PX * 2);
  const minWidth = Math.min(FLOATING_PANEL_MIN_WIDTH_PX, maxWidth);
  const maxHeight = Math.max(
    160,
    viewportHeight - FLOATING_PANEL_TOP_PX - FLOATING_PANEL_VIEWPORT_GAP_PX,
  );
  const minHeight = Math.min(FLOATING_PANEL_MIN_HEIGHT_PX, maxHeight);
  const maxDockedHeight = Math.max(
    DOCKED_PANEL_MIN_HEIGHT_PX,
    viewportHeight - FLOATING_PANEL_TOP_PX - FLOATING_PANEL_VIEWPORT_GAP_PX,
  );
  const width = clampValue(layout.width, minWidth, maxWidth);
  const height = clampValue(layout.height, minHeight, maxHeight);
  const visibleWidth = layout.collapsed ? Math.min(width, 210) : width;
  const minimumY = Math.min(
    FLOATING_PANEL_TOP_PX,
    Math.max(FLOATING_PANEL_VIEWPORT_GAP_PX, viewportHeight - 100),
  );

  return {
    ...layout,
    x: clampValue(
      layout.x,
      FLOATING_PANEL_VIEWPORT_GAP_PX,
      Math.max(
        FLOATING_PANEL_VIEWPORT_GAP_PX,
        viewportWidth - visibleWidth - FLOATING_PANEL_VIEWPORT_GAP_PX,
      ),
    ),
    y: clampValue(
      layout.y,
      minimumY,
      Math.max(
        minimumY,
        viewportHeight -
          FLOATING_PANEL_HEADER_HEIGHT_PX -
          FLOATING_PANEL_VIEWPORT_GAP_PX,
      ),
    ),
    width,
    height,
    dockedHeight: clampValue(
      layout.dockedHeight,
      DOCKED_PANEL_MIN_HEIGHT_PX,
      maxDockedHeight,
    ),
  };
};

const defaultFloatingPanelLayouts = (
  dimensions = viewportSize(),
): FloatingPanelLayouts => {
  const { width, height } = dimensions;
  const tokenWidth = Math.min(350, Math.max(280, width - 32));
  const tokenHeight = Math.min(640, Math.max(360, height - 132));
  const right = Math.max(FLOATING_PANEL_VIEWPORT_GAP_PX, width - tokenWidth - 16);

  return {
    token: normalizeFloatingPanelLayout(
      {
        x: right,
        y: 68,
        width: tokenWidth,
        height: tokenHeight,
        dockedHeight: 520,
        collapsed: false,
        z: 4,
      },
      width,
      height,
    ),
    initiative: normalizeFloatingPanelLayout(
      {
        x: right - 220,
        y: 68,
        width: 320,
        height: Math.min(520, Math.max(320, height - 170)),
        dockedHeight: 300,
        collapsed: true,
        z: 3,
      },
      width,
      height,
    ),
    rolls: normalizeFloatingPanelLayout(
      {
        x: right - 440,
        y: 68,
        width: 340,
        height: Math.min(540, Math.max(320, height - 170)),
        dockedHeight: 320,
        collapsed: true,
        z: 2,
      },
      width,
      height,
    ),
    scene: normalizeFloatingPanelLayout(
      {
        x: right - 660,
        y: 68,
        width: 350,
        height: tokenHeight,
        dockedHeight: 520,
        collapsed: true,
        z: 1,
      },
      width,
      height,
    ),
    "scenes-list": normalizeFloatingPanelLayout(
      {
        x: 32,
        y: 84,
        width: 320,
        height: 220,
        dockedHeight: 220,
        collapsed: false,
        z: 5,
      },
      width,
      height,
    ),
    "characters-list": normalizeFloatingPanelLayout(
      {
        x: 52,
        y: 116,
        width: 330,
        height: 220,
        dockedHeight: 220,
        collapsed: false,
        z: 6,
      },
      width,
      height,
    ),
    "campaign-assets": normalizeFloatingPanelLayout(
      {
        x: 72,
        y: 148,
        width: 330,
        height: 220,
        dockedHeight: 220,
        collapsed: false,
        z: 7,
      },
      width,
      height,
    ),
    "asset-library": normalizeFloatingPanelLayout(
      {
        x: 92,
        y: 180,
        width: 330,
        height: 260,
        dockedHeight: 240,
        collapsed: false,
        z: 8,
      },
      width,
      height,
    ),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readFloatingPanelLayouts = (value: unknown): FloatingPanelLayouts => {
  const defaults = defaultFloatingPanelLayouts();
  if (
    !isRecord(value) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4)
  ) {
    return defaults;
  }
  const panels = value.panels;
  if (!isRecord(panels)) return defaults;

  return Object.fromEntries(
    (Object.keys(defaults) as FloatingPanelId[]).map((panelId) => {
      const stored = panels[panelId];
      const fallback = defaults[panelId];
      if (!isRecord(stored)) return [panelId, fallback];
      return [
        panelId,
        normalizeFloatingPanelLayout({
          x: toNumber(stored.x, fallback.x),
          y: toNumber(stored.y, fallback.y),
          width: toNumber(stored.width, fallback.width),
          height: toNumber(stored.height, fallback.height),
          dockedHeight: toNumber(
            stored.dockedHeight,
            fallback.dockedHeight,
          ),
          collapsed:
            typeof stored.collapsed === "boolean"
              ? stored.collapsed
              : fallback.collapsed,
          z: toNumber(stored.z, fallback.z),
        }),
      ];
    }),
  ) as FloatingPanelLayouts;
};

const defaultPanelDockPlacements = (): PanelDockPlacements => ({
  token: { mode: "right", order: 0 },
  initiative: { mode: "right", order: 1 },
  rolls: { mode: "right", order: 2 },
  scene: { mode: "right", order: 3 },
  "scenes-list": { mode: "left", order: 0 },
  "characters-list": { mode: "left", order: 1 },
  "campaign-assets": { mode: "left", order: 2 },
  "asset-library": { mode: "left", order: 3 },
});

const readPanelDockPlacements = (value: unknown): PanelDockPlacements => {
  const defaults = defaultPanelDockPlacements();
  if (
    !isRecord(value) ||
    (value.version !== 2 && value.version !== 3 && value.version !== 4) ||
    !isRecord(value.docking)
  ) {
    return defaults;
  }
  const docking = value.docking;
  const modes = new Set<PanelDockMode>(["right", "left", "floating"]);
  const legacyLeftOrder: Record<string, number> = {
    "before-scenes": -1,
    "after-scenes": 0.5,
    "after-characters": 1.5,
    "after-assets": 3,
  };

  return Object.fromEntries(
    (Object.keys(defaults) as FloatingPanelId[]).map((panelId) => {
      const stored = docking[panelId];
      const fallback = defaults[panelId];
      if (!isRecord(stored)) return [panelId, fallback];
      const mode =
        typeof stored.mode === "string" &&
        modes.has(stored.mode as PanelDockMode)
          ? (stored.mode as PanelDockMode)
          : fallback.mode;
      const legacyOrder =
        value.version === 2 &&
        mode === "left" &&
        typeof stored.leftSlot === "string"
          ? legacyLeftOrder[stored.leftSlot]
          : undefined;
      return [
        panelId,
        {
          mode,
          order:
            legacyOrder ?? toNumber(stored.order, fallback.order),
        },
      ];
    }),
  ) as PanelDockPlacements;
};

const readRightRailCollapsed = (value: unknown) =>
  isRecord(value) &&
  (value.version === 2 || value.version === 3 || value.version === 4) &&
  typeof value.rightRailCollapsed === "boolean"
    ? value.rightRailCollapsed
    : false;

const readLeftRailCollapsed = (value: unknown) =>
  isRecord(value) &&
  (value.version === 3 || value.version === 4) &&
  typeof value.leftRailCollapsed === "boolean"
    ? value.leftRailCollapsed
    : false;

const PANEL_TITLES: Record<FloatingPanelId, string> = {
  token: "Token",
  initiative: "Iniziativa",
  rolls: "Rolls",
  scene: "Scena",
  "scenes-list": "Scene",
  "characters-list": "PG",
  "campaign-assets": "NPC",
  "asset-library": "Asset",
};

const panelIdFromDrag = (event: DragEvent<HTMLElement>) => {
  const panelId = event.dataTransfer.getData(PANEL_DRAG_MIME);
  return Object.prototype.hasOwnProperty.call(PANEL_TITLES, panelId)
    ? (panelId as FloatingPanelId)
    : null;
};

function FloatingPanel({
  id,
  title,
  subtitle,
  layout,
  children,
  headerActions,
  isDragSource,
  onChange,
  onCommit,
  onFocus,
  onDockDragStart,
  onDockDragEnd,
}: FloatingPanelProps) {
  const interactionRef = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    clientX: number;
    clientY: number;
    layout: FloatingPanelLayout;
    moved: boolean;
  } | null>(null);
  const suppressHeaderClickRef = useRef(false);
  const visibleWidth = layout.collapsed ? Math.min(layout.width, 210) : layout.width;

  const startInteraction = (
    event: PointerEvent<HTMLElement>,
    mode: "move" | "resize",
  ) => {
    if (event.button !== 0) return;
    if (
      mode === "move" &&
      (event.target as HTMLElement).closest(
        "button, [data-panel-drag-source='true']",
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      layout,
      moved: false,
    };
    onFocus(id);
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - interaction.clientX;
    const deltaY = event.clientY - interaction.clientY;
    if (!interaction.moved && Math.hypot(deltaX, deltaY) > 3) {
      interaction.moved = true;
    }
    const next =
      interaction.mode === "move"
        ? {
            ...interaction.layout,
            x: interaction.layout.x + deltaX,
            y: interaction.layout.y + deltaY,
          }
        : {
            ...interaction.layout,
            width: interaction.layout.width + deltaX,
            height: interaction.layout.height + deltaY,
          };
    onChange(id, normalizeFloatingPanelLayout(next));
  };

  const endInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (interaction?.pointerId !== event.pointerId) return;
    suppressHeaderClickRef.current =
      interaction.mode === "move" && interaction.moved;
    interactionRef.current = null;
    onCommit();
  };

  const toggleCollapsed = () => {
    onChange(
      id,
      normalizeFloatingPanelLayout({ ...layout, collapsed: !layout.collapsed }),
    );
    onFocus(id);
    onCommit();
  };

  return (
    <section
      className={`floating-panel ${layout.collapsed ? "collapsed" : ""} ${
        isDragSource ? "is-drag-source" : ""
      }`}
      style={{
        left: layout.x,
        top: layout.y,
        width: visibleWidth,
        height: layout.collapsed ? FLOATING_PANEL_HEADER_HEIGHT_PX : layout.height,
        zIndex: layout.z,
      }}
      aria-label={t("Pannello {p0}", { p0: title })}
      onPointerDown={() => onFocus(id)}
      onPointerMove={moveInteraction}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
    >
      <header
        className="floating-panel-header"
        onPointerDown={(event) => startInteraction(event, "move")}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          if (suppressHeaderClickRef.current) {
            suppressHeaderClickRef.current = false;
            return;
          }
          toggleCollapsed();
        }}
      >
        <span className="floating-panel-grip" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span
          className="floating-panel-title"
          draggable
          data-panel-drag-source="true"
          title={t("Trascina per agganciare {p0}", { p0: title })}
          onDragStart={(event) => onDockDragStart(event, id)}
          onDragEnd={(event) => onDockDragEnd(event, id)}
        >
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="docked-panel-header-actions">{headerActions}</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={layout.collapsed ? t("Espandi {p0}", { p0: title }) : t("Comprimi {p0}", { p0: title })}
          aria-label={layout.collapsed ? t("Espandi {p0}", { p0: title }) : t("Comprimi {p0}", { p0: title })}
          aria-expanded={!layout.collapsed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
      </header>
      {!layout.collapsed && <div className="floating-panel-body">{children}</div>}
      {!layout.collapsed && (
        <button
          type="button"
          className="floating-panel-resize"
          aria-label={t("Ridimensiona {p0}", { p0: title })}
          onPointerDown={(event) => startInteraction(event, "resize")}
        >
          <span />
        </button>
      )}
    </section>
  );
}

interface DockablePanelHostProps extends FloatingPanelProps {
  placement: PanelDockPlacement;
  draggedPanelId: FloatingPanelId | null;
  floatingLayerTarget: HTMLElement | null;
  leftRailTarget: HTMLElement | null;
  rightRailTarget: HTMLElement | null;
  onDockedPanelDrop: (
    event: DragEvent<HTMLElement>,
    targetId: FloatingPanelId,
    position: "before" | "after",
  ) => void;
}

function DockablePanelHost({
  placement,
  draggedPanelId,
  floatingLayerTarget,
  leftRailTarget,
  rightRailTarget,
  onDockedPanelDrop,
  ...floatingProps
}: DockablePanelHostProps) {
  const dockResizeRef = useRef<{
    pointerId: number;
    clientY: number;
    height: number;
  } | null>(null);
  const [dropHint, setDropHint] = useState<"before" | "after" | null>(null);

  const startDockResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dockResizeRef.current = {
      pointerId: event.pointerId,
      clientY: event.clientY,
      height: floatingProps.layout.dockedHeight,
    };
  };

  const moveDockResize = (event: PointerEvent<HTMLButtonElement>) => {
    const interaction = dockResizeRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const maxHeight = Math.max(
      DOCKED_PANEL_MIN_HEIGHT_PX,
      window.innerHeight - FLOATING_PANEL_TOP_PX - FLOATING_PANEL_VIEWPORT_GAP_PX,
    );
    floatingProps.onChange(floatingProps.id, {
      ...floatingProps.layout,
      dockedHeight: clampValue(
        interaction.height + event.clientY - interaction.clientY,
        DOCKED_PANEL_MIN_HEIGHT_PX,
        maxHeight,
      ),
    });
  };

  const endDockResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (dockResizeRef.current?.pointerId !== event.pointerId) return;
    dockResizeRef.current = null;
    floatingProps.onCommit();
  };

  if (placement.mode === "floating") {
    return floatingLayerTarget
      ? createPortal(
          <FloatingPanel
            {...floatingProps}
            isDragSource={draggedPanelId === floatingProps.id}
          />,
          floatingLayerTarget,
        )
      : null;
  }

  const target =
    placement.mode === "left" ? leftRailTarget : rightRailTarget;
  if (!target) return null;
  const { id, title, subtitle, layout, headerActions } = floatingProps;

  return createPortal(
    <section
      className={`docked-rail-panel docked-${placement.mode}-panel ${
        layout.collapsed ? "collapsed" : ""
      } ${draggedPanelId === id ? "is-drag-source" : ""} ${
        draggedPanelId && draggedPanelId !== id && dropHint
          ? `drop-${dropHint}`
          : ""
      }`}
      style={{ order: placement.order }}
      aria-label={t("Pannello {p0} agganciato a {p1}", { p0: title, p1: placement.mode === "left" ? t("sinistra") : t("destra") })}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const position =
          event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDropHint((current) =>
          current === position ? current : position,
        );
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        setDropHint(null);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
        setDropHint(null);
        const rect = event.currentTarget.getBoundingClientRect();
        onDockedPanelDrop(
          event,
          id,
          event.clientY < rect.top + rect.height / 2 ? "before" : "after",
        );
      }}
    >
      <header
        className="rail-heading docked-rail-panel-header"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          floatingProps.onChange(id, {
            ...layout,
            collapsed: !layout.collapsed,
          });
          floatingProps.onCommit();
        }}
      >
        <span className="floating-panel-grip" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span
          className="floating-panel-title"
          draggable
          data-panel-drag-source="true"
          title={t("Trascina per spostare {p0}", { p0: title })}
          onDragStart={(event) => floatingProps.onDockDragStart(event, id)}
          onDragEnd={(event) => floatingProps.onDockDragEnd(event, id)}
        >
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="docked-panel-controls">
          {headerActions}
          <button
            type="button"
            className={`section-collapse ${
              layout.collapsed ? "" : "is-expanded"
            }`}
            onClick={() => {
              floatingProps.onChange(id, {
                ...layout,
                collapsed: !layout.collapsed,
              });
              floatingProps.onCommit();
            }}
            title={layout.collapsed ? t("Espandi {p0}", { p0: title }) : t("Comprimi {p0}", { p0: title })}
            aria-label={
              layout.collapsed ? t("Espandi {p0}", { p0: title }) : t("Comprimi {p0}", { p0: title })
            }
            aria-expanded={!layout.collapsed}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 10 5 5 5-5" />
            </svg>
          </button>
        </span>
      </header>
      {!layout.collapsed && (
        <div
          className="docked-rail-panel-body"
          style={{ height: layout.dockedHeight }}
        >
          {floatingProps.children}
        </div>
      )}
      {!layout.collapsed && (
        <button
          type="button"
          className="docked-panel-resize"
          aria-label={t("Modifica altezza di {p0}", { p0: title })}
          title={t("Trascina per modificare l’altezza")}
          onPointerDown={startDockResize}
          onPointerMove={moveDockResize}
          onPointerUp={endDockResize}
          onPointerCancel={endDockResize}
        >
          <span />
        </button>
      )}
    </section>,
    target,
  );
}

function DamageTypePicker({ value, label, onChange }: DamageTypePickerProps) {
  const listboxId = useId();
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popoverPosition, setPopoverPosition] =
    useState<DamageTypePopoverPosition | null>(null);
  const selectedLabel = t(damageTypeLabel(value));
  const normalizedQuery = searchableText(query);
  const filteredTypes = DAMAGE_TYPES.filter((damageType) =>
    searchableText(
      `${t(damageType.label)} ${damageType.value} ${damageType.aliases}`,
    ).includes(normalizedQuery),
  );

  const updatePopoverPosition = useCallback(() => {
    const picker = pickerRef.current;
    if (!picker) return;

    const rect = picker.getBoundingClientRect();
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      DAMAGE_TYPE_POPOVER_GAP_PX -
      DAMAGE_TYPE_POPOVER_PADDING_PX;
    const spaceAbove =
      rect.top - DAMAGE_TYPE_POPOVER_GAP_PX - DAMAGE_TYPE_POPOVER_PADDING_PX;
    const placement =
      spaceBelow >= 160 || spaceBelow >= spaceAbove ? "below" : "above";
    const availableSpace = placement === "below" ? spaceBelow : spaceAbove;
    const maxWidth = Math.max(
      0,
      window.innerWidth - DAMAGE_TYPE_POPOVER_PADDING_PX * 2,
    );
    const width = Math.min(Math.max(rect.width, 210), maxWidth);
    const left = Math.min(
      Math.max(rect.left, DAMAGE_TYPE_POPOVER_PADDING_PX),
      Math.max(
        DAMAGE_TYPE_POPOVER_PADDING_PX,
        window.innerWidth - width - DAMAGE_TYPE_POPOVER_PADDING_PX,
      ),
    );

    setPopoverPosition({
      placement,
      anchorOffset:
        placement === "below"
          ? rect.bottom + DAMAGE_TYPE_POPOVER_GAP_PX
          : window.innerHeight - rect.top + DAMAGE_TYPE_POPOVER_GAP_PX,
      left,
      width,
      maxHeight: Math.min(
        DAMAGE_TYPE_POPOVER_MAX_HEIGHT_PX,
        Math.max(48, availableSpace),
      ),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const reposition = () => updatePopoverPosition();
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (pickerRef.current?.contains(target) ||
          optionsRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open, updatePopoverPosition]);

  const choose = (nextValue: DamageTypeValue) => {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={pickerRef}
      className="damage-type-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (
          !event.currentTarget.contains(nextTarget) &&
          !optionsRef.current?.contains(nextTarget)
        ) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={t("Tipo danno")}
        value={open ? query : selectedLabel}
        onFocus={() => {
          setQuery("");
          updatePopoverPosition();
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          updatePopoverPosition();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
          if (event.key === "Enter" && filteredTypes.length === 1) {
            event.preventDefault();
            choose(filteredTypes[0].value);
          }
        }}
      />
      {open &&
        popoverPosition &&
        createPortal(
          <div
            ref={optionsRef}
            className={`damage-type-options opens-${popoverPosition.placement}`}
            id={listboxId}
            role="listbox"
            style={{
              left: popoverPosition.left,
              width: popoverPosition.width,
              maxHeight: popoverPosition.maxHeight,
              ...(popoverPosition.placement === "below"
                ? { top: popoverPosition.anchorOffset }
                : { bottom: popoverPosition.anchorOffset }),
            }}
            onPointerDown={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={value === "" ? "selected" : ""}
              onClick={() => choose("")}
            >{t("Nessun tipo")}</button>
            {filteredTypes.map((damageType) => (
              <button
                type="button"
                role="option"
                aria-selected={value === damageType.value}
                className={value === damageType.value ? "selected" : ""}
                key={damageType.value}
                onClick={() => choose(damageType.value)}
              >
                <span>{t(damageType.label)}</span>
                <small>{damageType.value}</small>
              </button>
            ))}
            {filteredTypes.length === 0 && <p>{t("Nessun tipo trovato.")}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableNumber = (value: string) =>
  value.trim() === "" ? null : toNumber(value);

const characterStatsDraftFor = (character: Character): CharacterStatsDraft => ({
  hp_current: character.hp_current?.toString() ?? "",
  hp_max: character.hp_max?.toString() ?? "",
  armor_class: character.armor_class?.toString() ?? "",
  difficulty_class: character.difficulty_class?.toString() ?? "",
  saving_throws: Object.fromEntries(
    SAVING_THROWS.map((save) => [
      save,
      character.saving_throws?.[save]?.toString() ?? "",
    ]),
  ),
  speed_ft: character.speed_ft?.toString() ?? "",
  notes: character.notes ?? "",
});

const characterStatsPayloadFor = (
  draft: CharacterStatsDraft,
): CharacterStatsPayload => {
  const savingThrows = Object.fromEntries(
    SAVING_THROWS.flatMap((save) => {
      const value = draft.saving_throws[save]?.trim() ?? "";
      return value === "" ? [] : [[save, toNumber(value)]];
    }),
  );
  return {
    hp_current: nullableNumber(draft.hp_current),
    hp_max: nullableNumber(draft.hp_max),
    armor_class: nullableNumber(draft.armor_class),
    difficulty_class: nullableNumber(draft.difficulty_class),
    saving_throws:
      Object.keys(savingThrows).length > 0 ? savingThrows : null,
    speed_ft: nullableNumber(draft.speed_ft),
    notes: draft.notes.trim() || null,
  };
};

const validateCharacterStats = (stats: CharacterStatsPayload) => {
  if (stats.hp_current !== null && stats.hp_current < 0) {
    return "Gli HP non possono essere negativi.";
  }
  if (stats.hp_max !== null && stats.hp_max <= 0) {
    return "Gli HP massimi devono essere maggiori di zero.";
  }
  if (
    stats.hp_current !== null &&
    stats.hp_max !== null &&
    stats.hp_current > stats.hp_max
  ) {
    return "Gli HP non possono superare gli HP massimi.";
  }
  if (stats.speed_ft !== null && stats.speed_ft < 0) {
    return "La velocità non può essere negativa.";
  }
  return null;
};

// Rectangles are free-form (and snap to the grid elsewhere); only ellipses
// stay locked to a perfect circle.
const constrainedShapePoint = (
  start: { x: number; y: number },
  point: { x: number; y: number },
  kind: DrawMode,
) => {
  if (kind !== "ellipse") return point;
  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  return {
    x: start.x + size * (deltaX < 0 ? -1 : 1),
    y: start.y + size * (deltaY < 0 ? -1 : 1),
  };
};

const snapPointToGrid = (scene: Scene, point: { x: number; y: number }) => {
  if (scene.grid !== "square" || scene.grid_cell_px <= 0) return point;
  const cell = scene.grid_cell_px;
  return {
    x: scene.grid_offset_x + Math.round((point.x - scene.grid_offset_x) / cell) * cell,
    y: scene.grid_offset_y + Math.round((point.y - scene.grid_offset_y) / cell) * cell,
  };
};

const fullDrawingBounds = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const drawingCenterOf = (points: Array<{ x: number; y: number }>) => {
  const bounds = fullDrawingBounds(points);
  if (!bounds) return null;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
};

const rotatePointAround = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  degrees: number,
) => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;
  return {
    x: center.x + deltaX * cos - deltaY * sin,
    y: center.y + deltaX * sin + deltaY * cos,
  };
};

const drawingRotation = (drawing: Pick<Drawing, "style">) =>
  drawing.style?.rotation ?? 0;

const drawingBounds = (points: Array<{ x: number; y: number }>) => {
  const start = points[0];
  const end = points.at(-1);
  if (!start || !end) return null;
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const pointToSegmentDistance = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
};

const drawingTouchesPoint = (
  drawing: Drawing,
  rawPoint: { x: number; y: number },
  tolerance: number,
) => {
  const rotation = drawingRotation(drawing);
  const center = drawingCenterOf(drawing.points);
  const point =
    rotation && center
      ? rotatePointAround(rawPoint, center, -rotation)
      : rawPoint;
  const bounds = drawingBounds(drawing.points);
  if (bounds && drawing.kind === "rectangle") {
    const topLeft = { x: bounds.x, y: bounds.y };
    const topRight = { x: bounds.x + bounds.width, y: bounds.y };
    const bottomRight = {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    };
    const bottomLeft = { x: bounds.x, y: bounds.y + bounds.height };
    return [
      [topLeft, topRight],
      [topRight, bottomRight],
      [bottomRight, bottomLeft],
      [bottomLeft, topLeft],
    ].some(
      ([start, end]) =>
        pointToSegmentDistance(point, start, end) <= tolerance,
    );
  }
  if (bounds && drawing.kind === "ellipse") {
    const radiusX = Math.max(bounds.width / 2, 1);
    const radiusY = Math.max(bounds.height / 2, 1);
    const deltaX = point.x - (bounds.x + bounds.width / 2);
    const deltaY = point.y - (bounds.y + bounds.height / 2);
    const outerDistance =
      (deltaX / (radiusX + tolerance)) ** 2 +
      (deltaY / (radiusY + tolerance)) ** 2;
    if (outerDistance > 1) return false;
    const innerRadiusX = radiusX - tolerance;
    const innerRadiusY = radiusY - tolerance;
    if (innerRadiusX <= 0 || innerRadiusY <= 0) return true;
    const innerDistance =
      (deltaX / innerRadiusX) ** 2 + (deltaY / innerRadiusY) ** 2;
    return innerDistance >= 1;
  }
  for (let index = 1; index < drawing.points.length; index += 1) {
    if (
      pointToSegmentDistance(
        point,
        drawing.points[index - 1],
        drawing.points[index],
      ) <= tolerance
    ) {
      return true;
    }
  }
  return false;
};

// Alternating-diagonal rule: the first diagonal square costs 1, the second 2,
// and so on. Close enough to Pythagoras while keeping clean multiples of the
// per-square distance.
const gridSquaresBetween = (deltaX: number, deltaY: number) => {
  const along = Math.abs(deltaX);
  const across = Math.abs(deltaY);
  return Math.max(along, across) + Math.floor(Math.min(along, across) / 2);
};

const distanceLabelFor = (scene: Scene, cells: number, locale = uiLocale()) => {
  const nativeDistance = cells * scene.distance_per_cell;
  const feet =
    scene.distance_unit === "ft" ? nativeDistance : nativeDistance * 3.28084;
  const meters =
    scene.distance_unit === "m" ? nativeDistance : nativeDistance * 0.3048;
  return `${feet.toLocaleString(locale, {
    maximumFractionDigits: 1,
  })} ft · ${meters.toLocaleString(locale, {
    maximumFractionDigits: 1,
  })} m`;
};

const normalizeDieSides = (value: unknown, fallback = 20) => {
  if (value === null || value === undefined || value === "") return fallback;
  return Math.max(2, Math.min(10000, Math.round(toNumber(value, fallback))));
};

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const namePartsFor = (displayName: string | null) => {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
};

const safeFileName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

const readImageSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });

const normalizeScene = (row: Record<string, unknown>): Scene => {
  const gridColumns = toNumber(row.grid_columns, 36);
  const gridRows = toNumber(row.grid_rows, 24);
  const gridCellPx = toNumber(row.grid_cell_px, 56);
  return {
    ...(row as unknown as Scene),
    grid_columns: gridColumns,
    grid_rows: gridRows,
    grid_cell_px: gridCellPx,
    map_width_px: toNumber(row.map_width_px, gridColumns * gridCellPx),
    grid_offset_x: toNumber(row.grid_offset_x),
    grid_offset_y: toNumber(row.grid_offset_y),
    distance_per_cell: toNumber(row.distance_per_cell, 5),
    revealed_cells: Array.isArray(row.revealed_cells)
      ? (row.revealed_cells as string[])
      : [],
  };
};

const normalizeToken = (row: Record<string, unknown>): Token => ({
  ...(row as unknown as Token),
  x: toNumber(row.x),
  y: toNumber(row.y),
  size: toNumber(row.size, 1),
  rotation: toNumber(row.rotation),
  is_dead: row.is_dead === true,
  hp_current: row.hp_current === null ? null : toNumber(row.hp_current),
  hp_max: row.hp_max === null ? null : toNumber(row.hp_max),
  temp_hp: row.temp_hp === null ? null : toNumber(row.temp_hp),
  armor_class:
    row.armor_class === null ? null : toNumber(row.armor_class),
  difficulty_class:
    row.difficulty_class === null ? null : toNumber(row.difficulty_class),
  speed_ft: row.speed_ft === null ? null : toNumber(row.speed_ft),
});

const normalizeSceneAssetPlacement = (
  row: Record<string, unknown>,
): SceneAssetPlacement => ({
  ...(row as unknown as SceneAssetPlacement),
  x: toNumber(row.x),
  y: toNumber(row.y),
  width: toNumber(row.width, SCENE_ASSET_DEFAULT_SIZE_PX),
  height: toNumber(row.height, SCENE_ASSET_DEFAULT_SIZE_PX),
  rotation: toNumber(row.rotation),
  z_index: toNumber(row.z_index),
  visible_to_players: row.visible_to_players !== false,
});

const tokenValuesMatch = (serverValue: unknown, localValue: unknown) => {
  if (
    typeof serverValue === "object" &&
    serverValue !== null &&
    typeof localValue === "object" &&
    localValue !== null
  ) {
    return JSON.stringify(serverValue) === JSON.stringify(localValue);
  }
  return Object.is(serverValue, localValue);
};

const macroAbbreviation = (name: string) =>
  name.trim().slice(0, 3).toLocaleUpperCase("it");

const macroExpression = (diceSides: number[], bonuses: number[]) => {
  const diceCounts = new Map<number, number>();
  for (const sides of diceSides) {
    diceCounts.set(sides, (diceCounts.get(sides) ?? 0) + 1);
  }
  const dice = [...diceCounts.entries()]
    .map(([sides, count]) => `${count > 1 ? count : ""}d${sides}`)
    .join(" + ");
  const modifiers = bonuses
    .map((bonus) => (bonus >= 0 ? `+ ${bonus}` : `− ${Math.abs(bonus)}`))
    .join(" ");
  return [dice, modifiers].filter(Boolean).join(" ");
};

const clampDiceCount = (count: number) =>
  Math.min(50, Math.max(1, Math.trunc(Number.isFinite(count) ? count : 1)));

const expandDiceByCounts = (diceSides: number[], counts: number[]) =>
  diceSides.flatMap((sides, index) =>
    Array.from({ length: clampDiceCount(counts[index] ?? 1) }, () => sides),
  );

const hasTemporaryMacroBonus = (macro: CharacterMacro) =>
  macro.temporary_dice_sides.length > 0 || macro.temporary_bonuses.length > 0;

const rollDie = (sides: number) => {
  const range = 0x1_0000_0000;
  const limit = range - (range % sides);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return (buffer[0] % sides) + 1;
};

export function VersTable({
  initialChoice,
  user,
  onBack,
  onLogout,
}: VersTableProps) {
  const language = useLanguage();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [isMaster, setIsMaster] = useState(initialChoice.membership.role === "master");
  const [campaign, setCampaign] = useState(initialChoice.campaign);
  const [previewPlayer, setPreviewPlayer] = useState(false);
  const playerView = !isMaster || previewPlayer;
  const hasMasterAccess = isMaster && !playerView;
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [campaignNpcs, setCampaignNpcs] = useState<Character[]>([]);
  const [sceneCharacters, setSceneCharacters] = useState<Character[]>([]);
  const [characterMacros, setCharacterMacros] = useState<CharacterMacro[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [sceneAssets, setSceneAssets] = useState<SceneAssetPlacement[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [fogBrushSize, setFogBrushSize] = useState(3);
  const [fogBrushPreview, setFogBrushPreview] =
    useState<FogBrushPreview | null>(null);
  const [initiative, setInitiative] = useState<InitiativeEntry[]>([]);
  const [initiativeState, setInitiativeState] =
    useState<InitiativeState | null>(null);
  const [initiativeSwapPending, setInitiativeSwapPending] = useState(false);
  const [expandedInitiativeGroupIds, setExpandedInitiativeGroupIds] = useState<
    string[]
  >([]);
  const [initiativeGroupMenuId, setInitiativeGroupMenuId] = useState<
    string | null
  >(null);
  const [initiativeGroupRename, setInitiativeGroupRename] = useState<{
    entryId: string;
    name: string;
  } | null>(null);
  const [mergingInitiative, setMergingInitiative] = useState(false);
  const [diceRollLog, setDiceRollLog] = useState<DiceRollLogEntry[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIdsState, setSelectedTokenIds] = useState<string[]>([]);
  // Keep the inspector independent from transient board/group selections.
  const [inspectedTokenId, setInspectedTokenId] = useState<string | null>(null);
  const [selectedSceneAssetId, setSelectedSceneAssetId] = useState<
    string | null
  >(null);
  const [tokenSelectionBox, setTokenSelectionBox] =
    useState<TokenSelectionBox | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [floatingPanelLayouts, setFloatingPanelLayouts] =
    useState<FloatingPanelLayouts>(() =>
      defaultFloatingPanelLayouts({ width: 1440, height: 900 }),
    );
  const [panelDockPlacements, setPanelDockPlacements] =
    useState<PanelDockPlacements>(() => defaultPanelDockPlacements());
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [draggedPanelId, setDraggedPanelId] =
    useState<FloatingPanelId | null>(null);
  const [floatingLayerTarget, setFloatingLayerTarget] =
    useState<HTMLElement | null>(null);
  const [leftRailTarget, setLeftRailTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [rightRailTarget, setRightRailTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [tokenStatsCollapsed, setTokenStatsCollapsed] = useState(true);
  const [tokenSavesCollapsed, setTokenSavesCollapsed] = useState(true);
  const [tokenMacrosCollapsed, setTokenMacrosCollapsed] = useState(true);
  const [quickDieSides, setQuickDieSides] = useState(() => {
    if (typeof window === "undefined") return 20;
    try {
      return normalizeDieSides(readBrowserPreference(localStorage, QUICK_DIE_STORAGE_KEY));
    } catch {
      return 20;
    }
  });
  const [quickDieInput, setQuickDieInput] = useState(() =>
    String(quickDieSides),
  );
  const [quickDieCount, setQuickDieCount] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      return normalizeQuickDiceCount(readBrowserPreference(localStorage, QUICK_DIE_COUNT_STORAGE_KEY));
    } catch {
      return 1;
    }
  });
  const [quickDieMode, setQuickDieMode] = useState<MacroRollMode>("normal");
  const quickDieFormula = quickDiceFormula(quickDieSides, quickDieCount);
  const [quickDieCollapsed, setQuickDieCollapsed] = useState(false);
  const [quickDiePickerOpen, setQuickDiePickerOpen] = useState(false);
  const [macroDockOrder, setMacroDockOrder] = useState<string[]>([QUICK_DIE_DOCK_ID]);
  const [{ zoom, pan }, setViewport] = useState({
    zoom: 0.78,
    pan: { x: 80, y: 48 },
  });
  const [isPanning, setIsPanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingSceneAsset, setUploadingSceneAsset] = useState(false);
  const [deletingCampaignAssetId, setDeletingCampaignAssetId] = useState<
    string | null
  >(null);
  const [deletingSceneAssetId, setDeletingSceneAssetId] = useState<
    string | null
  >(null);
  const [deletingTokenSelection, setDeletingTokenSelection] = useState(false);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");
  const [lastRealtimeSyncAt, setLastRealtimeSyncAt] = useState<number | null>(
    null,
  );
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileNickname, setProfileNickname] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState(
    user.displayName ?? user.email ?? "Giocatore",
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [measurePreview, setMeasurePreview] = useState<MeasurePreview | null>(
    null,
  );
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(
    null,
  );
  const [drawDraft, setDrawDraft] = useState<Array<{ x: number; y: number }>>(
    [],
  );
  const [drawMode, setDrawMode] = useState<DrawMode>("freehand");
  const [drawToolMenuOpen, setDrawToolMenuOpen] = useState(false);
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false);
  const [fogBrushMenuTool, setFogBrushMenuTool] = useState<
    "reveal" | "hide" | null
  >(null);
  const [ping, setPing] = useState<Ping | null>(null);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [characterLibraryKind, setCharacterLibraryKind] =
    useState<CharacterLibraryKind>("player");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null,
  );
  const [characterName, setCharacterName] = useState("");
  const [characterFile, setCharacterFile] = useState<File | null>(null);
  const [characterStatsDraft, setCharacterStatsDraft] =
    useState<CharacterStatsDraft>(emptyCharacterStatsDraft);
  const [characterStatsExpanded, setCharacterStatsExpanded] = useState(false);
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [deletingCharacterId, setDeletingCharacterId] = useState<
    string | null
  >(null);
  const [npcSearchOpen, setNpcSearchOpen] = useState(false);
  const [npcSearchQuery, setNpcSearchQuery] = useState("");
  const [openMacroCharacterIds, setOpenMacroCharacterIds] = useState<string[]>(
    [],
  );
  const [collapsedMacroCharacterIds, setCollapsedMacroCharacterIds] = useState<
    string[]
  >([]);
  const [macroEditorCharacterId, setMacroEditorCharacterId] = useState<
    string | null
  >(null);
  const [macroMenu, setMacroMenu] = useState<MacroMenuState | null>(null);
  const [macroRollModes, setMacroRollModes] = useState<Record<string, MacroRollMode>>({});
  const [macroDrag, setMacroDrag] = useState<MacroDragState | null>(null);
  const [macroDropTarget, setMacroDropTarget] =
    useState<MacroDropTargetState | null>(null);
  const [savingMacroOrder, setSavingMacroOrder] = useState(false);
  const [macroCategories, setMacroCategories] = useState<
    CharacterMacroCategory[]
  >([]);
  const [expandedMacroCategoryIds, setExpandedMacroCategoryIds] = useState<
    string[]
  >([]);
  const [categoryMenu, setCategoryMenu] = useState<CategoryMenuState | null>(
    null,
  );
  const [categoryEditor, setCategoryEditor] =
    useState<CategoryEditorState | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [macroEditorOpen, setMacroEditorOpen] = useState(false);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState("");
  const [macroDescription, setMacroDescription] = useState("");
  const [macroIsDamage, setMacroIsDamage] = useState(false);
  const [macroCategoryId, setMacroCategoryId] = useState<string | null>(null);
  const [macroDiceSides, setMacroDiceSides] = useState<number[]>([20]);
  const [macroDiceCounts, setMacroDiceCounts] = useState<number[]>([1]);
  const [macroDiceDamageTypes, setMacroDiceDamageTypes] = useState<
    DamageTypeValue[]
  >([""]);
  const [macroBonuses, setMacroBonuses] = useState<number[]>([]);
  const [macroBonusDamageTypes, setMacroBonusDamageTypes] = useState<
    DamageTypeValue[]
  >([]);
  const [savingMacro, setSavingMacro] = useState(false);
  const [deletingMacroId, setDeletingMacroId] = useState<string | null>(null);
  const [temporaryBonusMacroId, setTemporaryBonusMacroId] = useState<
    string | null
  >(null);
  const [temporaryDiceSides, setTemporaryDiceSides] = useState<number[]>([]);
  const [temporaryDiceDamageTypes, setTemporaryDiceDamageTypes] = useState<
    DamageTypeValue[]
  >([]);
  const [temporaryBonuses, setTemporaryBonuses] = useState<number[]>([]);
  const [temporaryBonusDamageTypes, setTemporaryBonusDamageTypes] = useState<
    DamageTypeValue[]
  >([]);
  const [savingTemporaryBonus, setSavingTemporaryBonus] = useState(false);
  const [macroRollResult, setMacroRollResult] =
    useState<MacroRollResult | null>(null);

  const viewportRef = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cursorX = event.clientX - rect.left - viewport.clientLeft;
      const cursorY = event.clientY - rect.top - viewport.clientTop;
      const deltaY = event.deltaY;

      setViewport((current) => {
        const nextZoom = Math.max(
          0.25,
          Math.min(2, current.zoom - deltaY * 0.0008),
        );
        if (nextZoom === current.zoom) return current;

        // Keep the same map point under the cursor as the scale changes.
        const ratio = nextZoom / current.zoom;
        return {
          zoom: nextZoom,
          pan: {
            x: cursorX - (cursorX - current.pan.x) * ratio,
            y: cursorY - (cursorY - current.pan.y) * ratio,
          },
        };
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const tokensRef = useRef<Token[]>([]);
  const sceneAssetsRef = useRef<SceneAssetPlacement[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const initiativeRef = useRef<InitiativeEntry[]>([]);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const macroDockRef = useRef<HTMLDivElement | null>(null);
  const macroDockOrderRef = useRef(macroDockOrder);
  const quickDieDockRef = useRef<HTMLElement | null>(null);
  const tokenMacroRef = useRef<HTMLElement | null>(null);
  const mapInputRef = useRef<HTMLInputElement | null>(null);
  const sceneAssetInputRef = useRef<HTMLInputElement | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const pingHoldTimerRef = useRef<number | null>(null);
  const macroRollTimerRef = useRef<number | null>(null);
  const macroRollSequenceRef = useRef(0);
  const floatingPanelLayoutsRef = useRef(floatingPanelLayouts);
  const panelDockPlacementsRef = useRef(panelDockPlacements);
  const leftCollapsedRef = useRef(leftCollapsed);
  const rightCollapsedRef = useRef(rightCollapsed);
  const panelDragHandledRef = useRef(false);
  const floatingLayoutSaveTimerRef = useRef<number | null>(null);
  const floatingLayoutSaveInFlightRef = useRef(false);
  const floatingLayoutSavePendingRef = useRef(false);
  const floatingLayoutRevisionRef = useRef(0);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  const realtimeReconnectRef = useRef<() => void>(() => undefined);
  const assetUrlsRef = useRef<Record<string, string>>({});
  const assetUrlLeasesRef = useRef<Record<string, AssetUrlLease>>({});
  const pendingTokenPatchesRef = useRef(
    new Map<string, TokenDatabasePatch>(),
  );
  const optimisticTokenPatchesRef = useRef(
    new Map<string, TokenDatabasePatch>(),
  );
  const inFlightTokenPatchesRef = useRef(
    new Map<string, TokenDatabasePatch>(),
  );
  const tokenSaveTimersRef = useRef(new Map<string, number>());
  const tokenMoveSaveCoordinatorRef = useRef(new TokenMoveSaveCoordinator());
  const tokenMoveConfirmationTimersRef = useRef(new Set<number>());
  const tableLifecycleActiveRef = useRef(true);
  const sceneScaleSaveTimersRef = useRef(new Map<string, number>());
  const pendingSceneScalesRef = useRef(new Map<string, number>());
  const fogStateTrackerRef = useRef(new FogStateTracker());
  const fogSaveQueueRef = useRef(createKeyedTaskQueue());
  const characterMacrosLoadSequenceRef = useRef(0);
  const macroCategoriesLoadSequenceRef = useRef(0);
  const diceRollLogLoadSequenceRef = useRef(0);
  const campaignLoadSequenceRef = useRef(0);
  const sceneLoadSequenceRef = useRef(0);
  const pointerRef = useRef<
    | {
        mode: "pan";
        pointerId: number;
        clientX: number;
        clientY: number;
      }
    | {
        mode: "token";
        pointerId: number;
        tokenId: string;
        startX: number;
        startY: number;
        origins: TokenMoveOrigin[];
        deltaX: number;
        deltaY: number;
        positionChanged: boolean;
      }
    | {
        mode: "token-select";
        pointerId: number;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
      }
    | {
        mode: "token-resize";
        pointerId: number;
        tokenId: string;
        tokenX: number;
        tokenY: number;
        originSize: number;
        size: number;
        resized: boolean;
      }
    | {
        mode: "scene-asset-move";
        pointerId: number;
        placementId: string;
        startPointerX: number;
        startPointerY: number;
        originX: number;
        originY: number;
        width: number;
        height: number;
        x: number;
        y: number;
        moved: boolean;
      }
    | {
        mode: "scene-asset-resize";
        pointerId: number;
        placementId: string;
        originX: number;
        originY: number;
        originWidth: number;
        originHeight: number;
        width: number;
        height: number;
        resized: boolean;
      }
    | {
        mode: "scene-asset-rotate";
        pointerId: number;
        placementId: string;
        centerX: number;
        centerY: number;
        rotation: number;
        rotated: boolean;
      }
    | {
        mode: "draw";
        pointerId: number;
        kind: DrawMode;
        points: Array<{ x: number; y: number }>;
      }
    | {
        mode: "measure";
        pointerId: number;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
      }
    | {
        mode: "erase";
        pointerId: number;
        erasedIds: string[];
      }
    | {
        mode: "drawing-move";
        pointerId: number;
        drawingId: string;
        startX: number;
        startY: number;
        originalPoints: Array<{ x: number; y: number }>;
        kind: Drawing["kind"];
        moved: boolean;
      }
    | {
        mode: "drawing-rotate";
        pointerId: number;
        drawingId: string;
        centerX: number;
        centerY: number;
        rotated: boolean;
      }
    | {
        mode: "drawing-resize";
        pointerId: number;
        drawingId: string;
        centerX: number;
        centerY: number;
        kind: Drawing["kind"];
        rotation: number;
        resized: boolean;
      }
    | {
        mode: "fog";
        pointerId: number;
        sceneId: string;
        reveal: boolean;
        cells: Set<string>;
        lastCell: FogBrushPreview | null;
        patch: FogState | null;
      }
    | {
        mode: "ping";
        pointerId: number;
        clientX: number;
        clientY: number;
        x: number;
        y: number;
        fired: boolean;
      }
    | null
  >(null);

  useEffect(() => {
    tokensRef.current = tokens;
    sceneAssetsRef.current = sceneAssets;
    drawingsRef.current = drawings;
    initiativeRef.current = initiative;
  }, [drawings, initiative, sceneAssets, tokens]);

  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId, hasMasterAccess]);

  const activeScene =
    scenes.find((scene) => scene.id === activeSceneId) ?? null;
  const revealedFogCells = useMemo(
    () => new Set(activeScene?.revealed_cells ?? []),
    [activeScene?.revealed_cells],
  );
  const activeMapAsset = activeScene?.map_asset_id
    ? assets.find((asset) => asset.id === activeScene.map_asset_id) ?? null
    : null;
  const activeMapAspectRatio =
    activeMapAsset?.width && activeMapAsset.height
      ? activeMapAsset.width / activeMapAsset.height
      : null;
  const activeBoardWidth = activeScene
    ? activeScene.map_width_px
    : 0;
  const activeBoardHeight = activeScene
    ? activeMapAspectRatio
      ? activeBoardWidth / activeMapAspectRatio
      : activeBoardWidth *
        (activeScene.grid_rows / activeScene.grid_columns)
    : 0;
  const activeGridColumns = activeScene
    ? Math.max(1, Math.ceil(activeBoardWidth / activeScene.grid_cell_px))
    : 0;
  const activeGridRows = activeScene
    ? Math.max(1, Math.ceil(activeBoardHeight / activeScene.grid_cell_px))
    : 0;
  const visibleTokens = useMemo(() => {
    if (!playerView) return tokens;
    return tokens.filter(
      (token) =>
        token.visible_to_players || token.owner_user_id === user.uid,
    );
  }, [playerView, tokens, user.uid]);
  const revealedTokens = useMemo(
    () => visibleTokens.filter((token) =>
      isTokenVisibleThroughFog(
        token,
        activeScene?.fog_enabled ?? false,
        revealedFogCells,
        hasMasterAccess,
      ),
    ),
    [activeScene?.fog_enabled, hasMasterAccess, revealedFogCells, visibleTokens],
  );
  const revealedTokenIds = useMemo(
    () => new Set(revealedTokens.map((token) => token.id)),
    [revealedTokens],
  );
  const selectedTokenIds = selectedTokenIdsState.filter((id) =>
    revealedTokenIds.has(id),
  );
  const selectedToken =
    revealedTokens.find(
      (token) => token.id === inspectedTokenId && token.scene_id === activeSceneId,
    ) ?? null;
  const selectedSceneAsset =
    sceneAssets.find((placement) => placement.id === selectedSceneAssetId) ??
    null;
  const campaignSceneAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "prop"),
    [assets],
  );
  const knownCharacters = useMemo(() => {
    const byId = new Map<string, Character>();
    for (const character of sceneCharacters) byId.set(character.id, character);
    for (const character of campaignNpcs) byId.set(character.id, character);
    for (const character of characters) byId.set(character.id, character);
    return [...byId.values()];
  }, [campaignNpcs, characters, sceneCharacters]);
  const selectedTokenCharacter = selectedToken?.character_id
    ? (knownCharacters.find(
        (character) => character.id === selectedToken.character_id,
      ) ?? null)
    : null;
  const canSeeMacroRollName = (entry: DiceRollLogEntry) => {
    if (entry.roll_kind !== "macro") return false;
    if (isMaster || entry.roller_user_id === user.uid) return true;

    const character = knownCharacters.find(
      (candidate) => candidate.id === entry.character_id,
    );
    if (character?.owner_user_id === user.uid) return true;

    return tokens.some(
      (token) =>
        token.character_id === entry.character_id &&
        token.owner_user_id === user.uid &&
        token.name === entry.actor_name,
    );
  };
  const canViewSelectedTokenStats = Boolean(
    selectedToken &&
      (hasMasterAccess || selectedToken.owner_user_id === user.uid),
  );
  const editingCharacter =
    knownCharacters.find((character) => character.id === editingCharacterId) ??
    null;
  const openMacroCharacters = useMemo(
    () =>
      openMacroCharacterIds
        .map((characterId) =>
          knownCharacters.find((character) => character.id === characterId),
        )
        .filter((character): character is Character => Boolean(character)),
    [knownCharacters, openMacroCharacterIds],
  );
  const macroEditorCharacter =
    knownCharacters.find(
      (character) => character.id === macroEditorCharacterId,
    ) ?? null;
  const temporaryBonusMacro =
    characterMacros.find((macro) => macro.id === temporaryBonusMacroId) ?? null;
  const temporaryBonusCharacter = temporaryBonusMacro
    ? knownCharacters.find(
        (character) => character.id === temporaryBonusMacro.character_id,
      ) ?? null
    : null;

  const visibleScenes = useMemo(() => {
    if (!playerView) return scenes;
    return scenes.filter((scene) => scene.id === campaign.player_scene_id);
  }, [campaign.player_scene_id, playerView, scenes]);

  const sortedInitiative = useMemo(
    () =>
      initiative
        .filter((entry) => !entry.group_entry_id)
        .sort(
          (left, right) =>
            (right.initiative ?? -999) - (left.initiative ?? -999) ||
            left.sort_order - right.sort_order,
        ),
    [initiative],
  );
  const initiativeMembersByGroup = useMemo(() => {
    const grouped = new Map<string, InitiativeEntry[]>();
    for (const entry of initiative) {
      if (!entry.group_entry_id) continue;
      const current = grouped.get(entry.group_entry_id) ?? [];
      current.push(entry);
      grouped.set(entry.group_entry_id, current);
    }
    for (const members of grouped.values()) {
      members.sort((a, b) => a.sort_order - b.sort_order);
    }
    return grouped;
  }, [initiative]);
  const displayedInitiative = useMemo(
    () => hasMasterAccess ? sortedInitiative : sortedInitiative.filter((entry) =>
      entry.token_id
        ? revealedTokenIds.has(entry.token_id)
        : (initiativeMembersByGroup.get(entry.id) ?? []).some(
            (member) => member.token_id && revealedTokenIds.has(member.token_id),
          ),
    ),
    [hasMasterAccess, initiativeMembersByGroup, revealedTokenIds, sortedInitiative],
  );
  const displayedInitiativeTokenCount = hasMasterAccess
    ? initiative.length
    : initiative.filter((entry) => entry.token_id && revealedTokenIds.has(entry.token_id)).length;
  const deadInitiativeEntryIds = useMemo(() => {
    const deadEntryIds = new Set<string>();
    const tokenById = new Map(tokens.map((token) => [token.id, token]));
    for (const entry of initiative) {
      if (entry.group_entry_id) continue;
      if (entry.token_id) {
        if (tokenById.get(entry.token_id)?.is_dead) {
          deadEntryIds.add(entry.id);
        }
        continue;
      }
      const members = initiativeMembersByGroup.get(entry.id) ?? [];
      if (
        members.length > 0 &&
        members.every(
          (member) =>
            member.token_id !== null &&
            tokenById.get(member.token_id)?.is_dead === true,
        )
      ) {
        deadEntryIds.add(entry.id);
      }
    }
    return deadEntryIds;
  }, [initiative, initiativeMembersByGroup, tokens]);
  const runnableInitiative = useMemo(
    () =>
      sortedInitiative.filter(
        (entry) => !deadInitiativeEntryIds.has(entry.id),
      ),
    [deadInitiativeEntryIds, sortedInitiative],
  );
  const mergeableInitiativeTokenIds = useMemo(
    () =>
      hasMasterAccess
        ? selectedTokenIds.filter((tokenId) =>
            tokens.some((token) => token.id === tokenId),
          )
        : [],
    [hasMasterAccess, selectedTokenIds, tokens],
  );
  const mergeSelectionActive = mergeableInitiativeTokenIds.length >= 2;

  const macrosByCharacter = useMemo(() => {
    const grouped = new Map<string, CharacterMacro[]>();
    for (const macro of characterMacros) {
      const current = grouped.get(macro.character_id) ?? [];
      current.push(macro);
      grouped.set(macro.character_id, current);
    }
    for (const macros of grouped.values()) {
      macros.sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, "it"),
      );
    }
    return grouped;
  }, [characterMacros]);
  const categoriesByCharacter = useMemo(() => {
    const grouped = new Map<string, CharacterMacroCategory[]>();
    for (const category of macroCategories) {
      const current = grouped.get(category.character_id) ?? [];
      current.push(category);
      grouped.set(category.character_id, current);
    }
    for (const categories of grouped.values()) {
      categories.sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, "it"),
      );
    }
    return grouped;
  }, [macroCategories]);
  const macroSectionsForCharacter = useCallback(
    (characterId: string) => {
      const macros = macrosByCharacter.get(characterId) ?? [];
      const categories = categoriesByCharacter.get(characterId) ?? [];
      const categoryIds = new Set(categories.map((category) => category.id));
      return {
        uncategorized: macros.filter(
          (macro) => !macro.category_id || !categoryIds.has(macro.category_id),
        ),
        sections: categories.map((category) => ({
          category,
          macros: macros.filter((macro) => macro.category_id === category.id),
        })),
      };
    },
    [macrosByCharacter, categoriesByCharacter],
  );
  const selectedTokenMacros = selectedTokenCharacter
    ? (macrosByCharacter.get(selectedTokenCharacter.id) ?? [])
    : [];
  const filteredCampaignNpcs = useMemo(() => {
    const query = npcSearchQuery.trim().toLocaleLowerCase("it");
    if (!query) return campaignNpcs;
    return campaignNpcs.filter((npc) =>
      npc.name.toLocaleLowerCase("it").includes(query),
    );
  }, [campaignNpcs, npcSearchQuery]);
  const availablePanelIds = useMemo<FloatingPanelId[]>(
    () =>
      isMaster && !playerView
        ? [
            "token",
            "initiative",
            "rolls",
            "scene",
            "scenes-list",
            "characters-list",
            "campaign-assets",
            "asset-library",
          ]
        : ["token", "initiative", "rolls", "characters-list"],
    [isMaster, playerView],
  );
  const rightDockedPanelIds = useMemo(
    () =>
      availablePanelIds
        .filter((panelId) => panelDockPlacements[panelId].mode === "right")
        .sort(
          (left, right) =>
            panelDockPlacements[left].order -
            panelDockPlacements[right].order,
        ),
    [availablePanelIds, panelDockPlacements],
  );
  const leftDockedPanelIds = useMemo(
    () =>
      availablePanelIds
        .filter((panelId) => panelDockPlacements[panelId].mode === "left")
        .sort(
          (left, right) =>
            panelDockPlacements[left].order -
            panelDockPlacements[right].order,
        ),
    [availablePanelIds, panelDockPlacements],
  );
  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }, []);

  const updateFloatingPanelLayout = useCallback(
    (panelId: FloatingPanelId, layout: FloatingPanelLayout) => {
      floatingLayoutRevisionRef.current += 1;
      setFloatingPanelLayouts((current) => {
        const next = { ...current, [panelId]: layout };
        floatingPanelLayoutsRef.current = next;
        return next;
      });
    },
    [],
  );

  const updatePanelDockPlacements = useCallback(
    (
      updater: (current: PanelDockPlacements) => PanelDockPlacements,
    ) => {
      floatingLayoutRevisionRef.current += 1;
      setPanelDockPlacements((current) => {
        const next = updater(current);
        panelDockPlacementsRef.current = next;
        return next;
      });
    },
    [],
  );

  const focusFloatingPanel = useCallback((panelId: FloatingPanelId) => {
    floatingLayoutRevisionRef.current += 1;
    setFloatingPanelLayouts((current) => {
      const highestZ = Math.max(
        ...Object.values(current).map((panel) => panel.z),
      );
      if (current[panelId].z === highestZ) return current;
      const next = {
        ...current,
        [panelId]: { ...current[panelId], z: highestZ + 1 },
      };
      floatingPanelLayoutsRef.current = next;
      return next;
    });
  }, []);

  const flushFloatingPanelLayouts = useCallback(async () => {
    if (floatingLayoutSaveInFlightRef.current) {
      floatingLayoutSavePendingRef.current = true;
      return;
    }

    floatingLayoutSaveInFlightRef.current = true;
    try {
      do {
        floatingLayoutSavePendingRef.current = false;
        const panels = floatingPanelLayoutsRef.current;
        const result = await supabase
          .from("app_users")
          .update({
            table_layout: {
              version: 4,
              panels,
              docking: panelDockPlacementsRef.current,
              macroDockOrder: macroDockOrderRef.current,
              leftRailCollapsed: leftCollapsedRef.current,
              rightRailCollapsed: rightCollapsedRef.current,
            },
          })
          .eq("firebase_uid", user.uid);
        if (result.error) {
          setError(
            "Layout aggiornato sullo schermo, ma non salvato sul profilo.",
          );
          floatingLayoutSavePendingRef.current = false;
          break;
        }
      } while (floatingLayoutSavePendingRef.current);
    } finally {
      floatingLayoutSaveInFlightRef.current = false;
    }
  }, [supabase, user.uid]);

  const saveFloatingPanelLayouts = useCallback(() => {
    if (floatingLayoutSaveTimerRef.current !== null) {
      window.clearTimeout(floatingLayoutSaveTimerRef.current);
    }
    floatingLayoutSaveTimerRef.current = window.setTimeout(() => {
      floatingLayoutSaveTimerRef.current = null;
      void flushFloatingPanelLayouts();
    }, 450);
  }, [flushFloatingPanelLayouts]);

  const resetFloatingPanelLayouts = useCallback(() => {
    const next = defaultFloatingPanelLayouts();
    const nextDocking = defaultPanelDockPlacements();
    floatingLayoutRevisionRef.current += 1;
    floatingPanelLayoutsRef.current = next;
    panelDockPlacementsRef.current = nextDocking;
    macroDockOrderRef.current = [QUICK_DIE_DOCK_ID];
    leftCollapsedRef.current = false;
    rightCollapsedRef.current = false;
    setFloatingPanelLayouts(next);
    setPanelDockPlacements(nextDocking);
    setMacroDockOrder(macroDockOrderRef.current);
    setLeftCollapsed(false);
    setRightCollapsed(false);
    saveFloatingPanelLayouts();
    notify("Layout pannelli ripristinato");
  }, [notify, saveFloatingPanelLayouts]);

  const updateMacroDockOrder = (next: string[]) => {
    floatingLayoutRevisionRef.current += 1;
    macroDockOrderRef.current = next;
    setMacroDockOrder(next);
    saveFloatingPanelLayouts();
  };

  const closeMenusForDockReorder = () => {
    setQuickDiePickerOpen(false);
    setMacroMenu(null);
    setCategoryMenu(null);
  };

  const toggleLeftRail = useCallback(() => {
    const next = !leftCollapsedRef.current;
    floatingLayoutRevisionRef.current += 1;
    leftCollapsedRef.current = next;
    setLeftCollapsed(next);
    saveFloatingPanelLayouts();
  }, [saveFloatingPanelLayouts]);

  const toggleRightRail = useCallback(() => {
    const next = !rightCollapsedRef.current;
    floatingLayoutRevisionRef.current += 1;
    rightCollapsedRef.current = next;
    setRightCollapsed(next);
    saveFloatingPanelLayouts();
  }, [saveFloatingPanelLayouts]);

  const beginPanelDockDrag = useCallback(
    (event: DragEvent<HTMLElement>, panelId: FloatingPanelId) => {
      panelDragHandledRef.current = false;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PANEL_DRAG_MIME, panelId);
      event.dataTransfer.setData("text/plain", t(PANEL_TITLES[panelId]));
      const ghost = document.createElement("div");
      ghost.className = "panel-drag-ghost";
      ghost.textContent = t(PANEL_TITLES[panelId]);
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 20, 19);
      window.setTimeout(() => ghost.remove(), 0);
      setDraggedPanelId(panelId);
    },
    [],
  );

  const floatPanelAt = useCallback(
    (panelId: FloatingPanelId, clientX: number, clientY: number) => {
      const currentLayout = floatingPanelLayoutsRef.current[panelId];
      const nextLayout = normalizeFloatingPanelLayout({
        ...currentLayout,
        x: clientX - Math.min(currentLayout.width, 210) / 2,
        y: clientY - 20,
        collapsed: false,
      });
      updateFloatingPanelLayout(panelId, nextLayout);
      updatePanelDockPlacements((current) => ({
        ...current,
        [panelId]: { ...current[panelId], mode: "floating" },
      }));
      focusFloatingPanel(panelId);
      saveFloatingPanelLayouts();
    },
    [
      focusFloatingPanel,
      saveFloatingPanelLayouts,
      updateFloatingPanelLayout,
      updatePanelDockPlacements,
    ],
  );

  const finishPanelDockDrag = useCallback(
    (event: DragEvent<HTMLElement>, panelId: FloatingPanelId) => {
      if (
        !panelDragHandledRef.current &&
        event.dataTransfer.dropEffect !== "none" &&
        event.clientX > 0 &&
        event.clientY > 0
      ) {
        floatPanelAt(panelId, event.clientX, event.clientY);
      }
      panelDragHandledRef.current = false;
      setDraggedPanelId(null);
    },
    [floatPanelAt],
  );

  const dropPanelAsFloating = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const panelId = panelIdFromDrag(event);
      if (!panelId) return;
      event.preventDefault();
      panelDragHandledRef.current = true;
      floatPanelAt(panelId, event.clientX, event.clientY);
      setDraggedPanelId(null);
    },
    [floatPanelAt],
  );

  const dropPanelInRail = useCallback(
    (
      event: DragEvent<HTMLElement>,
      rail: "left" | "right",
      targetId?: FloatingPanelId,
      position: "before" | "after" = "after",
    ) => {
      const panelId = panelIdFromDrag(event);
      if (!panelId) return;
      event.preventDefault();
      event.stopPropagation();
      panelDragHandledRef.current = true;
      if (targetId === panelId) {
        setDraggedPanelId(null);
        return;
      }
      updatePanelDockPlacements((current) => {
        const railPanels = (Object.keys(current) as FloatingPanelId[])
          .filter(
            (item) => item !== panelId && current[item].mode === rail,
          )
          .sort((left, right) => current[left].order - current[right].order);
        const targetIndex = targetId ? railPanels.indexOf(targetId) : -1;
        const insertAt =
          targetIndex < 0
            ? railPanels.length
            : targetIndex + (position === "after" ? 1 : 0);
        railPanels.splice(insertAt, 0, panelId);
        const next = { ...current };
        for (const [order, item] of railPanels.entries()) {
          next[item] = { ...next[item], mode: rail, order };
        }
        return next;
      });
      setDraggedPanelId(null);
      saveFloatingPanelLayouts();
    },
    [saveFloatingPanelLayouts, updatePanelDockPlacements],
  );

  const dropRelativeToDockedPanel = useCallback(
    (
      event: DragEvent<HTMLElement>,
      targetId: FloatingPanelId,
      position: "before" | "after",
    ) => {
      const targetMode = panelDockPlacementsRef.current[targetId].mode;
      if (targetMode !== "left" && targetMode !== "right") return;
      dropPanelInRail(
        event,
        targetMode,
        targetId,
        position,
      );
    },
    [dropPanelInRail],
  );

  const appendDiceRollLog = useCallback((entry: DiceRollLogEntry) => {
    setDiceRollLog((current) =>
      [entry, ...current.filter((item) => item.id !== entry.id)]
        .sort(
          (left, right) =>
            Date.parse(right.created_at) - Date.parse(left.created_at),
        )
        .slice(0, DICE_ROLL_LOG_LIMIT),
    );
  }, []);

  const loadUserProfile = useCallback(async (includeTableLayout = false) => {
    const layoutRevisionAtRequest = floatingLayoutRevisionRef.current;
    const result = await supabase
      .from("app_users")
      .select("display_name,first_name,last_name,nickname,table_layout")
      .eq("firebase_uid", user.uid)
      .single();
    if (result.error) throw result.error;

    const profile = result.data as UserProfile;
    const googleName = namePartsFor(user.displayName);
    const firstName = profile.first_name ?? googleName.firstName;
    const lastName = profile.last_name ?? googleName.lastName;
    const displayName =
      profile.nickname?.trim() ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      profile.display_name ||
      user.email ||
      "Giocatore";

    setProfileFirstName(firstName);
    setProfileLastName(lastName);
    setProfileNickname(profile.nickname ?? "");
    setProfileDisplayName(displayName);
    if (
      includeTableLayout &&
      layoutRevisionAtRequest === floatingLayoutRevisionRef.current
    ) {
      const nextLayouts = readFloatingPanelLayouts(profile.table_layout);
      const nextDocking = readPanelDockPlacements(profile.table_layout);
      const nextMacroDockOrder = readMacroDockOrder(profile.table_layout);
      const nextLeftCollapsed = readLeftRailCollapsed(profile.table_layout);
      const nextRightCollapsed = readRightRailCollapsed(profile.table_layout);
      floatingPanelLayoutsRef.current = nextLayouts;
      panelDockPlacementsRef.current = nextDocking;
      macroDockOrderRef.current = nextMacroDockOrder;
      leftCollapsedRef.current = nextLeftCollapsed;
      rightCollapsedRef.current = nextRightCollapsed;
      setFloatingPanelLayouts(nextLayouts);
      setPanelDockPlacements(nextDocking);
      setMacroDockOrder(nextMacroDockOrder);
      setLeftCollapsed(nextLeftCollapsed);
      setRightCollapsed(nextRightCollapsed);
    }
  }, [supabase, user.displayName, user.email, user.uid]);

  const loadCharacterMacros = useCallback(async () => {
    const loadSequence = beginLatestLoad(characterMacrosLoadSequenceRef);
    const result = await supabase
      .from("character_macros")
      .select(
        "id,character_id,category_id,name,description,is_damage_macro,dice_sides,dice_damage_types,bonuses,bonus_damage_types,temporary_dice_sides,temporary_dice_damage_types,temporary_bonuses,temporary_bonus_damage_types,sort_order",
      )
      .order("sort_order")
      .order("created_at");
    if (result.error) throw result.error;
    if (!isLatestLoad(characterMacrosLoadSequenceRef, loadSequence)) return false;
    setCharacterMacros(
      ((result.data ?? []) as unknown as CharacterMacro[]).map((macro) => ({
        ...macro,
        description: macro.description ?? "",
        is_damage_macro: Boolean(macro.is_damage_macro),
        dice_sides: (macro.dice_sides ?? []).map((sides) =>
          toNumber(sides, 20),
        ),
        dice_damage_types: normalizeDamageTypes(
          macro.dice_damage_types,
          macro.dice_sides?.length ?? 0,
        ),
        bonuses: (macro.bonuses ?? []).map((bonus) => toNumber(bonus)),
        bonus_damage_types: normalizeDamageTypes(
          macro.bonus_damage_types,
          macro.bonuses?.length ?? 0,
        ),
        temporary_dice_sides: (macro.temporary_dice_sides ?? []).map((sides) =>
          toNumber(sides, 6),
        ),
        temporary_dice_damage_types: normalizeDamageTypes(
          macro.temporary_dice_damage_types,
          macro.temporary_dice_sides?.length ?? 0,
        ),
        temporary_bonuses: (macro.temporary_bonuses ?? []).map((bonus) =>
          toNumber(bonus),
        ),
        temporary_bonus_damage_types: normalizeDamageTypes(
          macro.temporary_bonus_damage_types,
          macro.temporary_bonuses?.length ?? 0,
        ),
        sort_order: toNumber(macro.sort_order),
        category_id: macro.category_id ?? null,
      })),
    );
    return true;
  }, [supabase]);

  const loadMacroCategories = useCallback(async () => {
    const loadSequence = beginLatestLoad(macroCategoriesLoadSequenceRef);
    const result = await supabase
      .from("character_macro_categories")
      .select("id,character_id,name,sort_order");
    if (result.error) throw result.error;
    if (!isLatestLoad(macroCategoriesLoadSequenceRef, loadSequence)) return false;
    setMacroCategories(
      ((result.data ?? []) as unknown as CharacterMacroCategory[]).map(
        (category) => ({
          ...category,
          sort_order: toNumber(category.sort_order),
        }),
      ),
    );
    return true;
  }, [supabase]);

  const saveUserProfile = async () => {
    const firstName = profileFirstName.trim();
    const lastName = profileLastName.trim();
    const nickname = profileNickname.trim();
    const displayName =
      nickname ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      user.displayName ||
      user.email ||
      "Giocatore";

    setSavingProfile(true);
    setError("");
    try {
      const result = await supabase
        .from("app_users")
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          nickname: nickname || null,
          display_name: displayName,
        })
        .eq("firebase_uid", user.uid);
      if (result.error) throw result.error;

      setProfileFirstName(firstName);
      setProfileLastName(lastName);
      setProfileNickname(nickname);
      setProfileDisplayName(displayName);
      setMembers((current) =>
        current.map((member) =>
          member.user_id === user.uid
            ? {
                ...member,
                app_users: member.app_users
                  ? { ...member.app_users, display_name: displayName }
                  : member.app_users,
              }
            : member,
        ),
      );
      notify("Profilo aggiornato");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Salvataggio del profilo non riuscito.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const openUserProfile = () => {
    setAccountMenuOpen(false);
    setProfileOpen(true);
    void loadUserProfile().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Caricamento del profilo non riuscito.",
      ),
    );
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUserProfile(true).catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Caricamento del profilo non riuscito.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUserProfile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadCharacterMacros(), loadMacroCategories()]).catch(
        (reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : "Caricamento delle macro non riuscito.",
          ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCharacterMacros, loadMacroCategories]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: globalThis.PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!macroMenu) return;
    const closeMacroMenu = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (
        !macroDockRef.current?.contains(target) &&
        !tokenMacroRef.current?.contains(target)
      ) {
        setMacroMenu(null);
      }
    };
    document.addEventListener("pointerdown", closeMacroMenu);
    return () => document.removeEventListener("pointerdown", closeMacroMenu);
  }, [macroMenu]);

  useEffect(() => {
    if (!categoryMenu) return;
    const closeCategoryMenu = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (
        !macroDockRef.current?.contains(target) &&
        !tokenMacroRef.current?.contains(target)
      ) {
        setCategoryMenu(null);
      }
    };
    document.addEventListener("pointerdown", closeCategoryMenu);
    return () =>
      document.removeEventListener("pointerdown", closeCategoryMenu);
  }, [categoryMenu]);

  useEffect(() => {
    if (!initiativeGroupMenuId) return;
    const closeInitiativeGroupMenu = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-initiative-group]")) {
        setInitiativeGroupMenuId(null);
      }
    };
    document.addEventListener("pointerdown", closeInitiativeGroupMenu);
    return () =>
      document.removeEventListener("pointerdown", closeInitiativeGroupMenu);
  }, [initiativeGroupMenuId]);

  useEffect(() => {
    if (!quickDiePickerOpen) return;
    const closeQuickDiePicker = (event: globalThis.PointerEvent) => {
      if (!quickDieDockRef.current?.contains(event.target as Node)) {
        setQuickDiePickerOpen(false);
      }
    };
    const closeQuickDiePickerOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickDiePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeQuickDiePicker);
    document.addEventListener("keydown", closeQuickDiePickerOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeQuickDiePicker);
      document.removeEventListener("keydown", closeQuickDiePickerOnEscape);
    };
  }, [quickDiePickerOpen]);

  useEffect(() => {
    const keepPanelsVisible = () => {
      setFloatingPanelLayouts((current) => {
        const next = Object.fromEntries(
          (Object.keys(current) as FloatingPanelId[]).map((panelId) => [
            panelId,
            normalizeFloatingPanelLayout(current[panelId]),
          ]),
        ) as FloatingPanelLayouts;
        floatingPanelLayoutsRef.current = next;
        return next;
      });
    };
    const initialNormalization = window.setTimeout(keepPanelsVisible, 0);
    window.addEventListener("resize", keepPanelsVisible);
    return () => {
      window.clearTimeout(initialNormalization);
      window.removeEventListener("resize", keepPanelsVisible);
    };
  }, []);

  useEffect(
    () => {
      tableLifecycleActiveRef.current = true;
      return () => {
        tableLifecycleActiveRef.current = false;
      };
    },
    [],
  );

  useEffect(
    () => () => {
      if (floatingLayoutSaveTimerRef.current !== null) {
        window.clearTimeout(floatingLayoutSaveTimerRef.current);
      }
    },
    [],
  );

  const showPing = useCallback((nextPing: Ping) => {
    if (pingTimerRef.current !== null) {
      window.clearTimeout(pingTimerRef.current);
    }
    setPing(nextPing);
    pingTimerRef.current = window.setTimeout(() => {
      setPing(null);
      pingTimerRef.current = null;
    }, PING_LIFETIME_MS);
  }, []);

  const flushTokenUpdates = useCallback(
    async (tokenId: string) => {
      const timer = tokenSaveTimersRef.current.get(tokenId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        tokenSaveTimersRef.current.delete(tokenId);
      }
      if (inFlightTokenPatchesRef.current.has(tokenId)) return;

      let patch = pendingTokenPatchesRef.current.get(tokenId);
      if (!patch) return;

      while (patch) {
        pendingTokenPatchesRef.current.delete(tokenId);
        inFlightTokenPatchesRef.current.set(tokenId, patch);

        const tokenPatch: Record<string, unknown> = {};
        const statsPatch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (TOKEN_STAT_FIELDS.has(key)) statsPatch[key] = value;
          else tokenPatch[key] = value;
        }

        let saveError = null;
        if (Object.keys(tokenPatch).length > 0) {
          const tokenResult = await supabase
            .from("tokens")
            .update(tokenPatch)
            .eq("id", tokenId);
          saveError = tokenResult.error;
          if (
            !tokenResult.error &&
            typeof tokenPatch.visible_to_players === "boolean"
          ) {
            void channelRef.current?.send({
              type: "broadcast",
              event: "token_visibility",
              payload: {
                tokenId,
                visible: tokenPatch.visible_to_players,
              } satisfies TokenVisibilityBroadcast,
            });
          }
        }
        if (!saveError && Object.keys(statsPatch).length > 0) {
          const statsResult = await supabase.from("token_stats").upsert(
            {
              token_id: tokenId,
              ...statsPatch,
            },
            { onConflict: "token_id" },
          );
          saveError = statsResult.error;
        }

        inFlightTokenPatchesRef.current.delete(tokenId);
        if (saveError) {
          const newerPatch = pendingTokenPatchesRef.current.get(tokenId);
          pendingTokenPatchesRef.current.set(tokenId, {
            ...patch,
            ...newerPatch,
          });
          setError(saveError.message);
          return;
        }

        patch = pendingTokenPatchesRef.current.get(tokenId);
      }
    },
    [supabase, setError],
  );

  const queueTokenUpdate = useCallback(
    (
      tokenId: string,
      patch: TokenDatabasePatch,
      saveImmediately = false,
    ) => {
      setTokens((current) =>
        current.map((token) =>
          token.id === tokenId ? { ...token, ...patch } : token,
        ),
      );

      pendingTokenPatchesRef.current.set(tokenId, {
        ...pendingTokenPatchesRef.current.get(tokenId),
        ...patch,
      });
      optimisticTokenPatchesRef.current.set(tokenId, {
        ...optimisticTokenPatchesRef.current.get(tokenId),
        ...patch,
      });

      const previousTimer = tokenSaveTimersRef.current.get(tokenId);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);

      if (saveImmediately) {
        tokenSaveTimersRef.current.delete(tokenId);
        void flushTokenUpdates(tokenId);
        return;
      }

      const nextTimer = window.setTimeout(() => {
        tokenSaveTimersRef.current.delete(tokenId);
        void flushTokenUpdates(tokenId);
      }, TOKEN_SAVE_DEBOUNCE_MS);
      tokenSaveTimersRef.current.set(tokenId, nextTimer);
    },
    [flushTokenUpdates],
  );

  useEffect(
    () => () => {
      if (pingTimerRef.current !== null) {
        window.clearTimeout(pingTimerRef.current);
      }
      if (pingHoldTimerRef.current !== null) {
        window.clearTimeout(pingHoldTimerRef.current);
      }
      if (macroRollTimerRef.current !== null) {
        window.clearTimeout(macroRollTimerRef.current);
      }
      for (const timer of tokenMoveConfirmationTimersRef.current) {
        window.clearTimeout(timer);
      }
      tokenMoveConfirmationTimersRef.current.clear();
    },
    [],
  );

  useEffect(
    () => () => {
      for (const timer of tokenSaveTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      tokenSaveTimersRef.current.clear();
      for (const tokenId of pendingTokenPatchesRef.current.keys()) {
        void flushTokenUpdates(tokenId);
      }
      for (const timer of sceneScaleSaveTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      sceneScaleSaveTimersRef.current.clear();
      for (const [sceneId, gridCellPx] of pendingSceneScalesRef.current) {
        void supabase
          .from("scenes")
          .update({ grid_cell_px: gridCellPx })
          .eq("id", sceneId);
      }
      pendingSceneScalesRef.current.clear();
    },
    [flushTokenUpdates, supabase],
  );

  const signAssetUrls = useCallback(
    async (
      rows: Array<{
        id: string;
        storage_path: string;
      }>,
    ) => {
      return refreshAssetUrls(
        rows,
        assetUrlsRef.current,
        assetUrlLeasesRef.current,
        async (path, ttl) => {
          const signed = await supabase.storage
            .from(ASSET_BUCKET)
            .createSignedUrl(path, ttl);
          return signed.data?.signedUrl;
        },
      );
    },
    [supabase],
  );

  const loadDiceRollLog = useCallback(async () => {
    const loadSequence = beginLatestLoad(diceRollLogLoadSequenceRef);
    const result = await supabase
      .from("dice_roll_log")
      .select("*")
      .eq("campaign_id", initialChoice.campaign.id)
      .order("created_at", { ascending: false })
      .limit(DICE_ROLL_LOG_LIMIT);
    if (result.error) throw result.error;
    if (!isLatestLoad(diceRollLogLoadSequenceRef, loadSequence)) return false;
    const serverEntries = (result.data ?? []) as unknown as DiceRollLogEntry[];
    setDiceRollLog((current) =>
      mergeNewestEntriesById(serverEntries, current, DICE_ROLL_LOG_LIMIT),
    );
    return true;
  }, [initialChoice.campaign.id, supabase]);

  const loadCampaignData = useCallback(async () => {
    const loadSequence = beginLatestLoad(campaignLoadSequenceRef);
    const fogReadVersion = fogStateTrackerRef.current.captureReadVersion();
    const campaignId = initialChoice.campaign.id;
    const [
      campaignResult,
      sceneResult,
      assetResult,
      memberResult,
      characterResult,
      npcResult,
      characterStatsResult,
    ] =
      await Promise.all([
        supabase
          .from("campaigns")
          .select("id,name,description,player_scene_id")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("scenes")
          .select("*")
          .eq("campaign_id", campaignId)
          .eq("is_enabled", true)
          .order("sort_order"),
        supabase
          .from("assets")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false }),
        supabase.rpc("list_campaign_members", { target_campaign_id: campaignId }),
        supabase
          .from("characters")
          .select("*")
          .eq("owner_user_id", user.uid)
          .eq("kind", "player")
          .order("name"),
        supabase
          .from("characters")
          .select("*")
          .eq("campaign_id", campaignId)
          .eq("kind", "npc")
          .order("name"),
        supabase
          .from("character_stats")
          .select(
            "character_id,hp_current,hp_max,armor_class,difficulty_class,saving_throws,speed_ft,notes",
          ),
      ]);

    const firstError =
      campaignResult.error ||
      sceneResult.error ||
      assetResult.error ||
      memberResult.error ||
      characterResult.error ||
      npcResult.error ||
      characterStatsResult.error;
    if (firstError) throw firstError;

    const nextCampaign = campaignResult.data as Campaign;
    const rawAssets = (assetResult.data ?? []) as Asset[];
    const rawCharacters = (characterResult.data ?? []) as Character[];
    const rawCampaignNpcs = (npcResult.data ?? []) as Character[];
    const characterStatsById = new Map(
      ((characterStatsResult.data ?? []) as Array<
        CharacterStatsPayload & { character_id: string }
      >).map((stats) => [stats.character_id, stats]),
    );
    const withCharacterStats = (character: Character): Character => ({
      ...EMPTY_CHARACTER_STATS,
      ...character,
      ...(characterStatsById.get(character.id) ?? {}),
    });
    const urls = await signAssetUrls([
      ...rawAssets,
      ...[...rawCharacters, ...rawCampaignNpcs].map((character) => ({
        id: character.id,
        storage_path: character.token_storage_path,
      })),
    ]);
    const nextAssets = rawAssets.map((asset) => ({
      ...asset,
      signedUrl: urls[asset.id],
    }));
    const nextScenes = (
      (sceneResult.data ?? []) as Record<string, unknown>[]
    ).map((row) => {
      const scene = normalizeScene(row);
      return {
        ...scene,
        mapUrl: scene.map_asset_id
          ? (urls[scene.map_asset_id] ?? null)
          : null,
      };
    });

    const currentSceneId = activeSceneIdRef.current;
    const nextActiveSceneId = playerView
      ? (nextCampaign.player_scene_id ?? nextScenes[0]?.id ?? null)
      : currentSceneId && nextScenes.some((scene) => scene.id === currentSceneId)
        ? currentSceneId
        : (nextScenes[0]?.id ?? null);
    if (!isLatestLoad(campaignLoadSequenceRef, loadSequence)) {
      return { current: false, sceneId: null };
    }

    setCampaign(nextCampaign);
    setAssets(nextAssets);
    setCharacters(
      rawCharacters.map((character) => ({
        ...withCharacterStats(character),
        signedUrl: urls[character.id],
      })),
    );
    setCampaignNpcs(
      rawCampaignNpcs.map((character) => ({
        ...withCharacterStats(character),
        signedUrl: urls[character.id],
      })),
    );
    const nextMembers = (memberResult.data ?? []) as unknown as Membership[];
    setMembers(nextMembers);
    setIsMaster(nextMembers.some((member) => member.user_id === user.uid && member.role === "master"));
    setScenes(
      nextScenes.map((scene) =>
        fogStateTrackerRef.current.apply(scene.id, scene, fogReadVersion),
      ),
    );
    activeSceneIdRef.current = nextActiveSceneId;
    setActiveSceneId(nextActiveSceneId);
    return { current: true, sceneId: nextActiveSceneId };
  }, [
    initialChoice.campaign.id,
    playerView,
    signAssetUrls,
    supabase,
    user.uid,
  ]);

  const loadSceneData = useCallback(
    async (sceneId: string) => {
      const loadSequence = beginLatestLoad(sceneLoadSequenceRef);
      const [
        tokenResult,
        sceneAssetResult,
        drawingResult,
        entriesResult,
        stateResult,
      ] =
        await Promise.all([
          supabase.from("tokens").select("*").eq("scene_id", sceneId),
          supabase
            .from("scene_assets")
            .select("*")
            .eq("scene_id", sceneId)
            .order("z_index")
            .order("created_at"),
          supabase
            .from("drawings")
            .select("*")
            .eq("scene_id", sceneId)
            .order("created_at"),
          supabase
            .from("initiative_entries")
            .select("*")
            .eq("scene_id", sceneId),
          supabase
            .from("initiative_state")
            .select("*")
            .eq("scene_id", sceneId)
            .maybeSingle(),
        ]);

      const firstError =
        tokenResult.error ||
        sceneAssetResult.error ||
        drawingResult.error ||
        entriesResult.error ||
        stateResult.error;
      if (firstError) throw firstError;

      const rawTokens = (tokenResult.data ?? []) as Record<string, unknown>[];
      const tokenIds = rawTokens
        .map((row) => (typeof row.id === "string" ? row.id : null))
        .filter((id): id is string => Boolean(id));
      const tokenStatsById = new Map<string, Record<string, unknown>>();
      if (tokenIds.length > 0) {
        const statsResult = await supabase
          .from("token_stats")
          .select(
            "token_id,hp_current,hp_max,temp_hp,armor_class,difficulty_class,saving_throws,speed_ft,notes",
          )
          .in("token_id", tokenIds);
        if (statsResult.error) throw statsResult.error;
        for (const stats of statsResult.data ?? []) {
          tokenStatsById.set(
            stats.token_id as string,
            stats as Record<string, unknown>,
          );
        }
      }
      const characterIds = [
        ...new Set(
          rawTokens
            .map((row) =>
              typeof row.character_id === "string" ? row.character_id : null,
            )
            .filter((id): id is string => Boolean(id)),
          ),
      ];
      let nextSceneCharacters: Character[] = [];
      if (characterIds.length > 0) {
        const characterResult = await supabase
          .from("characters")
          .select(
            "id,owner_user_id,campaign_id,kind,name,token_storage_path,token_mime_type,token_width,token_height",
          )
          .in("id", characterIds);
        if (characterResult.error) throw characterResult.error;
        const rawSceneCharacters = (characterResult.data ?? []) as Character[];
        const characterUrls = await signAssetUrls(
          rawSceneCharacters.map((character) => ({
            id: character.id as string,
            storage_path: character.token_storage_path as string,
          })),
        );
        nextSceneCharacters = rawSceneCharacters.map((character) => ({
          ...EMPTY_CHARACTER_STATS,
          ...character,
          signedUrl: characterUrls[character.id],
        }));
      }

      if (!isLatestLoad(sceneLoadSequenceRef, loadSequence)) return false;

      const nextTokens = rawTokens.map((row) => {
        const token = normalizeToken({
          ...row,
          ...EMPTY_TOKEN_STATS,
          ...(typeof row.id === "string" ? tokenStatsById.get(row.id) : null),
        });
        const serverToken = {
          ...token,
          imageUrl:
            (token.character_id
              ? assetUrlsRef.current[token.character_id]
              : null) ??
            (token.image_asset_id
              ? assetUrlsRef.current[token.image_asset_id]
              : null) ??
            null,
        };
        const optimisticPatch = optimisticTokenPatchesRef.current.get(
          token.id,
        );
        if (!optimisticPatch) return serverToken;

        const pendingPatch = pendingTokenPatchesRef.current.get(token.id);
        const inFlightPatch = inFlightTokenPatchesRef.current.get(token.id);
        const remainingPatch: TokenDatabasePatch = {};

        for (const [key, localValue] of Object.entries(optimisticPatch)) {
          const tokenKey = key as keyof TokenDatabasePatch;
          const isStillSaving =
            Boolean(
              pendingPatch &&
                Object.prototype.hasOwnProperty.call(pendingPatch, tokenKey),
            ) ||
            Boolean(
              inFlightPatch &&
                Object.prototype.hasOwnProperty.call(inFlightPatch, tokenKey),
            );
          const serverValue = serverToken[tokenKey as keyof Token];
          if (isStillSaving || !tokenValuesMatch(serverValue, localValue)) {
            Object.assign(remainingPatch, { [tokenKey]: localValue });
          }
        }

        if (Object.keys(remainingPatch).length === 0) {
          optimisticTokenPatchesRef.current.delete(token.id);
        } else {
          optimisticTokenPatchesRef.current.set(token.id, remainingPatch);
        }

        return { ...serverToken, ...remainingPatch };
      });
      setTokens(nextTokens);
      const nextSceneAssets = (
        (sceneAssetResult.data ?? []) as Record<string, unknown>[]
      ).map(normalizeSceneAssetPlacement);
      setSceneAssets(nextSceneAssets);
      setSceneCharacters(nextSceneCharacters);
      setDrawings((drawingResult.data ?? []) as unknown as Drawing[]);
      setInitiative(
        ((entriesResult.data ?? []) as unknown as InitiativeEntry[]).map(
          (entry) => ({
            ...entry,
            initiative:
              entry.initiative === null ? null : toNumber(entry.initiative),
          }),
        ),
      );
      setInitiativeState(
        (stateResult.data as unknown as InitiativeState | null) ?? null,
      );
      setSelectedTokenId((current) =>
        nextTokens.some((token) => token.id === current) ? current : null,
      );
      setInspectedTokenId((current) =>
        nextTokens.some((token) => token.id === current) ? current : null,
      );
      setSelectedTokenIds((current) =>
        current.filter((tokenId) =>
          nextTokens.some((token) => token.id === tokenId),
        ),
      );
      setSelectedSceneAssetId((current) =>
        nextSceneAssets.some((placement) => placement.id === current)
          ? current
          : null,
      );
      return true;
    },
    [signAssetUrls, supabase],
  );

  const realtimeLoadersRef = useRef({
    appendDiceRollLog,
    loadCampaignData,
    loadCharacterMacros,
    loadDiceRollLog,
    loadMacroCategories,
    loadSceneData,
    loadUserProfile,
    showPing,
  });
  useEffect(() => {
    realtimeLoadersRef.current = {
      appendDiceRollLog,
      loadCampaignData,
      loadCharacterMacros,
      loadDiceRollLog,
      loadMacroCategories,
      loadSceneData,
      loadUserProfile,
      showPing,
    };
  }, [
    appendDiceRollLog,
    loadCampaignData,
    loadCharacterMacros,
    loadDiceRollLog,
    loadMacroCategories,
    loadSceneData,
    loadUserProfile,
    showPing,
  ]);

  const reconcileRealtimeState = useCallback(
    async (isCurrent: () => boolean) => {
      const loaders = realtimeLoadersRef.current;
      const loadLatest = async (load: () => Promise<boolean>) => {
        while (isCurrent()) {
          if (await load()) return true;
        }
        return false;
      };

      let campaignResult: Awaited<
        ReturnType<typeof loaders.loadCampaignData>
      >;
      do {
        if (!isCurrent()) return false;
        campaignResult = await loaders.loadCampaignData();
      } while (!campaignResult.current);

      if (!isCurrent()) return false;
      const results = await Promise.all([
        loadLatest(loaders.loadDiceRollLog),
        loadLatest(loaders.loadCharacterMacros),
        loadLatest(loaders.loadMacroCategories),
        campaignResult.sceneId
          ? loadLatest(() => loaders.loadSceneData(campaignResult.sceneId!))
          : Promise.resolve(true),
      ]);
      return results.every(Boolean) && isCurrent();
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadCampaignData(), loadDiceRollLog()])
        .catch((reason) =>
          setError(
            reason instanceof Error ? reason.message : "Errore campagna.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaignData, loadDiceRollLog]);

  useEffect(() => {
    if (!activeSceneId) return;
    loadSceneData(activeSceneId).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Errore scena."),
    );
  }, [activeSceneId, loadSceneData]);

  useEffect(() => {
    let cancelled = false;
    let databaseChannel: RealtimeChannel | null = null;
    let broadcastChannel: RealtimeChannel | null = null;
    let connectionAttempt = 0;
    let reconciliationSequence = 0;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    let refreshInFlight = false;
    let watchdogTimer: number | null = null;
    let lastDatabaseActivityAt = Date.now();
    let lastSuccessfulReconciliationAt = Date.now();
    let reconciliationInFlight = false;
    const pendingRefreshResources = new Set<RealtimeRefreshResource>();
    const channelLifecycleKey = `vers:${campaign.id}`;
    let databaseReady = false;
    let databaseFailed = false;
    let broadcastReady = false;
    let broadcastFailed = false;

    const publishConnectionStatus = () => {
      if (cancelled) return;
      if (databaseReady && broadcastReady) {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setRealtimeStatus("connected");
      } else if (databaseFailed || broadcastFailed) {
        setRealtimeStatus("error");
      } else {
        setRealtimeStatus("connecting");
      }
    };

    const forgetRealtimeChannel = (channel: RealtimeChannel) => {
      if (!supabase.realtime.getChannels().includes(channel)) return;
      const realtimeWithRemoval = supabase.realtime as typeof supabase.realtime & {
        _remove: (staleChannel: RealtimeChannel) => void;
      };
      realtimeWithRemoval._remove(channel);
    };

    const removeRealtimeChannel = async (channel: RealtimeChannel) => {
      const status = await supabase.removeChannel(channel);
      if (status === "ok") return;
      // realtime-js keeps failed removals cached by topic; clear the installed
      // client's internal registry before creating a replacement channel.
      // A stale cleanup may finish after a replacement was installed, so only
      // remove the exact channel if it is still the registered instance.
      channel.teardown();
      forgetRealtimeChannel(channel);
    };

    const runRealtimeRefresh = async (
      label: string,
      refresh: () => Promise<unknown>,
    ) => {
      const refreshAttempt = connectionAttempt;
      try {
        await refresh();
      } catch (reason) {
        if (cancelled || refreshAttempt !== connectionAttempt) return;
        console.error(`VERS Realtime ${label} refresh failed`, reason);
        databaseReady = false;
        databaseFailed = true;
        publishConnectionStatus();
        scheduleReconnect(`aggiornamento ${label} non riuscito`);
      }
    };

    const markDatabaseActivity = () => {
      lastDatabaseActivityAt = Date.now();
    };

    const invalidateRealtimeLoads = () => {
      invalidateLatestLoad(campaignLoadSequenceRef);
      invalidateLatestLoad(sceneLoadSequenceRef);
      invalidateLatestLoad(diceRollLogLoadSequenceRef);
      invalidateLatestLoad(characterMacrosLoadSequenceRef);
      invalidateLatestLoad(macroCategoriesLoadSequenceRef);
    };

    const flushQueuedRealtimeRefreshes = () => {
      refreshTimer = null;
      if (!cancelled && reconciliationInFlight) {
        refreshTimer = window.setTimeout(
          flushQueuedRealtimeRefreshes,
          REALTIME_REFRESH_DEBOUNCE_MS,
        );
        return;
      }
      if (
        cancelled ||
        refreshInFlight ||
        pendingRefreshResources.size === 0
      ) {
        return;
      }
      const resources = new Set(pendingRefreshResources);
      pendingRefreshResources.clear();
      refreshInFlight = true;

      void runRealtimeRefresh("eventi accorpati", async () => {
        const loaders = realtimeLoadersRef.current;
        let sceneId = activeSceneIdRef.current;
        if (resources.has("campaign")) {
          const campaignResult = await loaders.loadCampaignData();
          if (campaignResult.current) sceneId = campaignResult.sceneId;
        }

        const refreshes: Promise<unknown>[] = [];
        if (resources.has("scene") && sceneId) {
          refreshes.push(loaders.loadSceneData(sceneId));
        }
        if (resources.has("macros")) {
          refreshes.push(loaders.loadCharacterMacros());
        }
        if (resources.has("macro-categories")) {
          refreshes.push(loaders.loadMacroCategories());
        }
        if (resources.has("dice")) {
          refreshes.push(loaders.loadDiceRollLog());
        }
        if (resources.has("profile")) {
          refreshes.push(loaders.loadUserProfile());
        }
        await Promise.all(refreshes);
      }).finally(() => {
          refreshInFlight = false;
          if (
            !cancelled &&
            pendingRefreshResources.size > 0 &&
            refreshTimer === null
          ) {
            refreshTimer = window.setTimeout(
              flushQueuedRealtimeRefreshes,
              REALTIME_REFRESH_DEBOUNCE_MS,
            );
          }
        });
    };

    const queueRealtimeRefresh = (
      resources: RealtimeRefreshResource[],
      databaseEvent = true,
    ) => {
      if (cancelled) return;
      if (databaseEvent) markDatabaseActivity();
      for (const resource of resources) {
        pendingRefreshResources.add(resource);
      }
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(
        flushQueuedRealtimeRefreshes,
        REALTIME_REFRESH_DEBOUNCE_MS,
      );
    };

    const reconcileForAttempt = async (
      attempt: number,
      reason: string,
      preserveConnectionStatus = false,
    ) => {
      if (reconciliationInFlight) return;
      const sequence = ++reconciliationSequence;
      reconciliationInFlight = true;
      if (!preserveConnectionStatus) databaseReady = false;
      databaseFailed = false;
      publishConnectionStatus();

      try {
        const reconciled = await withRealtimeDeadline(
          reconcileRealtimeState(
            () =>
              !cancelled &&
              attempt === connectionAttempt &&
              sequence === reconciliationSequence,
          ),
          REALTIME_RECONCILIATION_DEADLINE_MS,
        );
        if (
          !reconciled ||
          cancelled ||
          attempt !== connectionAttempt ||
          sequence !== reconciliationSequence
        ) {
          return;
        }
        databaseReady = true;
        databaseFailed = false;
        const reconciledAt = Date.now();
        lastDatabaseActivityAt = reconciledAt;
        lastSuccessfulReconciliationAt = reconciledAt;
        setLastRealtimeSyncAt(reconciledAt);
        publishConnectionStatus();
      } catch (refreshError) {
        if (
          cancelled ||
          attempt !== connectionAttempt ||
          sequence !== reconciliationSequence
        ) {
          return;
        }
        invalidateRealtimeLoads();
        databaseReady = false;
        databaseFailed = true;
        console.error(`VERS Realtime ${reason} failed`, refreshError);
        publishConnectionStatus();
        scheduleReconnect(`${reason} non riuscito`);
      } finally {
        if (
          attempt === connectionAttempt &&
          sequence === reconciliationSequence
        ) {
          reconciliationInFlight = false;
        }
      }
    };

    const connectChannels = async () => {
      const attempt = ++connectionAttempt;
      reconciliationSequence += 1;
      reconciliationInFlight = false;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      pendingRefreshResources.clear();
      databaseReady = false;
      databaseFailed = false;
      broadcastReady = false;
      broadcastFailed = false;
      publishConnectionStatus();
      channelRef.current = null;

      await runRealtimeChannelLifecycleTask(channelLifecycleKey, async () => {
        if (cancelled || attempt !== connectionAttempt) return;

        // Removing the last registered channel makes realtime-js disconnect the
        // shared socket. Keep an unjoined channel registered during handoff so
        // subscriptions for this attempt cannot race that disconnect.
        const handoffChannel = supabase.channel(
          `vers-handoff:${campaign.id}:${attempt}`,
        );

        try {
          const previousDatabaseChannel = databaseChannel;
          const previousBroadcastChannel = broadcastChannel;
          const realtimeTopics = new Set([
            `realtime:vers-db:${campaign.id}`,
            `realtime:campaign:${campaign.id}`,
          ]);
          const channelsToRemove = new Set(
            [
              previousDatabaseChannel,
              previousBroadcastChannel,
              ...supabase.realtime
                .getChannels()
                .filter((channel) => realtimeTopics.has(channel.topic)),
            ].filter((channel): channel is RealtimeChannel => channel !== null),
          );
          databaseChannel = null;
          broadcastChannel = null;
          await Promise.all([...channelsToRemove].map(removeRealtimeChannel));
          if (cancelled || attempt !== connectionAttempt) return;

        // No explicit token: callback mode refreshes the Firebase JWT on every
        // heartbeat and whenever a channel rejoins.
        await supabase.realtime.setAuth();
        if (cancelled || attempt !== connectionAttempt) return;

        const queueRefreshForAttempt = (
          resources: RealtimeRefreshResource[],
          databaseEvent = true,
        ) => {
          if (cancelled || attempt !== connectionAttempt) return;
          queueRealtimeRefresh(resources, databaseEvent);
        };
        const rowString = (row: object, key: string) => {
          const value = (row as Record<string, unknown>)[key];
          return typeof value === "string" ? value : null;
        };
        const rowNullableString = (row: object, key: string) => {
          const value = (row as Record<string, unknown>)[key];
          return typeof value === "string"
            ? value
            : value === null
              ? null
              : undefined;
        };
        const rowId = (row: object) => rowString(row, "id");
        const rowSceneId = (row: object) => rowString(row, "scene_id");
        const eventTouchesActiveScene = <
          Row extends { id: string; scene_id: string },
        >(
          nextRow: Record<string, unknown>,
          previousRow: Record<string, unknown>,
          currentRows: Row[],
        ) => {
          const sceneId = activeSceneIdRef.current;
          if (!sceneId) return false;
          if (
            rowSceneId(nextRow) === sceneId ||
            rowSceneId(previousRow) === sceneId
          ) {
            return true;
          }
          const id = rowId(nextRow) ?? rowId(previousRow);
          return Boolean(
            id &&
              currentRows.some(
                (row) => row.id === id && row.scene_id === sceneId,
              ),
          );
        };

        const nextDatabaseChannel = supabase
          .channel(`vers-db:${campaign.id}`, {
            config: {
              broadcast: { replication_ready: true },
            },
          })
          .on("system", {}, (payload) => {
            if (cancelled || attempt !== connectionAttempt) return;
            if (payload.extension !== "system") return;
            if (payload.status !== "ok") {
              databaseReady = false;
              databaseFailed = true;
              publishConnectionStatus();
              scheduleReconnect("replica Postgres non pronta");
              return;
            }

            databaseFailed = false;
            databaseReady = false;
            publishConnectionStatus();
            void reconcileForAttempt(attempt, "riallineamento");
          })
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "campaigns",
              filter: `id=eq.${campaign.id}`,
            },
            () => queueRefreshForAttempt(["campaign", "scene"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "characters" },
            () => queueRefreshForAttempt(["campaign", "scene"]),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "assets",
              filter: `campaign_id=eq.${campaign.id}`,
            },
            () => queueRefreshForAttempt(["campaign", "scene"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "character_macros" },
            () => queueRefreshForAttempt(["macros"]),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "character_macro_categories",
            },
            () => queueRefreshForAttempt(["macro-categories"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "character_stats" },
            () => queueRefreshForAttempt(["campaign"]),
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "scenes",
              filter: `campaign_id=eq.${campaign.id}`,
            },
            () => queueRefreshForAttempt(["campaign", "scene"]),
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "tabletop_profiles" },
            () => queueRefreshForAttempt(["campaign"]),
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "app_users" },
            ({ new: nextProfile }) => {
              queueRefreshForAttempt(["campaign"]);
              if (nextProfile.firebase_uid === user.uid) {
                queueRefreshForAttempt(["profile"]);
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "dice_roll_log",
              filter: `campaign_id=eq.${campaign.id}`,
            },
            ({ new: nextRoll }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              markDatabaseActivity();
              realtimeLoadersRef.current.appendDiceRollLog(
                nextRoll as unknown as DiceRollLogEntry,
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "scene_delete_events",
              filter: `campaign_id=eq.${campaign.id}`,
            },
            ({ new: nextDelete }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              const incoming = nextDelete as unknown as SceneDeleteEvent;
              if (incoming.campaign_id !== campaign.id) return;

              markDatabaseActivity();
              if (incoming.entity_table === "assets") {
                queueRefreshForAttempt(["campaign", "scene"], false);
                return;
              }
              if (incoming.entity_table === "scenes") {
                queueRefreshForAttempt(["campaign", "scene"], false);
                return;
              }
              if (incoming.scene_id !== activeSceneIdRef.current) return;

              queueRefreshForAttempt(
                incoming.entity_table === "tokens"
                  ? ["scene", "macros", "macro-categories"]
                  : ["scene"],
                false,
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "tokens" },
            ({ eventType, new: nextToken, old: previousToken }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              if (
                !eventTouchesActiveScene(
                  nextToken,
                  previousToken,
                  tokensRef.current,
                )
              ) {
                return;
              }
              markDatabaseActivity();

              const id = rowId(nextToken) ?? rowId(previousToken);
              const currentToken = id
                ? tokensRef.current.find((token) => token.id === id)
                : null;
              const previousSceneId =
                rowSceneId(previousToken) ?? currentToken?.scene_id ?? null;
              const nextSceneId = rowSceneId(nextToken);
              const previousCharacterValue = rowNullableString(
                previousToken,
                "character_id",
              );
              const nextCharacterValue = rowNullableString(
                nextToken,
                "character_id",
              );
              const previousCharacterId =
                previousCharacterValue === undefined
                  ? (currentToken?.character_id ?? null)
                  : previousCharacterValue;
              const nextCharacterId =
                nextCharacterValue === undefined
                  ? previousCharacterId
                  : nextCharacterValue;
              const characterScopeChanged =
                eventType !== "UPDATE" ||
                previousSceneId !== nextSceneId ||
                previousCharacterId !== nextCharacterId;
              queueRefreshForAttempt(
                characterScopeChanged
                  ? ["scene", "macros", "macro-categories"]
                  : ["scene"],
                false,
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "scene_assets" },
            ({ new: nextPlacement, old: previousPlacement }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              if (
                eventTouchesActiveScene(
                  nextPlacement,
                  previousPlacement,
                  sceneAssetsRef.current,
                )
              ) {
                markDatabaseActivity();
                queueRefreshForAttempt(["scene"], false);
              }
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "token_stats" },
            ({ new: nextStats, old: previousStats }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              const tokenId =
                rowString(nextStats, "token_id") ??
                rowString(previousStats, "token_id");
              if (
                tokenId &&
                tokensRef.current.some((token) => token.id === tokenId)
              ) {
                markDatabaseActivity();
                queueRefreshForAttempt(["scene"], false);
              }
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "drawings" },
            ({ eventType, new: nextDrawing, old: previousDrawing }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              const sceneId = activeSceneIdRef.current;
              if (!sceneId) return;
              if (
                !eventTouchesActiveScene(
                  nextDrawing,
                  previousDrawing,
                  drawingsRef.current,
                )
              ) {
                return;
              }
              markDatabaseActivity();
              if (
                eventType === "INSERT" &&
                nextDrawing.scene_id === sceneId
              ) {
                const incoming = nextDrawing as unknown as Drawing;
                invalidateLatestLoad(sceneLoadSequenceRef);
                setDrawings((current) =>
                  current.some((drawing) => drawing.id === incoming.id)
                    ? current
                    : [...current, incoming],
                );
                queueRefreshForAttempt(["scene"], false);
                return;
              }
              queueRefreshForAttempt(["scene"], false);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "initiative_entries" },
            ({ new: nextEntry, old: previousEntry }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              if (
                eventTouchesActiveScene(
                  nextEntry,
                  previousEntry,
                  initiativeRef.current,
                )
              ) {
                markDatabaseActivity();
                queueRefreshForAttempt(["scene"], false);
              }
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "initiative_state" },
            ({ new: nextState, old: previousState }) => {
              if (cancelled || attempt !== connectionAttempt) return;
              const sceneId = activeSceneIdRef.current;
              if (
                sceneId &&
                (rowSceneId(nextState) === sceneId ||
                  rowSceneId(previousState) === sceneId)
              ) {
                markDatabaseActivity();
                queueRefreshForAttempt(["scene"], false);
              }
            },
          );
        databaseChannel = nextDatabaseChannel;
        nextDatabaseChannel.subscribe((status, channelError) => {
          if (cancelled || attempt !== connectionAttempt) return;
          if (status === "SUBSCRIBED") {
            databaseFailed = false;
            databaseReady = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            databaseReady = false;
            databaseFailed = true;
            console.error(`VERS database channel ${status}`, channelError);
            scheduleReconnect(`canale database ${status}`);
          } else if (status === "CLOSED") {
            databaseReady = false;
            databaseFailed = false;
            scheduleReconnect("canale database chiuso", 1_500, false);
          }
          publishConnectionStatus();
        });

        const nextBroadcastChannel = supabase
          .channel(`campaign:${campaign.id}`, {
            config: {
              private: true,
              broadcast: { ack: true, self: false },
            },
          })
          .on("broadcast", { event: "ping" }, ({ payload }) => {
            const incoming = payload as Omit<Ping, "id">;
            realtimeLoadersRef.current.showPing({
              ...incoming,
              id: Date.now(),
            });
          })
          .on("broadcast", { event: "dice_roll" }, () => {
            // Peers can send arbitrary payloads. Load the RLS-protected log;
            // postgres_changes still provides the immediate committed event.
            queueRefreshForAttempt(["dice"], false);
          })
          .on("broadcast", { event: "token_visibility" }, () => {
            // Visibility comes from the database, never a peer's assertion.
            queueRefreshForAttempt(["scene"], false);
          });
        broadcastChannel = nextBroadcastChannel;
        channelRef.current = nextBroadcastChannel;
        nextBroadcastChannel.subscribe((status, channelError) => {
          if (cancelled || attempt !== connectionAttempt) return;
          if (status === "SUBSCRIBED") {
            broadcastReady = true;
            broadcastFailed = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            broadcastReady = false;
            broadcastFailed = true;
            console.error(`VERS broadcast channel ${status}`, channelError);
            scheduleReconnect(`canale broadcast ${status}`);
          } else if (status === "CLOSED") {
            broadcastReady = false;
            broadcastFailed = false;
            scheduleReconnect("canale broadcast chiuso", 1_500, false);
          }
          publishConnectionStatus();
        });
        } catch (reason) {
          if (cancelled || attempt !== connectionAttempt) return;
          databaseFailed = true;
          broadcastFailed = true;
          console.error("VERS Realtime connection failed", reason);
          publishConnectionStatus();
          scheduleReconnect("connessione non riuscita");
        } finally {
          forgetRealtimeChannel(handoffChannel);
        }
      });
    };

    const scheduleReconnect = (
      reason: string,
      delay = 3_000,
      showError = true,
    ) => {
      if (cancelled) return;
      console.warn(`VERS Realtime reconnect: ${reason}`);
      reconciliationSequence += 1;
      if (showError) {
        databaseFailed = true;
        broadcastFailed = true;
      } else {
        databaseReady = false;
        broadcastReady = false;
        databaseFailed = false;
        broadcastFailed = false;
      }
      publishConnectionStatus();

      if (reconnectTimer !== null) {
        if (delay > 0) return;
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connectChannels();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (databaseReady && broadcastReady) {
        void reconcileForAttempt(
          connectionAttempt,
          "riallineamento al ritorno sulla scheda",
          true,
        );
        return;
      }
      scheduleReconnect("scheda tornata visibile", 0, false);
    };
    const handleOnline = () =>
      scheduleReconnect("connessione di rete ripristinata", 0, false);

    realtimeReconnectRef.current = () =>
      scheduleReconnect("riallineamento manuale", 0, false);
    supabase.realtime.onHeartbeat((status) => {
      if (
        status === "timeout" ||
        status === "disconnected" ||
        status === "error"
      ) {
        scheduleReconnect(`heartbeat ${status}`);
      }
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    watchdogTimer = window.setInterval(() => {
      if (cancelled || !databaseReady || !broadcastReady) return;
      const now = Date.now();
      if (
        !shouldRunRealtimeWatchdog({
          lastActivityAt: lastDatabaseActivityAt,
          lastReconciliationAt: lastSuccessfulReconciliationAt,
          now,
          idleAfterMs: REALTIME_WATCHDOG_IDLE_MS,
          hardAfterMs: REALTIME_WATCHDOG_HARD_MS,
        })
      ) {
        return;
      }
      void reconcileForAttempt(
        connectionAttempt,
        "watchdog di sincronizzazione",
        true,
      );
    }, REALTIME_WATCHDOG_INTERVAL_MS);

    void connectChannels();
    return () => {
      cancelled = true;
      connectionAttempt += 1;
      reconciliationSequence += 1;
      channelRef.current = null;
      realtimeReconnectRef.current = () => undefined;
      supabase.realtime.onHeartbeat(() => undefined);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (watchdogTimer !== null) window.clearInterval(watchdogTimer);
      pendingRefreshResources.clear();
      const channelsToRemove = [databaseChannel, broadcastChannel].filter(
        (channel): channel is RealtimeChannel => channel !== null,
      );
      databaseChannel = null;
      broadcastChannel = null;
      if (channelsToRemove.length > 0) {
        void runRealtimeChannelLifecycleTask(
          channelLifecycleKey,
          async () => {
            await Promise.all(channelsToRemove.map(removeRealtimeChannel));
          },
        ).catch((reason) =>
          console.error("VERS Realtime cleanup failed", reason),
        );
      }
    };
  }, [
    campaign.id,
    reconcileRealtimeState,
    supabase,
    user.uid,
  ]);

  const boardPoint = useCallback(
    (clientX: number, clientY: number) => {
      const board = boardRef.current;
      if (!board || !activeScene) return null;
      const rect = board.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(rect.width / zoom, (clientX - rect.left) / zoom)),
        y: Math.max(
          0,
          Math.min(rect.height / zoom, (clientY - rect.top) / zoom),
        ),
      };
    },
    [activeScene, zoom],
  );

  const pointToCell = useCallback(
    (clientX: number, clientY: number) => {
      const point = boardPoint(clientX, clientY);
      if (!point || !activeScene) return null;
      return {
        x: Math.max(
          0,
          Math.min(
            activeGridColumns - 1,
            Math.floor(
              (point.x - activeScene.grid_offset_x) /
                activeScene.grid_cell_px,
            ),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            activeGridRows - 1,
            Math.floor(
              (point.y - activeScene.grid_offset_y) /
                activeScene.grid_cell_px,
            ),
          ),
        ),
      };
    },
    [activeGridColumns, activeGridRows, activeScene, boardPoint],
  );

  const canControlToken = useCallback(
    (token: Token) =>
      hasMasterAccess ||
      (token.owner_user_id === user.uid &&
        token.scene_id === campaign.player_scene_id),
    [campaign.player_scene_id, hasMasterAccess, user.uid],
  );

  const persistSceneAssetGeometry = async (
    placementId: string,
    patch: Pick<SceneAssetPlacement, "x" | "y"> |
      Pick<SceneAssetPlacement, "width" | "height"> |
      Pick<SceneAssetPlacement, "rotation">,
  ) => {
    if (!activeScene || !hasMasterAccess) return;
    const result = await supabase
      .from("scene_assets")
      .update(patch)
      .eq("id", placementId)
      .eq("scene_id", activeScene.id);
    if (result.error) {
      setError(result.error.message);
      await loadSceneData(activeScene.id);
    }
  };

  const startSceneAssetMove = (
    event: PointerEvent<HTMLDivElement>,
    placement: SceneAssetPlacement,
  ) => {
    if (event.button !== 0 || tool !== "select" || !hasMasterAccess) return;
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "scene-asset-move",
      pointerId: event.pointerId,
      placementId: placement.id,
      startPointerX: point.x,
      startPointerY: point.y,
      originX: placement.x,
      originY: placement.y,
      width: placement.width,
      height: placement.height,
      x: placement.x,
      y: placement.y,
      moved: false,
    };
    setSelectedSceneAssetId(placement.id);
    setSelectedTokenId(null);
    setSelectedTokenIds([]);
    setSelectedDrawingId(null);
  };

  const startSceneAssetResize = (
    event: PointerEvent<HTMLButtonElement>,
    placement: SceneAssetPlacement,
  ) => {
    if (event.button !== 0 || tool !== "select" || !hasMasterAccess) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "scene-asset-resize",
      pointerId: event.pointerId,
      placementId: placement.id,
      originX: placement.x,
      originY: placement.y,
      originWidth: placement.width,
      originHeight: placement.height,
      width: placement.width,
      height: placement.height,
      resized: false,
    };
    setSelectedSceneAssetId(placement.id);
  };

  const startSceneAssetRotation = (
    event: PointerEvent<HTMLButtonElement>,
    placement: SceneAssetPlacement,
  ) => {
    if (event.button !== 0 || tool !== "select" || !hasMasterAccess) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "scene-asset-rotate",
      pointerId: event.pointerId,
      placementId: placement.id,
      centerX: placement.x + placement.width / 2,
      centerY: placement.y + placement.height / 2,
      rotation: placement.rotation,
      rotated: false,
    };
    setSelectedSceneAssetId(placement.id);
  };

  const moveSceneAsset = (event: PointerEvent<HTMLElement>) => {
    const interaction = pointerRef.current;
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      (interaction.mode !== "scene-asset-move" &&
        interaction.mode !== "scene-asset-resize" &&
        interaction.mode !== "scene-asset-rotate")
    ) {
      return;
    }
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    if (interaction.mode === "scene-asset-move") {
      const x = clampValue(
        interaction.originX + point.x - interaction.startPointerX,
        0,
        Math.max(0, activeBoardWidth - interaction.width),
      );
      const y = clampValue(
        interaction.originY + point.y - interaction.startPointerY,
        0,
        Math.max(0, activeBoardHeight - interaction.height),
      );
      if (x === interaction.x && y === interaction.y) return;
      pointerRef.current = { ...interaction, x, y, moved: true };
      setSceneAssets((current) =>
        current.map((placement) =>
          placement.id === interaction.placementId
            ? { ...placement, x, y }
            : placement,
        ),
      );
      return;
    }

    if (interaction.mode === "scene-asset-rotate") {
      const degrees =
        (Math.atan2(
          point.y - interaction.centerY,
          point.x - interaction.centerX,
        ) *
          180) /
          Math.PI +
        90;
      const rotation = Math.round(((degrees % 360) + 360) % 360);
      if (rotation === interaction.rotation) return;
      pointerRef.current = {
        ...interaction,
        rotation,
        rotated: true,
      };
      setSceneAssets((current) =>
        current.map((placement) =>
          placement.id === interaction.placementId
            ? { ...placement, rotation }
            : placement,
        ),
      );
      return;
    }

    const diagonalSquared =
      interaction.originWidth ** 2 + interaction.originHeight ** 2;
    const deltaX =
      point.x - (interaction.originX + interaction.originWidth);
    const deltaY =
      point.y - (interaction.originY + interaction.originHeight);
    const rawScale =
      1 +
      (deltaX * interaction.originWidth +
        deltaY * interaction.originHeight) /
        diagonalSquared;
    const minimumScale = Math.max(
      SCENE_ASSET_MIN_SIZE_PX / interaction.originWidth,
      SCENE_ASSET_MIN_SIZE_PX / interaction.originHeight,
    );
    const maximumScale = Math.min(
      SCENE_ASSET_MAX_SIZE_PX / interaction.originWidth,
      SCENE_ASSET_MAX_SIZE_PX / interaction.originHeight,
      (activeBoardWidth - interaction.originX) / interaction.originWidth,
      (activeBoardHeight - interaction.originY) / interaction.originHeight,
    );
    const scale = clampValue(rawScale, minimumScale, maximumScale);
    const width = Math.round(interaction.originWidth * scale);
    const height = Math.round(interaction.originHeight * scale);
    if (width === interaction.width && height === interaction.height) return;
    pointerRef.current = {
      ...interaction,
      width,
      height,
      resized: true,
    };
    setSceneAssets((current) =>
      current.map((placement) =>
        placement.id === interaction.placementId
          ? { ...placement, width, height }
          : placement,
      ),
    );
  };

  const endSceneAssetInteraction = async (
    event: PointerEvent<HTMLElement>,
  ) => {
    const interaction = pointerRef.current;
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      (interaction.mode !== "scene-asset-move" &&
        interaction.mode !== "scene-asset-resize" &&
        interaction.mode !== "scene-asset-rotate")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (interaction.mode === "scene-asset-move" && interaction.moved) {
      await persistSceneAssetGeometry(interaction.placementId, {
        x: interaction.x,
        y: interaction.y,
      });
    } else if (
      interaction.mode === "scene-asset-resize" &&
      interaction.resized
    ) {
      await persistSceneAssetGeometry(interaction.placementId, {
        width: interaction.width,
        height: interaction.height,
      });
    } else if (
      interaction.mode === "scene-asset-rotate" &&
      interaction.rotated
    ) {
      await persistSceneAssetGeometry(interaction.placementId, {
        rotation: interaction.rotation,
      });
    }
  };

  const deleteSceneAssetPlacement = async (placementId: string) => {
    if (!activeScene || !hasMasterAccess) return;
    const confirmed = window.confirm(
      t("Rimuovere questa copia dell’asset dalla scena? L’asset resterà disponibile nella campagna."),
    );
    if (!confirmed) return;
    setDeletingSceneAssetId(placementId);
    const result = await supabase
      .from("scene_assets")
      .delete()
      .eq("id", placementId)
      .eq("scene_id", activeScene.id);
    setDeletingSceneAssetId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSceneAssets((current) =>
      current.filter((placement) => placement.id !== placementId),
    );
    setSelectedSceneAssetId((current) =>
      current === placementId ? null : current,
    );
    notify("Asset rimosso dalla scena");
  };

  const startTokenMove = (
    event: PointerEvent<HTMLButtonElement>,
    token: Token,
  ) => {
    if (event.button !== 0) return;
    if (!revealedTokenIds.has(token.id)) return;
    if (tool === "select") setInspectedTokenId(token.id);
    if (
      tool !== "select" ||
      token.locked ||
      !canControlToken(token)
    ) {
      setSelectedSceneAssetId(null);
      setSelectedTokenId(token.id);
      setSelectedTokenIds([]);
      return;
    }
    event.stopPropagation();
    setSelectedSceneAssetId(null);

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const nextSelection = selectedTokenIds.includes(token.id)
        ? selectedTokenIds.filter((tokenId) => tokenId !== token.id)
        : [...selectedTokenIds, token.id];
      setSelectedTokenIds(nextSelection);
      setSelectedTokenId(
        nextSelection.includes(token.id)
          ? token.id
          : (nextSelection[0] ?? null),
      );
      return;
    }

    const movingTokenIds = selectedTokenIds.includes(token.id)
      ? selectedTokenIds
      : [token.id];
    const origins = tokens
      .filter(
        (item) =>
          movingTokenIds.includes(item.id) &&
          !item.locked &&
          canControlToken(item),
      )
      .map((item) => ({
        tokenId: item.id,
        x: item.x,
        y: item.y,
        size: item.size,
        priorOptimisticPosition: (() => {
          const patch = optimisticTokenPatchesRef.current.get(item.id);
          return typeof patch?.x === "number" && typeof patch.y === "number"
            ? { x: patch.x, y: patch.y }
            : null;
        })(),
      }));
    if (origins.length === 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "token",
      pointerId: event.pointerId,
      tokenId: token.id,
      startX: token.x,
      startY: token.y,
      origins,
      deltaX: 0,
      deltaY: 0,
      positionChanged: false,
    };
    setSelectedTokenId(token.id);
    setSelectedTokenIds(origins.map((origin) => origin.tokenId));
    setSelectedDrawingId(null);
    setMovePreview({
      tokenId: token.id,
      tokenCount: origins.length,
      startX: token.x,
      startY: token.y,
      endX: token.x,
      endY: token.y,
    });
  };

  const moveToken = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pointerRef.current;
    if (drag?.mode !== "token" || drag.pointerId !== event.pointerId) return;
    const cell = pointToCell(event.clientX, event.clientY);
    if (!cell) return;
    const rawDeltaX = cell.x - drag.startX;
    const rawDeltaY = cell.y - drag.startY;
    const minimumDeltaX = Math.ceil(
      Math.max(...drag.origins.map((origin) => -origin.x)),
    );
    const minimumDeltaY = Math.ceil(
      Math.max(...drag.origins.map((origin) => -origin.y)),
    );
    const maximumDeltaX = Math.floor(
      Math.min(
        ...drag.origins.map(
          (origin) => activeGridColumns - origin.size - origin.x,
        ),
      ),
    );
    const maximumDeltaY = Math.floor(
      Math.min(
        ...drag.origins.map(
          (origin) => activeGridRows - origin.size - origin.y,
        ),
      ),
    );
    const deltaX = Math.max(
      minimumDeltaX,
      Math.min(maximumDeltaX, rawDeltaX),
    );
    const deltaY = Math.max(
      minimumDeltaY,
      Math.min(maximumDeltaY, rawDeltaY),
    );
    if (deltaX === drag.deltaX && deltaY === drag.deltaY) return;

    pointerRef.current = {
      ...drag,
      deltaX,
      deltaY,
      positionChanged: true,
    };
    const origins = new Map(
      drag.origins.map((origin) => [origin.tokenId, origin]),
    );
    const positions = drag.origins.map((origin) => ({
      id: origin.tokenId,
      x: origin.x + deltaX,
      y: origin.y + deltaY,
    }));
    applyOptimisticTokenPositions(
      optimisticTokenPatchesRef.current,
      positions,
    );
    setTokens((current) =>
      current.map((currentToken) => {
        const origin = origins.get(currentToken.id);
        return origin
          ? {
              ...currentToken,
              x: origin.x + deltaX,
              y: origin.y + deltaY,
            }
          : currentToken;
      }),
    );
    setMovePreview({
      tokenId: drag.tokenId,
      tokenCount: drag.origins.length,
      startX: drag.startX,
      startY: drag.startY,
      endX: drag.startX + deltaX,
      endY: drag.startY + deltaY,
    });
  };

  const endTokenMove = async (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pointerRef.current;
    if (drag?.mode !== "token" || drag.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    setMovePreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const positions: TokenMovePosition[] = drag.origins.map((origin) => ({
      id: origin.tokenId,
      x: origin.x + drag.deltaX,
      y: origin.y + drag.deltaY,
    }));

    if (drag.deltaX === 0 && drag.deltaY === 0) {
      if (drag.positionChanged) {
        restoreMatchingOptimisticTokenPositions(
          optimisticTokenPatchesRef.current,
          drag.origins,
          positions,
        );
      }
      return;
    }
    if (!activeScene) {
      restoreMatchingOptimisticTokenPositions(
        optimisticTokenPatchesRef.current,
        drag.origins,
        positions,
      );
      return;
    }

    const sceneId = activeScene.id;
    const saveMove = () =>
      supabase.rpc("move_token_group", {
        p_scene_id: sceneId,
        p_positions: positions,
      });
    const saveResult = tokenMoveSaveCoordinatorRef.current.run(
      positions.map((position) => position.id),
      saveMove,
    );

    try {
      const result = await saveResult;
      if (result.error) throw result.error;

      if (
        tableLifecycleActiveRef.current &&
        activeSceneIdRef.current === sceneId
      ) {
        const confirmationTimer = window.setTimeout(() => {
          tokenMoveConfirmationTimersRef.current.delete(confirmationTimer);
          if (
            !tableLifecycleActiveRef.current ||
            activeSceneIdRef.current !== sceneId ||
            !hasMatchingOptimisticTokenPosition(
              optimisticTokenPatchesRef.current,
              positions,
            )
          ) {
            return;
          }
          void loadSceneData(sceneId).catch((reason) =>
            console.error("VERS token move confirmation failed", reason),
          );
        }, TOKEN_MOVE_CONFIRMATION_DELAY_MS);
        tokenMoveConfirmationTimersRef.current.add(confirmationTimer);
      }
    } catch (reason) {
      if (!tableLifecycleActiveRef.current) return;
      const clearedTokenIds = clearMatchingOptimisticTokenPositions(
        optimisticTokenPatchesRef.current,
        positions,
      );
      if (clearedTokenIds.size === 0) return;
      if (activeSceneIdRef.current !== sceneId) return;
      const originsById = new Map(
        drag.origins.map((origin) => [origin.tokenId, origin]),
      );
      setTokens((current) =>
        current.map((token) => {
          const origin = clearedTokenIds.has(token.id)
            ? originsById.get(token.id)
            : null;
          return origin ? { ...token, x: origin.x, y: origin.y } : token;
        }),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : reason &&
              typeof reason === "object" &&
              "message" in reason &&
              typeof reason.message === "string"
            ? reason.message
          : "Impossibile salvare il movimento dei token",
      );
      if (activeSceneIdRef.current === sceneId) {
        try {
          await loadSceneData(sceneId);
        } catch (refreshError) {
          console.error("VERS token move rollback failed", refreshError);
        }
      }
    }
  };

  const startTokenResize = (
    event: PointerEvent<HTMLSpanElement>,
    token: Token,
  ) => {
    if (
      event.button !== 0 ||
      !activeScene ||
      tool !== "select" ||
      token.locked ||
      !canControlToken(token)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "token-resize",
      pointerId: event.pointerId,
      tokenId: token.id,
      tokenX: token.x,
      tokenY: token.y,
      originSize: token.size,
      size: token.size,
      resized: false,
    };
  };

  const resizeToken = (event: PointerEvent<HTMLSpanElement>) => {
    const resize = pointerRef.current;
    if (
      resize?.mode !== "token-resize" ||
      resize.pointerId !== event.pointerId ||
      !activeScene
    ) {
      return;
    }
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const tokenLeft =
      activeScene.grid_offset_x + resize.tokenX * activeScene.grid_cell_px;
    const tokenTop =
      activeScene.grid_offset_y + resize.tokenY * activeScene.grid_cell_px;
    const horizontalCells =
      (point.x - tokenLeft) / activeScene.grid_cell_px;
    const verticalCells = (point.y - tokenTop) / activeScene.grid_cell_px;
    const maximumSize = Math.max(
      1,
      Math.floor(
        Math.min(
          activeGridColumns - resize.tokenX,
          activeGridRows - resize.tokenY,
        ),
      ),
    );
    const size = clampValue(
      Math.round(Math.max(horizontalCells, verticalCells)),
      1,
      maximumSize,
    );
    if (size === resize.size) return;
    pointerRef.current = { ...resize, size, resized: true };
    setTokens((current) =>
      current.map((token) =>
        token.id === resize.tokenId ? { ...token, size } : token,
      ),
    );
  };

  const endTokenResize = (event: PointerEvent<HTMLSpanElement>) => {
    const resize = pointerRef.current;
    if (
      resize?.mode !== "token-resize" ||
      resize.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (resize.resized && resize.size !== resize.originSize) {
      queueTokenUpdate(resize.tokenId, { size: resize.size }, true);
    }
  };

  const persistFogState = useCallback(
    async (sceneId: string, patch: FogState) => {
      // A toggle made during a drag takes precedence over its later pointer-up.
      if (!fogStateTrackerRef.current.isCurrent(sceneId, patch)) return;
      try {
        await fogSaveQueueRef.current(sceneId, async () => {
          const result = await supabase
            .from("scenes")
            .update(patch)
            .eq("id", sceneId)
            .eq("campaign_id", initialChoice.campaign.id)
            .select("id")
            .single();
          if (result.error) throw result.error;
        });
        fogStateTrackerRef.current.confirm(sceneId, patch);
      } catch (reason) {
        if (!fogStateTrackerRef.current.discard(sceneId, patch)) return;
        if (!tableLifecycleActiveRef.current) return;
        const message =
          reason && typeof reason === "object" && "message" in reason
            ? String(reason.message)
            : "Errore durante il salvataggio.";
        setError(`Impossibile salvare la nebbia: ${message}`);
        try {
          await loadCampaignData();
        } catch (reloadError) {
          console.error("VERS fog recovery failed", reloadError);
        }
      }
    },
    [initialChoice.campaign.id, loadCampaignData, supabase, setError],
  );

  const fogBrushBoundsForCell = useCallback(
    (cell: FogBrushPreview) =>
      fogBrushBounds(cell, fogBrushSize, activeGridColumns, activeGridRows),
    [activeGridColumns, activeGridRows, fogBrushSize],
  );

  const paintFog = useCallback(
    (clientX: number, clientY: number) => {
      const pointer = pointerRef.current;
      if (
        pointer?.mode !== "fog" ||
        !hasMasterAccess ||
        pointer.sceneId !== activeScene?.id
      ) {
        return;
      }
      if (
        !activeScene ||
        !fogStateTrackerRef.current.apply(activeScene.id, activeScene).fog_enabled
      ) {
        return;
      }
      const cell = pointToCell(clientX, clientY);
      if (!cell) return;
      const changed = paintFogCells(
        pointer.cells,
        pointer.lastCell,
        cell,
        pointer.reveal,
        fogBrushSize,
        activeGridColumns,
        activeGridRows,
      );
      pointer.lastCell = cell;
      if (!changed) return;
      const patch = fogStateTrackerRef.current.stage(pointer.sceneId, {
        fog_enabled: true,
        revealed_cells: [...pointer.cells],
      });
      pointer.patch = patch;
      setScenes((current) =>
        current.map((scene) =>
          scene.id === pointer.sceneId
            ? { ...scene, ...patch }
            : scene,
        ),
      );
    },
    [
      activeGridColumns,
      activeGridRows,
      activeScene,
      fogBrushSize,
      hasMasterAccess,
      pointToCell,
    ],
  );

  const fogBrushPreviewBounds = useMemo(
    () =>
      fogBrushPreview ? fogBrushBoundsForCell(fogBrushPreview) : null,
    [fogBrushBoundsForCell, fogBrushPreview],
  );

  const eraseDrawingsAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const pointer = pointerRef.current;
      if (pointer?.mode !== "erase") return;
      const alreadyErased = new Set(pointer.erasedIds);
      const touchedIds = drawingsRef.current
        .filter(
          (drawing) =>
            !alreadyErased.has(drawing.id) &&
            (hasMasterAccess || drawing.author_user_id === user.uid) &&
            drawingTouchesPoint(
              drawing,
              point,
              Math.max(10 / zoom, (drawing.style?.width ?? 4) / 2 + 5 / zoom),
            ),
        )
        .map((drawing) => drawing.id);
      if (touchedIds.length === 0) return;

      const nextErasedIds = [...pointer.erasedIds, ...touchedIds];
      pointerRef.current = { ...pointer, erasedIds: nextErasedIds };
      const touched = new Set(touchedIds);
      const remaining = drawingsRef.current.filter(
        (drawing) => !touched.has(drawing.id),
      );
      drawingsRef.current = remaining;
      setDrawings(remaining);
    },
    [hasMasterAccess, user.uid, zoom],
  );

  const firePing = useCallback(
    (x: number, y: number) => {
      const payload = {
        x,
        y,
        label: user.displayName ?? initialChoice.membership.character_name ?? "Player",
      };
      showPing({ ...payload, id: Date.now() });
      void channelRef.current?.send({
        type: "broadcast",
        event: "ping",
        payload,
      });
    },
    [initialChoice.membership.character_name, showPing, user.displayName],
  );

  const viewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeScene || event.button !== 2) return;
    if (pointerRef.current?.mode === "fog") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setIsPanning(true);
  };

  const viewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.mode !== "pan" || pointer.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - pointer.clientX;
    const deltaY = event.clientY - pointer.clientY;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    setViewport((current) => ({
      ...current,
      pan: {
        x: current.pan.x + deltaX,
        y: current.pan.y + deltaY,
      },
    }));
  };

  const viewportPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.mode !== "pan" || pointer.pointerId !== event.pointerId) {
      return;
    }
    pointerRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const canManipulateDrawing = (drawing: Drawing) =>
    hasMasterAccess || drawing.author_user_id === user.uid;

  const persistDrawingPatch = async (
    drawingId: string,
    patch: Partial<Pick<Drawing, "points" | "style">>,
  ) => {
    if (!activeScene) return;
    let query = supabase.from("drawings").update(patch).eq("id", drawingId);
    if (!hasMasterAccess) query = query.eq("author_user_id", user.uid);
    const result = await query;
    if (result.error) {
      setError(result.error.message);
      await loadSceneData(activeScene.id);
    }
  };

  const startDrawingHandleInteraction = (
    event: PointerEvent<SVGCircleElement>,
    drawing: Drawing,
    handle: "rotate" | "resize",
  ) => {
    if (event.button !== 0 || !canManipulateDrawing(drawing)) return;
    const center = drawingCenterOf(drawing.points);
    if (!center) return;
    event.stopPropagation();
    event.preventDefault();
    boardRef.current?.setPointerCapture(event.pointerId);
    pointerRef.current =
      handle === "rotate"
        ? {
            mode: "drawing-rotate",
            pointerId: event.pointerId,
            drawingId: drawing.id,
            centerX: center.x,
            centerY: center.y,
            rotated: false,
          }
        : {
            mode: "drawing-resize",
            pointerId: event.pointerId,
            drawingId: drawing.id,
            centerX: center.x,
            centerY: center.y,
            kind: drawing.kind,
            rotation: drawingRotation(drawing),
            resized: false,
          };
  };

  const updateTokenSelectionBox = (selection: TokenSelectionBox) => {
    if (!activeScene) return;
    setTokenSelectionBox(selection);
    const left = Math.min(selection.startX, selection.endX);
    const right = Math.max(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const bottom = Math.max(selection.startY, selection.endY);
    const cell = activeScene.grid_cell_px;
    const tokenIds = revealedTokens
      .filter((token) => {
        if (token.locked || !canControlToken(token)) return false;
        const tokenLeft = activeScene.grid_offset_x + token.x * cell;
        const tokenTop = activeScene.grid_offset_y + token.y * cell;
        const tokenRight = tokenLeft + token.size * cell;
        const tokenBottom = tokenTop + token.size * cell;
        return (
          tokenRight >= left &&
          tokenLeft <= right &&
          tokenBottom >= top &&
          tokenTop <= bottom
        );
      })
      .map((token) => token.id);
    setSelectedTokenIds((current) =>
      current.length === tokenIds.length &&
      current.every((tokenId, index) => tokenId === tokenIds[index])
        ? current
        : tokenIds,
    );
    setSelectedTokenId(tokenIds[0] ?? null);
  };

  const boardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeScene) return;
    if (event.button !== 0) return;
    setDrawToolMenuOpen(false);
    setEraserMenuOpen(false);
    setFogBrushMenuTool(null);
    const target = event.target;
    if (
      tool === "select" &&
      target instanceof Element &&
      target !== event.currentTarget &&
      target.closest(BOARD_INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;

    if (tool === "select") {
      const hitDrawing = [...drawings]
        .reverse()
        .find(
          (drawing) =>
            canManipulateDrawing(drawing) &&
            drawingTouchesPoint(drawing, point, DRAWING_SELECT_TOLERANCE_PX),
        );
      if (hitDrawing) {
        setSelectedSceneAssetId(null);
        setSelectedTokenId(null);
        setSelectedTokenIds([]);
        setSelectedDrawingId(hitDrawing.id);
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = {
          mode: "drawing-move",
          pointerId: event.pointerId,
          drawingId: hitDrawing.id,
          startX: point.x,
          startY: point.y,
          originalPoints: hitDrawing.points.map((item) => ({ ...item })),
          kind: hitDrawing.kind,
          moved: false,
        };
        return;
      }
      setSelectedSceneAssetId(null);
      setSelectedDrawingId(null);
      setSelectedTokenId(null);
      setSelectedTokenIds([]);
      setTokenSelectionBox(null);
      if (pingHoldTimerRef.current !== null) {
        window.clearTimeout(pingHoldTimerRef.current);
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = {
        mode: "ping",
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
        fired: false,
      };
      pingHoldTimerRef.current = window.setTimeout(() => {
        const pendingPing = pointerRef.current;
        if (
          pendingPing?.mode !== "ping" ||
          pendingPing.pointerId !== event.pointerId
        ) {
          return;
        }
        pointerRef.current = { ...pendingPing, fired: true };
        pingHoldTimerRef.current = null;
        firePing(pendingPing.x, pendingPing.y);
      }, PING_HOLD_MS);
      return;
    }

    if (tool === "draw") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const startPoint =
        drawMode === "rectangle" ? snapPointToGrid(activeScene, point) : point;
      pointerRef.current = {
        mode: "draw",
        pointerId: event.pointerId,
        kind: drawMode,
        points: [startPoint],
      };
      setDrawDraft([startPoint]);
      return;
    }

    if (tool === "erase") {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = {
        mode: "erase",
        pointerId: event.pointerId,
        erasedIds: [],
      };
      eraseDrawingsAtPoint(point);
      return;
    }

    if (tool === "measure") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const nextMeasure = {
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      };
      pointerRef.current = {
        mode: "measure",
        pointerId: event.pointerId,
        ...nextMeasure,
      };
      setMeasurePreview(nextMeasure);
      return;
    }

    if (hasMasterAccess && (tool === "reveal" || tool === "hide")) {
      const cells = createFogStrokeCells(
        fogStateTrackerRef.current.apply(activeScene.id, activeScene),
      );
      if (!cells) {
        setFogBrushMenuTool(tool);
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const reveal = tool === "reveal";
      const hoverCell = pointToCell(event.clientX, event.clientY);
      if (hoverCell) setFogBrushPreview(hoverCell);
      pointerRef.current = {
        mode: "fog",
        pointerId: event.pointerId,
        sceneId: activeScene.id,
        reveal,
        cells,
        lastCell: null,
        patch: null,
      };
      paintFog(event.clientX, event.clientY);
      return;
    }
  };

  const boardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === "reveal" || tool === "hide") {
      const hoverCell = pointToCell(event.clientX, event.clientY);
      if (hoverCell) {
        setFogBrushPreview((current) =>
          current?.x === hoverCell.x && current.y === hoverCell.y
            ? current
            : hoverCell,
        );
      }
    } else if (fogBrushPreview) {
      setFogBrushPreview(null);
    }
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (pointer.mode === "ping") {
      if (
        !pointer.fired &&
        Math.hypot(
          event.clientX - pointer.clientX,
          event.clientY - pointer.clientY,
        ) > PING_HOLD_MOVE_TOLERANCE_PX
      ) {
        if (pingHoldTimerRef.current !== null) {
          window.clearTimeout(pingHoldTimerRef.current);
          pingHoldTimerRef.current = null;
        }
        const point = boardPoint(event.clientX, event.clientY);
        if (!point) return;
        const selection = {
          startX: pointer.x,
          startY: pointer.y,
          endX: point.x,
          endY: point.y,
        };
        pointerRef.current = {
          mode: "token-select",
          pointerId: pointer.pointerId,
          ...selection,
        };
        updateTokenSelectionBox(selection);
      }
      return;
    }
    if (pointer.mode === "token-select") {
      const point = boardPoint(event.clientX, event.clientY);
      if (!point) return;
      const selection = {
        startX: pointer.startX,
        startY: pointer.startY,
        endX: point.x,
        endY: point.y,
      };
      pointerRef.current = { ...pointer, endX: point.x, endY: point.y };
      updateTokenSelectionBox(selection);
      return;
    }
    if (pointer.mode === "draw") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point && activeScene) {
        const constrained = constrainedShapePoint(
          pointer.points[0],
          point,
          pointer.kind,
        );
        const nextPoint =
          pointer.kind === "rectangle"
            ? snapPointToGrid(activeScene, constrained)
            : constrained;
        const nextPoints =
          pointer.kind === "freehand"
            ? [...pointer.points, nextPoint]
            : [pointer.points[0], nextPoint];
        pointerRef.current = { ...pointer, points: nextPoints };
        setDrawDraft(nextPoints);
      }
      return;
    }
    if (pointer.mode === "drawing-move") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point && activeScene) {
        const rawDeltaX = point.x - pointer.startX;
        const rawDeltaY = point.y - pointer.startY;
        const anchor = pointer.originalPoints[0];
        const snappedAnchor =
          pointer.kind === "rectangle"
            ? snapPointToGrid(activeScene, {
                x: anchor.x + rawDeltaX,
                y: anchor.y + rawDeltaY,
              })
            : { x: anchor.x + rawDeltaX, y: anchor.y + rawDeltaY };
        const deltaX = snappedAnchor.x - anchor.x;
        const deltaY = snappedAnchor.y - anchor.y;
        if (!pointer.moved && deltaX === 0 && deltaY === 0) return;
        pointerRef.current = { ...pointer, moved: true };
        setDrawings((current) =>
          current.map((drawing) =>
            drawing.id === pointer.drawingId
              ? {
                  ...drawing,
                  points: pointer.originalPoints.map((item) => ({
                    x: item.x + deltaX,
                    y: item.y + deltaY,
                  })),
                }
              : drawing,
          ),
        );
      }
      return;
    }
    if (pointer.mode === "drawing-rotate") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point) {
        const degrees =
          (Math.atan2(point.y - pointer.centerY, point.x - pointer.centerX) *
            180) /
            Math.PI +
          90;
        const normalized = Math.round(((degrees % 360) + 360) % 360);
        pointerRef.current = { ...pointer, rotated: true };
        setDrawings((current) =>
          current.map((drawing) =>
            drawing.id === pointer.drawingId
              ? {
                  ...drawing,
                  style: { ...drawing.style, rotation: normalized },
                }
              : drawing,
          ),
        );
      }
      return;
    }
    if (pointer.mode === "drawing-resize") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point && activeScene) {
        const center = { x: pointer.centerX, y: pointer.centerY };
        let halfWidth: number;
        let halfHeight: number;
        if (pointer.kind === "ellipse") {
          const radius = Math.max(
            DRAWING_MIN_HALF_SIZE_PX,
            Math.hypot(point.x - center.x, point.y - center.y),
          );
          halfWidth = radius;
          halfHeight = radius;
        } else {
          const local = rotatePointAround(point, center, -pointer.rotation);
          const snapped =
            pointer.kind === "rectangle" && pointer.rotation === 0
              ? snapPointToGrid(activeScene, local)
              : local;
          halfWidth = Math.max(
            DRAWING_MIN_HALF_SIZE_PX,
            Math.abs(snapped.x - center.x),
          );
          halfHeight = Math.max(
            DRAWING_MIN_HALF_SIZE_PX,
            Math.abs(snapped.y - center.y),
          );
        }
        pointerRef.current = { ...pointer, resized: true };
        setDrawings((current) =>
          current.map((drawing) =>
            drawing.id === pointer.drawingId
              ? {
                  ...drawing,
                  points: [
                    { x: center.x - halfWidth, y: center.y - halfHeight },
                    { x: center.x + halfWidth, y: center.y + halfHeight },
                  ],
                }
              : drawing,
          ),
        );
      }
      return;
    }
    if (pointer.mode === "measure") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point) {
        const nextMeasure = {
          startX: pointer.startX,
          startY: pointer.startY,
          endX: point.x,
          endY: point.y,
        };
        pointerRef.current = { ...pointer, ...nextMeasure };
        setMeasurePreview(nextMeasure);
      }
      return;
    }
    if (pointer.mode === "erase") {
      const point = boardPoint(event.clientX, event.clientY);
      if (point) eraseDrawingsAtPoint(point);
      return;
    }
    if (pointer.mode === "fog") {
      paintFog(event.clientX, event.clientY);
    }
  };

  const boardPointerUp = async (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (pointer.mode === "fog" && event.type === "pointerup") {
      paintFog(event.clientX, event.clientY);
    }
    pointerRef.current = null;

    if (pointer.mode === "fog") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (pointer.patch) await persistFogState(pointer.sceneId, pointer.patch);
      return;
    }

    if (pointer.mode === "ping") {
      if (pingHoldTimerRef.current !== null) {
        window.clearTimeout(pingHoldTimerRef.current);
        pingHoldTimerRef.current = null;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (pointer.mode === "token-select") {
      setTokenSelectionBox(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (!activeScene) return;

    if (pointer.mode === "draw") {
      const draft = [...pointer.points];
      setDrawDraft([]);
      if (draft.length <= 1) return;
      const result = await supabase.from("drawings").insert({
        scene_id: activeScene.id,
        author_user_id: user.uid,
        kind: pointer.kind,
        points: draft,
        style: { color: rollerColor(user.uid), width: 4 },
        visibility: "players",
      });
      if (result.error) setError(result.error.message);
      else await loadSceneData(activeScene.id);
      return;
    }

    if (pointer.mode === "measure") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (pointer.mode === "drawing-move") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!pointer.moved) return;
      const moved = drawingsRef.current.find(
        (drawing) => drawing.id === pointer.drawingId,
      );
      if (moved) await persistDrawingPatch(moved.id, { points: moved.points });
      return;
    }

    if (
      pointer.mode === "drawing-rotate" ||
      pointer.mode === "drawing-resize"
    ) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const changed =
        pointer.mode === "drawing-rotate" ? pointer.rotated : pointer.resized;
      if (!changed) return;
      const current = drawingsRef.current.find(
        (drawing) => drawing.id === pointer.drawingId,
      );
      if (!current) return;
      await persistDrawingPatch(
        current.id,
        pointer.mode === "drawing-rotate"
          ? { style: current.style }
          : { points: current.points },
      );
      return;
    }

    if (pointer.mode === "erase") {
      const erasedIds = [...new Set(pointer.erasedIds)];
      if (erasedIds.length === 0) return;
      let query = supabase.from("drawings").delete().in("id", erasedIds);
      if (!hasMasterAccess) query = query.eq("author_user_id", user.uid);
      const result = await query;
      if (result.error) {
        setError(result.error.message);
        await loadSceneData(activeScene.id);
      } else {
        notify(
          erasedIds.length === 1
            ? "Disegno cancellato"
            : `${erasedIds.length} disegni cancellati`,
        );
      }
      return;
    }
  };

  const movementLine = useMemo(() => {
    if (!movePreview || !activeScene) return null;
    const cell = activeScene.grid_cell_px;
    const x1 = activeScene.grid_offset_x + movePreview.startX * cell + cell / 2;
    const y1 = activeScene.grid_offset_y + movePreview.startY * cell + cell / 2;
    const x2 = activeScene.grid_offset_x + movePreview.endX * cell + cell / 2;
    const y2 = activeScene.grid_offset_y + movePreview.endY * cell + cell / 2;
    const squares = gridSquaresBetween(
      movePreview.endX - movePreview.startX,
      movePreview.endY - movePreview.startY,
    );
    if (squares === 0) return null;
    return {
      x: x1,
      y: y1,
      width: Math.hypot(x2 - x1, y2 - y1),
      angle: Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI),
      label: `${
        movePreview.tokenCount > 1
          ? t("{p0} token · ", { p0: movePreview.tokenCount })
          : ""
      }${distanceLabelFor(activeScene, squares, uiLocale(language))}`,
    };
  }, [activeScene, movePreview, language]);

  const measurementLine = useMemo(() => {
    if (!measurePreview || !activeScene) return null;
    const deltaX = measurePreview.endX - measurePreview.startX;
    const deltaY = measurePreview.endY - measurePreview.startY;
    const width = Math.hypot(deltaX, deltaY);
    if (width < 2) return null;
    return {
      x: measurePreview.startX,
      y: measurePreview.startY,
      width,
      angle: Math.atan2(deltaY, deltaX) * (180 / Math.PI),
      label: distanceLabelFor(activeScene, width / activeScene.grid_cell_px, uiLocale(language)),
    };
  }, [activeScene, measurePreview, language]);

  const uploadAsset = async (
    file: File,
    kind: "map" | "token" | "prop",
  ) => {
    const size = await readImageSize(file);
    const folder = kind === "map" ? "maps" : kind === "token" ? "tokens" : "props";
    const storagePath = `${campaign.id}/${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const upload = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (upload.error) throw upload.error;

    const insert = await supabase
      .from("assets")
      .insert({
        campaign_id: campaign.id,
        kind,
        name: file.name.replace(/\.[^.]+$/, ""),
        storage_path: storagePath,
        mime_type: file.type,
        width: size.width || null,
        height: size.height || null,
        created_by_uid: user.uid,
      })
      .select("*")
      .single();
    if (insert.error) {
      await supabase.storage.from(ASSET_BUCKET).remove([storagePath]);
      throw insert.error;
    }
    return insert.data as Asset;
  };

  const uploadCampaignSceneAsset = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !hasMasterAccess) return;
    if (!SCENE_ASSET_MIME_TYPES.has(file.type)) {
      setError("Gli asset della mappa devono essere immagini PNG o JPEG.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("L’immagine supera il limite di 15 MB.");
      return;
    }

    setUploadingSceneAsset(true);
    setError("");
    try {
      await uploadAsset(file, "prop");
      assetUrlsRef.current = {};
      await loadCampaignData();
      notify("Asset aggiunto alla campagna");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Caricamento dell’asset non riuscito.",
      );
    } finally {
      setUploadingSceneAsset(false);
    }
  };

  const deleteCampaignSceneAsset = async (asset: Asset) => {
    if (
      !hasMasterAccess ||
      deletingCampaignAssetId ||
      asset.kind !== "prop" ||
      asset.campaign_id !== campaign.id
    ) {
      return;
    }
    const confirmed = window.confirm(
      t("Eliminare definitivamente “{p0}” dalla libreria? Verranno rimosse anche tutte le sue copie da tutte le scene della campagna.", { p0: asset.name }),
    );
    if (!confirmed) return;

    setDeletingCampaignAssetId(asset.id);
    setError("");
    let assetDeleted = false;
    try {
      // Remove the record first: a denied delete must leave the image intact.
      // Scene placements are removed by the existing database cascade.
      const result = await supabase
        .from("assets")
        .delete()
        .eq("id", asset.id)
        .eq("campaign_id", campaign.id)
        .eq("kind", "prop")
        .select("id, storage_path")
        .single();
      if (result.error) throw result.error;
      assetDeleted = true;

      delete assetUrlsRef.current[asset.id];
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      const removedPlacementIds = new Set(
        sceneAssetsRef.current
          .filter((placement) => placement.asset_id === asset.id)
          .map((placement) => placement.id),
      );
      setSelectedSceneAssetId((current) =>
        current && removedPlacementIds.has(current) ? null : current,
      );
      setSceneAssets((current) =>
        current.filter((placement) => placement.asset_id !== asset.id),
      );

      const storageDelete = await supabase.storage
        .from(ASSET_BUCKET)
        .remove([result.data.storage_path]);
      if (storageDelete.error) throw storageDelete.error;
      notify("Asset eliminato dalla campagna");
    } catch (reason) {
      setError(
        assetDeleted
          ? "Asset eliminato dalla campagna, ma non è stato possibile rimuovere il file caricato."
          : reason instanceof Error
            ? reason.message
            : "Eliminazione dell’asset non riuscita. Riprova.",
      );
    } finally {
      setDeletingCampaignAssetId(null);
    }
  };

  const uploadMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeScene || !isMaster) return;
    setUploading(true);
    try {
      const asset = await uploadAsset(file, "map");
      const fittedRows = gridRowsForMap(activeScene.grid_columns, asset);
      const update = await supabase
        .from("scenes")
        .update({
          map_asset_id: asset.id,
          ...(fittedRows ? { grid_rows: fittedRows } : {}),
        })
        .eq("id", activeScene.id);
      if (update.error) throw update.error;
      assetUrlsRef.current = {};
      await loadCampaignData();
      notify("Mappa caricata");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload non riuscito.");
    } finally {
      setUploading(false);
    }
  };

  const closeCharacterEditor = () => {
    setCharacterCreatorOpen(false);
    setEditingCharacterId(null);
    setCharacterName("");
    setCharacterFile(null);
    setCharacterStatsDraft(emptyCharacterStatsDraft());
    setCharacterStatsExpanded(false);
    if (characterInputRef.current) characterInputRef.current.value = "";
  };

  const openCharacterCreator = () => {
    setCharacterLibraryKind("player");
    setEditingCharacterId(null);
    setCharacterName("");
    setCharacterFile(null);
    setCharacterStatsDraft(emptyCharacterStatsDraft());
    setCharacterStatsExpanded(false);
    setCharacterCreatorOpen(true);
  };

  const openNpcCreator = () => {
    if (!hasMasterAccess) return;
    setCharacterLibraryKind("npc");
    setEditingCharacterId(null);
    setCharacterName("");
    setCharacterFile(null);
    setCharacterStatsDraft(emptyCharacterStatsDraft());
    setCharacterStatsExpanded(false);
    setCharacterCreatorOpen(true);
  };

  const openCharacterEditor = (character: Character) => {
    setCharacterLibraryKind(character.kind);
    setEditingCharacterId(character.id);
    setCharacterName(character.name);
    setCharacterFile(null);
    setCharacterStatsDraft(characterStatsDraftFor(character));
    setCharacterStatsExpanded(false);
    setCharacterCreatorOpen(true);
  };

  const characterNameAlreadyExists = (name: string, exceptId?: string) =>
    (characterLibraryKind === "npc" ? campaignNpcs : characters).some(
      (character) =>
        character.id !== exceptId &&
        character.name.trim().toLocaleLowerCase("it") ===
          name.toLocaleLowerCase("it"),
    );

  const toggleCharacterMacros = (character: Character) => {
    const closing = openMacroCharacterIds.includes(character.id);
    setOpenMacroCharacterIds((current) =>
      closing
        ? current.filter((characterId) => characterId !== character.id)
        : [...current, character.id],
    );
    if (closing) {
      setCollapsedMacroCharacterIds((current) =>
        current.filter((characterId) => characterId !== character.id),
      );
    }
    setMacroMenu(null);
    setCategoryMenu(null);
  };

  const toggleMacroColumn = (characterId: string) => {
    setCollapsedMacroCharacterIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
    setMacroMenu(null);
    setCategoryMenu(null);
  };

  const toggleCategoryCollapsed = (categoryId: string) => {
    setExpandedMacroCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    );
    setMacroMenu(null);
    setCategoryMenu(null);
  };

  const closeCategoryEditor = () => setCategoryEditor(null);

  const openCategoryCreator = (
    characterId: string,
    source: MacroMenuSource,
  ) => {
    setMacroMenu(null);
    setCategoryMenu(null);
    setCategoryEditor({ characterId, categoryId: null, source, name: "" });
  };

  const openCategoryRename = (
    category: CharacterMacroCategory,
    source: MacroMenuSource,
  ) => {
    setMacroMenu(null);
    setCategoryMenu(null);
    setCategoryEditor({
      characterId: category.character_id,
      categoryId: category.id,
      source,
      name: category.name,
    });
  };

  const saveCategoryEditor = async () => {
    if (!categoryEditor || savingCategory) return;
    const name = categoryEditor.name.trim();
    if (!name) {
      setError("Il nome della sezione è obbligatorio.");
      return;
    }
    const duplicate = macroCategories.some(
      (category) =>
        category.character_id === categoryEditor.characterId &&
        category.id !== categoryEditor.categoryId &&
        category.name.trim().toLocaleLowerCase("it") ===
          name.toLocaleLowerCase("it"),
    );
    if (duplicate) {
      setError("Questo personaggio ha già una sezione con lo stesso nome.");
      return;
    }

    setSavingCategory(true);
    setError("");
    try {
      if (categoryEditor.categoryId) {
        const result = await supabase
          .from("character_macro_categories")
          .update({ name })
          .eq("id", categoryEditor.categoryId);
        if (result.error) throw result.error;
      } else {
        const result = await supabase
          .from("character_macro_categories")
          .insert({
            character_id: categoryEditor.characterId,
            name,
            sort_order:
              (categoriesByCharacter.get(categoryEditor.characterId) ?? [])
                .map((category) => category.sort_order)
                .reduce((max, order) => Math.max(max, order), -1) + 1,
          })
          .select("id")
          .single();
        if (result.error) throw result.error;
        const createdId = (result.data as { id?: string } | null)?.id;
        if (createdId) {
          setExpandedMacroCategoryIds((current) =>
            current.includes(createdId) ? current : [...current, createdId],
          );
        }
      }

      await loadMacroCategories();
      setCategoryEditor(null);
      notify(categoryEditor.categoryId ? "Sezione rinominata" : "Sezione creata");
    } catch (reason) {
      const message =
        reason &&
        typeof reason === "object" &&
        "code" in reason &&
        reason.code === "23505"
          ? "Questo personaggio ha già una sezione con lo stesso nome."
          : reason instanceof Error
            ? reason.message
            : "Salvataggio della sezione non riuscito.";
      setError(message);
    } finally {
      setSavingCategory(false);
    }
  };

  const moveCategory = async (
    category: CharacterMacroCategory,
    direction: -1 | 1,
  ) => {
    const siblings = categoriesByCharacter.get(category.character_id) ?? [];
    const index = siblings.findIndex((item) => item.id === category.id);
    if (index < 0 || !siblings[index + direction]) return;
    const reordered = [...siblings];
    reordered[index] = reordered[index + direction];
    reordered[index + direction] = category;
    const positions = new Map(
      reordered.map((item, position) => [item.id, position]),
    );
    setMacroCategories((current) =>
      current.map((item) =>
        positions.has(item.id)
          ? { ...item, sort_order: positions.get(item.id) ?? item.sort_order }
          : item,
      ),
    );
    try {
      const updates = reordered
        .map((item, position) => ({ item, position }))
        .filter(({ item, position }) => item.sort_order !== position);
      const results = await Promise.all(
        updates.map(({ item, position }) =>
          supabase
            .from("character_macro_categories")
            .update({ sort_order: position })
            .eq("id", item.id),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    } catch (reason) {
      await loadMacroCategories().catch(() => undefined);
      setError(
        reason instanceof Error
          ? reason.message
          : "Riordino della sezione non riuscito.",
      );
    }
  };

  const deleteCategory = async (category: CharacterMacroCategory) => {
    if (
      !window.confirm(
        t("Eliminare la sezione “{p0}”? Le macro al suo interno torneranno senza sezione.", { p0: category.name }),
      )
    )
      return;
    setCategoryMenu(null);
    setError("");
    try {
      const result = await supabase
        .from("character_macro_categories")
        .delete()
        .eq("id", category.id);
      if (result.error) throw result.error;
      setMacroCategories((current) =>
        current.filter((item) => item.id !== category.id),
      );
      setCharacterMacros((current) =>
        current.map((macro) =>
          macro.category_id === category.id
            ? { ...macro, category_id: null }
            : macro,
        ),
      );
      setExpandedMacroCategoryIds((current) =>
        current.filter((id) => id !== category.id),
      );
      if (categoryEditor?.categoryId === category.id) setCategoryEditor(null);
      if (macroCategoryId === category.id) setMacroCategoryId(null);
      notify("Sezione eliminata, macro conservate");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Eliminazione della sezione non riuscita.",
      );
    }
  };

  const setMacroCategoryAssignment = async (
    macro: CharacterMacro,
    categoryId: string | null,
  ) => {
    if ((macro.category_id ?? null) === categoryId) return;
    setMacroMenu(null);
    setCategoryMenu(null);
    setCharacterMacros((current) =>
      current.map((item) =>
        item.id === macro.id ? { ...item, category_id: categoryId } : item,
      ),
    );
    try {
      const result = await supabase
        .from("character_macros")
        .update({ category_id: categoryId })
        .eq("id", macro.id);
      if (result.error) throw result.error;
      const target = categoryId
        ? macroCategories.find((category) => category.id === categoryId)
        : null;
      notify(
        target
          ? `Macro spostata in “${target.name}”`
          : "Macro senza sezione",
      );
    } catch (reason) {
      await loadCharacterMacros().catch(() => undefined);
      setError(
        reason instanceof Error
          ? reason.message
          : "Spostamento della macro non riuscito.",
      );
    }
  };

  const reorderCharacterMacro = async (
    draggedMacroId: string,
    targetMacroId: string,
    placement: "before" | "after",
  ) => {
    if (savingMacroOrder || draggedMacroId === targetMacroId) return;
    const draggedMacro = characterMacros.find(
      (macro) => macro.id === draggedMacroId,
    );
    const targetMacro = characterMacros.find(
      (macro) => macro.id === targetMacroId,
    );
    if (
      !draggedMacro ||
      !targetMacro ||
      draggedMacro.character_id !== targetMacro.character_id
    ) {
      return;
    }

    const characterMacroList =
      macrosByCharacter.get(draggedMacro.character_id) ?? [];
    const sourceCategoryId = draggedMacro.category_id ?? null;
    const targetCategoryId = targetMacro.category_id ?? null;
    const targetSiblings = characterMacroList.filter(
      (macro) =>
        macro.id !== draggedMacro.id &&
        (macro.category_id ?? null) === targetCategoryId,
    );
    const targetIndex = targetSiblings.findIndex(
      (macro) => macro.id === targetMacro.id,
    );
    if (targetIndex < 0) return;

    const insertionIndex =
      targetIndex + (placement === "after" ? 1 : 0);
    const reorderedTarget = [...targetSiblings];
    reorderedTarget.splice(insertionIndex, 0, {
      ...draggedMacro,
      category_id: targetCategoryId,
    });
    const nextValues = new Map<
      string,
      Pick<CharacterMacro, "category_id" | "sort_order">
    >();

    if (sourceCategoryId !== targetCategoryId) {
      characterMacroList
        .filter(
          (macro) =>
            macro.id !== draggedMacro.id &&
            (macro.category_id ?? null) === sourceCategoryId,
        )
        .forEach((macro, sortOrder) => {
          nextValues.set(macro.id, {
            category_id: sourceCategoryId,
            sort_order: sortOrder,
          });
        });
    }
    reorderedTarget.forEach((macro, sortOrder) => {
      nextValues.set(macro.id, {
        category_id: targetCategoryId,
        sort_order: sortOrder,
      });
    });

    setCharacterMacros((current) =>
      current.map((macro) => {
        const next = nextValues.get(macro.id);
        return next ? { ...macro, ...next } : macro;
      }),
    );
    setSavingMacroOrder(true);
    setError("");
    try {
      const result = await supabase.rpc("reorder_character_macro", {
        p_dragged_macro_id: draggedMacro.id,
        p_target_macro_id: targetMacro.id,
        p_place_after: placement === "after",
      });
      if (result.error) throw result.error;
    } catch (reason) {
      await loadCharacterMacros().catch(() => undefined);
      setError(
        reason instanceof Error
          ? reason.message
          : "Riordino della macro non riuscito.",
      );
    } finally {
      setSavingMacroOrder(false);
    }
  };

  const beginMacroDrag = (
    event: DragEvent<HTMLElement>,
    macro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    if (
      savingMacroOrder ||
      (event.target as HTMLElement).closest(".macro-action-menu")
    ) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(MACRO_DRAG_MIME, macro.id);
    event.dataTransfer.setData("text/plain", macro.name);
    setMacroDrag({ macroId: macro.id, source });
    setMacroDropTarget(null);
    setMacroMenu(null);
    setCategoryMenu(null);
  };

  const moveMacroOverTarget = (
    event: DragEvent<HTMLElement>,
    targetMacro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    const draggedMacroId =
      macroDrag?.macroId || event.dataTransfer.getData(MACRO_DRAG_MIME);
    const draggedMacro = characterMacros.find(
      (macro) => macro.id === draggedMacroId,
    );
    if (
      !draggedMacro ||
      draggedMacro.id === targetMacro.id ||
      draggedMacro.character_id !== targetMacro.character_id
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setMacroDropTarget((current) =>
      current?.macroId === targetMacro.id &&
      current.source === source &&
      current.placement === placement
        ? current
        : { macroId: targetMacro.id, source, placement },
    );
  };

  const leaveMacroDropTarget = (
    event: DragEvent<HTMLElement>,
    targetMacro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setMacroDropTarget((current) =>
      current?.macroId === targetMacro.id && current.source === source
        ? null
        : current,
    );
  };

  const dropMacroOnTarget = (
    event: DragEvent<HTMLElement>,
    targetMacro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    const draggedMacroId =
      macroDrag?.macroId || event.dataTransfer.getData(MACRO_DRAG_MIME);
    if (!draggedMacroId || draggedMacroId === targetMacro.id) return;
    event.preventDefault();
    event.stopPropagation();
    const placement =
      macroDropTarget?.macroId === targetMacro.id &&
      macroDropTarget.source === source
        ? macroDropTarget.placement
        : "before";
    setMacroDrag(null);
    setMacroDropTarget(null);
    void reorderCharacterMacro(draggedMacroId, targetMacro.id, placement);
  };

  const finishMacroDrag = () => {
    setMacroDrag(null);
    setMacroDropTarget(null);
  };

  const closeMacroEditor = () => {
    setMacroEditorOpen(false);
    setMacroEditorCharacterId(null);
    setEditingMacroId(null);
    setMacroName("");
    setMacroDescription("");
    setMacroIsDamage(false);
    setMacroCategoryId(null);
    setMacroDiceSides([20]);
    setMacroDiceCounts([1]);
    setMacroDiceDamageTypes([""]);
    setMacroBonuses([]);
    setMacroBonusDamageTypes([]);
  };

  const openMacroCreator = (character: Character, openDock = true) => {
    if (openDock) {
      setOpenMacroCharacterIds((current) =>
        current.includes(character.id) ? current : [...current, character.id],
      );
      setCollapsedMacroCharacterIds((current) =>
        current.filter((characterId) => characterId !== character.id),
      );
    }
    setMacroEditorCharacterId(character.id);
    setEditingMacroId(null);
    setMacroName("");
    setMacroDescription("");
    setMacroIsDamage(false);
    setMacroCategoryId(null);
    setMacroDiceSides([20]);
    setMacroDiceCounts([1]);
    setMacroDiceDamageTypes([""]);
    setMacroBonuses([]);
    setMacroBonusDamageTypes([]);
    setMacroMenu(null);
    setCategoryMenu(null);
    setMacroEditorOpen(true);
  };

  const openMacroEditor = (macro: CharacterMacro) => {
    setMacroEditorCharacterId(macro.character_id);
    setEditingMacroId(macro.id);
    setMacroName(macro.name);
    setMacroDescription(macro.description);
    setMacroIsDamage(macro.is_damage_macro);
    setMacroCategoryId(macro.category_id);
    setMacroDiceSides([...macro.dice_sides]);
    setMacroDiceCounts(macro.dice_sides.map(() => 1));
    setMacroDiceDamageTypes([...macro.dice_damage_types]);
    setMacroBonuses([...macro.bonuses]);
    setMacroBonusDamageTypes([...macro.bonus_damage_types]);
    setMacroMenu(null);
    setCategoryMenu(null);
    setMacroEditorOpen(true);
  };

  const closeTemporaryBonusEditor = () => {
    setTemporaryBonusMacroId(null);
    setTemporaryDiceSides([]);
    setTemporaryDiceDamageTypes([]);
    setTemporaryBonuses([]);
    setTemporaryBonusDamageTypes([]);
    setMacroMenu(null);
  };

  const openTemporaryBonusEditor = (macro: CharacterMacro) => {
    setTemporaryBonusMacroId(macro.id);
    setTemporaryDiceSides([...macro.temporary_dice_sides]);
    setTemporaryDiceDamageTypes([...macro.temporary_dice_damage_types]);
    setTemporaryBonuses([...macro.temporary_bonuses]);
    setTemporaryBonusDamageTypes([...macro.temporary_bonus_damage_types]);
    setMacroMenu(null);
  };

  const persistTemporaryBonus = async (
    macro: CharacterMacro,
    diceSides: number[],
    diceDamageTypes: DamageTypeValue[],
    bonuses: number[],
    bonusDamageTypes: DamageTypeValue[],
    removing = false,
  ) => {
    setSavingTemporaryBonus(true);
    setError("");
    try {
      const result = await supabase
        .from("character_macros")
        .update({
          temporary_dice_sides: diceSides,
          temporary_dice_damage_types: diceDamageTypes,
          temporary_bonuses: bonuses,
          temporary_bonus_damage_types: bonusDamageTypes,
        })
        .eq("id", macro.id);
      if (result.error) throw result.error;

      await loadCharacterMacros();
      closeTemporaryBonusEditor();
      notify(removing ? "Bonus temporaneo rimosso" : "Bonus temporaneo salvato");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Salvataggio del bonus temporaneo non riuscito.",
      );
    } finally {
      setSavingTemporaryBonus(false);
    }
  };

  const saveTemporaryBonus = async () => {
    if (!temporaryBonusMacro) return;
    const diceSides = temporaryDiceSides.map((sides) => Math.trunc(sides));
    const bonuses = temporaryBonuses.map((bonus) => Math.trunc(bonus));
    const diceDamageTypes = normalizeDamageTypes(
      temporaryDiceDamageTypes,
      diceSides.length,
    );
    const bonusDamageTypes = normalizeDamageTypes(
      temporaryBonusDamageTypes,
      bonuses.length,
    );

    if (diceSides.length === 0 && bonuses.length === 0) {
      setError("Aggiungi almeno un dado o un bonus fisso.");
      return;
    }
    if (
      diceSides.length > 50 ||
      diceSides.some((sides) => sides < 2 || sides > 10000)
    ) {
      setError("Uno dei dadi temporanei non ha un numero di facce valido.");
      return;
    }
    if (
      bonuses.length > 50 ||
      bonuses.some((bonus) => Math.abs(bonus) > 1000000)
    ) {
      setError("Uno dei bonus temporanei è fuori dall’intervallo consentito.");
      return;
    }

    await persistTemporaryBonus(
      temporaryBonusMacro,
      diceSides,
      diceDamageTypes,
      bonuses,
      bonusDamageTypes,
    );
  };

  const removeTemporaryBonus = async () => {
    if (!temporaryBonusMacro) return;
    await persistTemporaryBonus(temporaryBonusMacro, [], [], [], [], true);
  };

  const saveMacro = async () => {
    const editingMacro = characterMacros.find(
      (macro) => macro.id === editingMacroId,
    );
    const characterId =
      editingMacro?.character_id ?? macroEditorCharacter?.id;
    const name = macroName.trim();
    const description = macroDescription.trim();
    const rowSides = macroDiceSides.map((sides) => Math.trunc(sides));
    const rowCounts = macroDiceCounts.map((count) => clampDiceCount(count));
    const rowDamageTypes = normalizeDamageTypes(
      macroDiceDamageTypes,
      rowSides.length,
    );
    const diceSides: number[] = [];
    const diceDamageTypes: DamageTypeValue[] = [];
    rowSides.forEach((sides, index) => {
      for (let copy = 0; copy < (rowCounts[index] ?? 1); copy += 1) {
        diceSides.push(sides);
        diceDamageTypes.push(rowDamageTypes[index] ?? "");
      }
    });
    const bonuses = macroBonuses.map((bonus) => Math.trunc(bonus));
    const bonusDamageTypes = normalizeDamageTypes(
      macroBonusDamageTypes,
      bonuses.length,
    );

    if (!characterId || !name) {
      setError("Il nome della macro è obbligatorio.");
      return;
    }
    if (name.length > MACRO_NAME_MAX_LENGTH) {
      setError(
        `Il nome della macro può contenere al massimo ${MACRO_NAME_MAX_LENGTH} caratteri.`,
      );
      return;
    }
    if (description.length > 120) {
      setError("La descrizione può contenere al massimo 120 caratteri.");
      return;
    }
    if (
      diceSides.length === 0 ||
      diceSides.some((sides) => sides < 2 || sides > 10000)
    ) {
      setError("Aggiungi almeno un dado con un numero di facce valido.");
      return;
    }
    if (diceSides.length > 50) {
      setError("Una macro può contenere al massimo 50 dadi in totale.");
      return;
    }
    if (
      bonuses.length > 50 ||
      bonuses.some((bonus) => Math.abs(bonus) > 1000000)
    ) {
      setError("Uno dei bonus è fuori dall’intervallo consentito.");
      return;
    }
    const duplicate = characterMacros.some(
      (macro) =>
        macro.character_id === characterId &&
        macro.id !== editingMacroId &&
        macro.name.trim().toLocaleLowerCase("it") ===
          name.toLocaleLowerCase("it"),
    );
    if (duplicate) {
      setError("Questo personaggio ha già una macro con lo stesso nome.");
      return;
    }

    setSavingMacro(true);
    setError("");
    try {
      const patch = {
        name,
        description,
        is_damage_macro: macroIsDamage,
        category_id: macroCategoryId,
        dice_sides: diceSides,
        dice_damage_types: diceDamageTypes,
        bonuses,
        bonus_damage_types: bonusDamageTypes,
      };
      const result = editingMacro
        ? await supabase
            .from("character_macros")
            .update(patch)
            .eq("id", editingMacro.id)
        : await supabase.from("character_macros").insert({
            character_id: characterId,
            ...patch,
            sort_order: characterMacros.filter(
              (macro) => macro.character_id === characterId,
            ).length,
          });
      if (result.error) throw result.error;

      await loadCharacterMacros();
      closeMacroEditor();
      notify(editingMacro ? "Macro aggiornata" : "Macro creata");
    } catch (reason) {
      const message =
        reason &&
        typeof reason === "object" &&
        "code" in reason &&
        reason.code === "23505"
          ? "Questo personaggio ha già una macro con lo stesso nome."
          : reason instanceof Error
            ? reason.message
            : "Salvataggio della macro non riuscito.";
      setError(message);
    } finally {
      setSavingMacro(false);
    }
  };

  const deleteMacro = async (macro: CharacterMacro) => {
    if (!window.confirm(t("Eliminare la macro “{p0}”?", { p0: macro.name }))) return;
    setDeletingMacroId(macro.id);
    setMacroMenu(null);
    setError("");
    try {
      const result = await supabase
        .from("character_macros")
        .delete()
        .eq("id", macro.id);
      if (result.error) throw result.error;
      setCharacterMacros((current) =>
        current.filter((item) => item.id !== macro.id),
      );
      if (temporaryBonusMacroId === macro.id) closeTemporaryBonusEditor();
      if (macroRollResult?.macroId === macro.id) setMacroRollResult(null);
      notify("Macro eliminata");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Eliminazione della macro non riuscita.",
      );
    } finally {
      setDeletingMacroId(null);
    }
  };

  const recordDiceRoll = async (draft: DiceRollLogDraft) => {
    try {
      const rollerName =
        profileDisplayName.trim().slice(0, 80) || "Giocatore";
      const result = await supabase
        .from("dice_roll_log")
        .insert({
          campaign_id: campaign.id,
          scene_id: activeScene?.id ?? null,
          roller_user_id: user.uid,
          character_id: draft.characterId,
          roll_kind: draft.kind,
          actor_name: draft.actorName.trim().slice(0, 80) || "Personaggio",
          roller_name: rollerName,
          roll_name: draft.rollName,
          formula: draft.formula,
          breakdown: draft.breakdown,
          total: draft.total,
          details: draft.details,
        })
        .select("*")
        .single();
      if (result.error) throw result.error;

      const entry = result.data as unknown as DiceRollLogEntry;
      appendDiceRollLog(entry);
      void channelRef.current?.send({
        type: "broadcast",
        event: "dice_roll",
        payload: entry,
      });
    } catch (reason) {
      console.error(reason);
      setError(
        "Tiro effettuato, ma non sono riuscito ad aggiungerlo al registro.",
      );
    }
  };

  const chooseQuickDie = (value: unknown, closeMenu = true) => {
    const sides = normalizeDieSides(value, quickDieSides);
    setQuickDieSides(sides);
    setQuickDieInput(String(sides));
    if (closeMenu) setQuickDiePickerOpen(false);
    try {
      localStorage.setItem(QUICK_DIE_STORAGE_KEY, String(sides));
    } catch {
      // The die still works when browser storage is unavailable.
    }
  };

  const chooseQuickDieCount = (value: unknown) => {
    const count = normalizeQuickDiceCount(value);
    setQuickDieCount(count);
    try {
      localStorage.setItem(QUICK_DIE_COUNT_STORAGE_KEY, String(count));
    } catch {
      // The dice still work when browser storage is unavailable.
    }
  };

  const rollQuickDie = () => {
    const { baseRolls, total, comparison, formula, breakdown } = rollQuickDice(
      quickDieSides,
      quickDieCount,
      quickDieMode,
      rollDie,
    );
    if (macroRollTimerRef.current !== null) {
      window.clearTimeout(macroRollTimerRef.current);
    }
    const rollId = ++macroRollSequenceRef.current;
    setMacroRollResult({
      rollId,
      macroId: "quick-die",
      macroName: `${formula}${comparison ? ` · ${quickDieMode.toUpperCase()}` : ""}`,
      total,
      breakdown,
      rolling: true,
    });
    void recordDiceRoll({
      characterId: null,
      kind: "quick_die",
      actorName: profileDisplayName,
      rollName: `Dado rapido · ${formula}`,
      formula,
      breakdown,
      total,
      details: {
        ...(comparison ? { comparison } : {}),
        dice: baseRolls.map((die) => ({
          sides: die.sides,
          result: die.result,
          temporary: false,
          damage_type: "",
        })),
        bonuses: [],
      },
    });
    setQuickDiePickerOpen(false);
    setMacroMenu(null);
    macroRollTimerRef.current = window.setTimeout(() => {
      setMacroRollResult((current) =>
        current?.rollId === rollId ? { ...current, rolling: false } : current,
      );
      macroRollTimerRef.current = null;
    }, 1050);
  };

  const rollMacro = (macro: CharacterMacro, source: MacroMenuSource) => {
    const mode = macroRollModes[macro.id] ?? "normal";
    const { baseRolls, temporaryRolls, total, comparison } = rollMacroDice(
      macro,
      mode,
      rollDie,
    );
    const rolledExpression = (
      rolls: Array<{
        sides: number;
        result: number;
        damageType: DamageTypeValue;
      }>,
      bonuses: number[],
      bonusDamageTypes: DamageTypeValue[],
    ) =>
      [
        rolls
          .map(
            (roll) =>
              `d${roll.sides}: ${roll.result}${damageTypeSuffix(roll.damageType)}`,
          )
          .join(" + "),
        bonuses
          .map((bonus, index) => {
            const renderedBonus =
              bonus >= 0 ? `+ ${bonus}` : `− ${Math.abs(bonus)}`;
            const damageType = macro.is_damage_macro
              ? (bonusDamageTypes[index] ?? "")
              : "";
            return `${renderedBonus}${damageTypeSuffix(damageType)}`;
          })
          .join(" "),
      ]
        .filter(Boolean)
        .join(" ");
    const baseBreakdown = rolledExpression(
      baseRolls,
      macro.bonuses,
      macro.bonus_damage_types,
    );
    const temporaryBreakdown = rolledExpression(
      temporaryRolls,
      macro.temporary_bonuses,
      macro.temporary_bonus_damage_types,
    );
    const breakdown = [
      macroRollComparisonSummary(comparison),
      baseBreakdown,
      temporaryBreakdown ? `BT ${temporaryBreakdown}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const temporaryFormula = macroExpression(
      macro.temporary_dice_sides,
      macro.temporary_bonuses,
    );
    const formula = [
      macroExpression(macro.dice_sides, macro.bonuses),
      temporaryFormula ? `BT (${temporaryFormula})` : "",
    ]
      .filter(Boolean)
      .join(" + ");
    const macroCharacter = knownCharacters.find(
      (character) => character.id === macro.character_id,
    );
    const macroToken =
      source === "token" && selectedToken?.character_id === macro.character_id
        ? selectedToken
        : null;
    if (macroRollTimerRef.current !== null) {
      window.clearTimeout(macroRollTimerRef.current);
    }
    const rollId = ++macroRollSequenceRef.current;
    setMacroRollResult({
      rollId,
      macroId: macro.id,
      macroName: `${macro.name}${comparison ? ` · ${mode.toUpperCase()}` : ""}`,
      total,
      breakdown,
      rolling: true,
    });
    void recordDiceRoll({
      characterId: macro.character_id,
      kind: "macro",
      actorName: macroToken?.name ?? macroCharacter?.name ?? "Personaggio",
      rollName: macro.name,
      formula,
      breakdown,
      total,
      details: {
        ...(comparison ? { comparison } : {}),
        dice: [
          ...baseRolls.map((roll) => ({
            sides: roll.sides,
            result: roll.result,
            temporary: false,
            damage_type: roll.damageType,
          })),
          ...temporaryRolls.map((roll) => ({
            sides: roll.sides,
            result: roll.result,
            temporary: true,
            damage_type: roll.damageType,
          })),
        ],
        bonuses: [
          ...macro.bonuses.map((value, index) => ({
            value,
            temporary: false,
            damage_type: macro.is_damage_macro
              ? (macro.bonus_damage_types[index] ?? "")
              : "",
          })),
          ...macro.temporary_bonuses.map((value, index) => ({
            value,
            temporary: true,
            damage_type: macro.is_damage_macro
              ? (macro.temporary_bonus_damage_types[index] ?? "")
              : "",
          })),
        ],
      },
    });
    setMacroMenu(null);
    setQuickDiePickerOpen(false);
    macroRollTimerRef.current = window.setTimeout(() => {
      setMacroRollResult((current) =>
        current?.rollId === rollId ? { ...current, rolling: false } : current,
      );
      macroRollTimerRef.current = null;
    }, 1050);
  };

  const closeMacroRollResult = () => {
    macroRollSequenceRef.current += 1;
    if (macroRollTimerRef.current !== null) {
      window.clearTimeout(macroRollTimerRef.current);
      macroRollTimerRef.current = null;
    }
    setMacroRollResult(null);
  };

  const createCharacter = async () => {
    const name = characterName.trim();
    const isNpc = characterLibraryKind === "npc";
    const characterStats = characterStatsPayloadFor(characterStatsDraft);
    const characterStatsError = validateCharacterStats(characterStats);
    if (!name || !characterFile) {
      setError("Nome e token sono obbligatori.");
      return;
    }
    if (characterStatsError) {
      setError(characterStatsError);
      return;
    }
    if (characterNameAlreadyExists(name)) {
      setError(
        isNpc
          ? "Esiste già un NPC campagna con questo nome."
          : "Hai già un personaggio con questo nome.",
      );
      return;
    }

    setCreatingCharacter(true);
    setError("");
    const characterId = crypto.randomUUID();
    const storagePath = `characters/${characterId}/${safeFileName(characterFile.name)}`;
    let characterCreated = false;
    try {
      const size = await readImageSize(characterFile);
      const insert = await supabase
        .from("characters")
        .insert({
          id: characterId,
          owner_user_id: isNpc ? null : user.uid,
          campaign_id: isNpc ? campaign.id : null,
          kind: characterLibraryKind,
          name,
          token_storage_path: storagePath,
          token_mime_type: characterFile.type,
          token_width: size.width || null,
          token_height: size.height || null,
        })
        .select("*")
        .single();
      if (insert.error) throw insert.error;
      characterCreated = true;

      const statsInsert = await supabase.from("character_stats").insert({
        character_id: characterId,
        ...characterStats,
      });
      if (statsInsert.error) throw statsInsert.error;

      const upload = await supabase.storage
        .from(ASSET_BUCKET)
        .upload(storagePath, characterFile, {
          contentType: characterFile.type,
          upsert: false,
        });
      if (upload.error) throw upload.error;

      delete assetUrlsRef.current[characterId];
      await loadCampaignData();
      closeCharacterEditor();
      notify(isNpc ? "NPC creato" : "Personaggio creato");
    } catch (reason) {
      if (characterCreated) {
        await supabase.from("characters").delete().eq("id", characterId);
      }
      const message =
        reason &&
        typeof reason === "object" &&
        "code" in reason &&
        reason.code === "23505"
          ? isNpc
            ? "Esiste già un NPC campagna con questo nome."
            : "Hai già un personaggio con questo nome."
          : reason instanceof Error
            ? reason.message
            : isNpc
              ? "Creazione dell’NPC non riuscita."
              : "Creazione del personaggio non riuscita.";
      setError(message);
    } finally {
      setCreatingCharacter(false);
    }
  };

  const updateCharacter = async () => {
    if (!editingCharacter) return;
    const isNpc = editingCharacter.kind === "npc";
    const name = characterName.trim();
    const characterStats = characterStatsPayloadFor(characterStatsDraft);
    const characterStatsError = validateCharacterStats(characterStats);
    if (!name) {
      setError("Il nome è obbligatorio.");
      return;
    }
    if (characterStatsError) {
      setError(characterStatsError);
      return;
    }
    if (characterNameAlreadyExists(name, editingCharacter.id)) {
      setError(
        isNpc
          ? "Esiste già un NPC campagna con questo nome."
          : "Hai già un personaggio con questo nome.",
      );
      return;
    }

    setCreatingCharacter(true);
    setError("");
    try {
      let tokenDetails: Partial<Character> = {};
      if (characterFile) {
        const size = await readImageSize(characterFile);
        const upload = await supabase.storage
          .from(ASSET_BUCKET)
          .update(editingCharacter.token_storage_path, characterFile, {
            contentType: characterFile.type,
            upsert: true,
          });
        if (upload.error) throw upload.error;
        tokenDetails = {
          token_mime_type: characterFile.type,
          token_width: size.width || null,
          token_height: size.height || null,
        };
      }

      const update = await supabase
        .from("characters")
        .update({ name, ...tokenDetails })
        .eq("id", editingCharacter.id);
      if (update.error) throw update.error;

      const statsUpdate = await supabase.from("character_stats").upsert(
        {
          character_id: editingCharacter.id,
          ...characterStats,
        },
        { onConflict: "character_id" },
      );
      if (statsUpdate.error) throw statsUpdate.error;

      delete assetUrlsRef.current[editingCharacter.id];
      await loadCampaignData();
      if (activeScene) await loadSceneData(activeScene.id);
      closeCharacterEditor();
      notify(isNpc ? "NPC aggiornato" : "Personaggio aggiornato");
    } catch (reason) {
      const message =
        reason &&
        typeof reason === "object" &&
        "code" in reason &&
        reason.code === "23505"
          ? isNpc
            ? "Esiste già un NPC campagna con questo nome."
            : "Hai già un personaggio con questo nome."
          : reason instanceof Error
            ? reason.message
            : isNpc
              ? "Modifica dell’NPC non riuscita."
              : "Modifica del personaggio non riuscita.";
      setError(message);
    } finally {
      setCreatingCharacter(false);
    }
  };

  const deleteCharacter = async (character: Character) => {
    const isNpc = character.kind === "npc";
    const confirmed = window.confirm(
      t("Eliminare {p0}? I token già sulla mappa resteranno, ma non saranno più collegati {p1} e useranno le iniziali.", { p0: character.name, p1: isNpc ? t("all’NPC") : t("al personaggio") }),
    );
    if (!confirmed) return;

    setDeletingCharacterId(character.id);
    setError("");
    try {
      const storageDelete = await supabase.storage
        .from(ASSET_BUCKET)
        .remove([character.token_storage_path]);
      if (storageDelete.error) throw storageDelete.error;

      const characterDelete = await supabase
        .from("characters")
        .delete()
        .eq("id", character.id);
      if (characterDelete.error) throw characterDelete.error;

      delete assetUrlsRef.current[character.id];
      setCharacters((current) =>
        current.filter((item) => item.id !== character.id),
      );
      setCampaignNpcs((current) =>
        current.filter((item) => item.id !== character.id),
      );
      setCharacterMacros((current) =>
        current.filter((macro) => macro.character_id !== character.id),
      );
      setMacroCategories((current) =>
        current.filter((category) => category.character_id !== character.id),
      );
      setOpenMacroCharacterIds((current) =>
        current.filter((characterId) => characterId !== character.id),
      );
      setCollapsedMacroCharacterIds((current) =>
        current.filter((characterId) => characterId !== character.id),
      );
      if (macroEditorCharacterId === character.id) closeMacroEditor();
      if (categoryEditor?.characterId === character.id) setCategoryEditor(null);
      setMacroMenu(null);
      setCategoryMenu(null);
      if (editingCharacterId === character.id) closeCharacterEditor();
      if (activeScene) await loadSceneData(activeScene.id);
      notify(isNpc ? "NPC eliminato" : "Personaggio eliminato");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : isNpc
            ? "Eliminazione dell’NPC non riuscita."
            : "Eliminazione del personaggio non riuscita.",
      );
    } finally {
      setDeletingCharacterId(null);
    }
  };

  const dropToken = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!activeScene) return;
    const sceneAssetId = event.dataTransfer.getData(SCENE_ASSET_DRAG_MIME);
    if (sceneAssetId) {
      if (!hasMasterAccess) return;
      const asset = campaignSceneAssets.find(
        (candidate) => candidate.id === sceneAssetId,
      );
      const point = boardPoint(event.clientX, event.clientY);
      if (!asset || !point) return;
      const dimensions = defaultSceneAssetDimensions(
        asset,
        activeBoardWidth,
        activeBoardHeight,
      );
      const x = clampValue(
        point.x - dimensions.width / 2,
        0,
        Math.max(0, activeBoardWidth - dimensions.width),
      );
      const y = clampValue(
        point.y - dimensions.height / 2,
        0,
        Math.max(0, activeBoardHeight - dimensions.height),
      );
      const insert = await supabase
        .from("scene_assets")
        .insert({
          scene_id: activeScene.id,
          asset_id: asset.id,
          created_by_uid: user.uid,
          x,
          y,
          width: dimensions.width,
          height: dimensions.height,
          z_index:
            sceneAssets.reduce(
              (highest, placement) => Math.max(highest, placement.z_index),
              -1,
            ) + 1,
        })
        .select("*")
        .single();
      if (insert.error) {
        setError(insert.error.message);
        return;
      }
      const placement = normalizeSceneAssetPlacement(
        insert.data as Record<string, unknown>,
      );
      setSceneAssets((current) => [...current, placement]);
      setSelectedSceneAssetId(placement.id);
      setSelectedTokenId(null);
      setSelectedTokenIds([]);
      setSelectedDrawingId(null);
      notify("Asset posizionato nella scena");
      return;
    }
    const assetId = event.dataTransfer.getData("application/x-vers-asset");
    const characterId = event.dataTransfer.getData(
      "application/x-vers-character",
    );
    const asset = assets.find((item) => item.id === assetId);
    const character = knownCharacters.find((item) => item.id === characterId);
    const cell = pointToCell(event.clientX, event.clientY);
    if ((!asset && !character) || !cell) return;
    const sourceName = character?.name ?? asset?.name ?? "Token";
    const insert = await supabase
      .from("tokens")
      .insert({
        scene_id: activeScene.id,
        owner_user_id: character
          ? character.owner_user_id
          : isMaster
            ? null
            : user.uid,
        created_by_uid: user.uid,
        character_id: character?.id ?? null,
        image_asset_id: asset?.id ?? null,
        name: sourceName,
        initials: initialsFor(sourceName),
        color: palette[tokens.length % palette.length],
        x: cell.x,
        y: cell.y,
      })
      .select("*")
      .single();
    if (insert.error) {
      setError(insert.error.message);
      return;
    }
    await loadSceneData(activeScene.id);
    const insertedTokenId = insert.data.id as string;
    setSelectedTokenId(insertedTokenId);
    setInspectedTokenId(insertedTokenId);
    setSelectedTokenIds([insertedTokenId]);
    notify("Token aggiunto alla scena");
  };

  const addScene = async () => {
    if (!isMaster) return;
    let sceneNumber = scenes.length + 1;
    while (scenes.some((scene) => scene.name === t("Scena {p0}", { p0: sceneNumber }))) {
      sceneNumber += 1;
    }
    const name = t("Scena {p0}", { p0: sceneNumber });
    const insert = await supabase.from("scenes").insert({
      campaign_id: campaign.id,
      name,
      sort_order: scenes.length,
      fog_enabled: false,
    });
    if (insert.error) setError(insert.error.message);
    else await loadCampaignData();
  };

  const deleteScene = async () => {
    if (!activeScene || !isMaster || playerView) return;
    const scene = activeScene;
    const isLive = scene.id === campaign.player_scene_id;
    const confirmed = window.confirm(
      [
        t("Eliminare definitivamente “{p0}”?", { p0: scene.name }),
        t("Verranno eliminati anche token, disegni e iniziativa presenti nella scena."),
        isLive
          ? t("Questa è la scena live: i Player non vedranno alcuna scena finché non ne pubblicherai un’altra.")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    if (!confirmed) return;

    setDeletingSceneId(scene.id);
    setError("");
    try {
      const result = await supabase
        .from("scenes")
        .delete()
        .eq("id", scene.id)
        .eq("campaign_id", campaign.id);
      if (result.error) throw result.error;

      setSelectedTokenId(null);
      setSelectedTokenIds([]);
      setTokenSelectionBox(null);
      setInspectedTokenId(null);
      setTokens([]);
      setSceneAssets([]);
      setSelectedSceneAssetId(null);
      setSceneCharacters([]);
      setDrawings([]);
      setInitiative([]);
      setInitiativeState(null);
      await loadCampaignData();
      notify("Scena eliminata");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Eliminazione della scena non riuscita.",
      );
    } finally {
      setDeletingSceneId(null);
    }
  };

  const showSceneToPlayers = async () => {
    if (!activeScene || !isMaster) return;
    const result = await supabase
      .from("campaigns")
      .update({ player_scene_id: activeScene.id })
      .eq("id", campaign.id);
    if (result.error) setError(result.error.message);
    else {
      setCampaign((current) => ({
        ...current,
        player_scene_id: activeScene.id,
      }));
      notify("Scena mostrata ai giocatori");
    }
  };

  const updateScene = async (patch: Partial<Scene>) => {
    if (!activeScene || !isMaster) return;
    if (typeof patch.fog_enabled === "boolean") {
      const current = fogStateTrackerRef.current.apply(
        activeScene.id,
        activeScene,
      );
      const fogPatch = fogStateTrackerRef.current.stage(activeScene.id, {
        fog_enabled: patch.fog_enabled,
        revealed_cells: current.revealed_cells,
      });
      setScenes((scenes) =>
        scenes.map((scene) =>
          scene.id === activeScene.id ? { ...scene, ...fogPatch } : scene,
        ),
      );
      await persistFogState(activeScene.id, fogPatch);
      return;
    }
    setScenes((current) =>
      current.map((scene) =>
        scene.id === activeScene.id ? { ...scene, ...patch } : scene,
      ),
    );
    const result = await supabase
      .from("scenes")
      .update(patch)
      .eq("id", activeScene.id);
    if (result.error) setError(result.error.message);
  };

  const updateGridCellSize = (value: number) => {
    if (!activeScene || !isMaster) return;
    const sceneId = activeScene.id;
    const nextScale = Math.max(12, Math.min(240, Math.round(value)));
    setScenes((current) =>
      current.map((scene) =>
        scene.id === sceneId
          ? { ...scene, grid_cell_px: nextScale }
          : scene,
      ),
    );

    const previousTimer = sceneScaleSaveTimersRef.current.get(sceneId);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    pendingSceneScalesRef.current.set(sceneId, nextScale);
    const nextTimer = window.setTimeout(async () => {
      sceneScaleSaveTimersRef.current.delete(sceneId);
      pendingSceneScalesRef.current.delete(sceneId);
      const result = await supabase
        .from("scenes")
        .update({ grid_cell_px: nextScale })
        .eq("id", sceneId);
      if (result.error) setError(result.error.message);
    }, 350);
    sceneScaleSaveTimersRef.current.set(sceneId, nextTimer);
  };

  const updateToken = (patch: TokenDatabasePatch) => {
    if (!selectedToken || !canControlToken(selectedToken)) return;
    queueTokenUpdate(selectedToken.id, patch, true);
  };

  const deleteToken = async () => {
    if (!selectedToken || !canControlToken(selectedToken)) return;
    const tokenId = selectedToken.id;
    const result = await supabase
      .from("tokens")
      .delete()
      .eq("id", tokenId);
    if (result.error) setError(result.error.message);
    else {
      setSelectedTokenId((current) =>
        current === tokenId ? null : current,
      );
      setInspectedTokenId((current) =>
        current === tokenId ? null : current,
      );
      setSelectedTokenIds((current) =>
        current.filter((id) => id !== tokenId),
      );
      if (activeScene) await loadSceneData(activeScene.id);
    }
  };

  const deleteSelectedTokens = async () => {
    if (!activeScene || deletingTokenSelection) return;
    const tokenIds = selectedTokenIds.filter((tokenId) => {
      const token = tokens.find((candidate) => candidate.id === tokenId);
      return Boolean(
        token &&
          token.scene_id === activeScene.id &&
          canControlToken(token),
      );
    });
    if (tokenIds.length < 2) return;
    const confirmed = window.confirm(
      t("Eliminare definitivamente {p0} token dalla scena?", { p0: tokenIds.length }),
    );
    if (!confirmed) return;

    setDeletingTokenSelection(true);
    setError("");
    const result = await supabase
      .from("tokens")
      .delete()
      .eq("scene_id", activeScene.id)
      .in("id", tokenIds);
    setDeletingTokenSelection(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    for (const tokenId of tokenIds) {
      const timer = tokenSaveTimersRef.current.get(tokenId);
      if (timer !== undefined) window.clearTimeout(timer);
      tokenSaveTimersRef.current.delete(tokenId);
      pendingTokenPatchesRef.current.delete(tokenId);
      optimisticTokenPatchesRef.current.delete(tokenId);
      inFlightTokenPatchesRef.current.delete(tokenId);
    }
    setSelectedTokenId(null);
    setSelectedTokenIds([]);
    setTokenSelectionBox(null);
    setInspectedTokenId((current) =>
      current && tokenIds.includes(current) ? null : current,
    );
    setTokens((current) =>
      current.filter((token) => !tokenIds.includes(token.id)),
    );
    await loadSceneData(activeScene.id);
    notify(`${tokenIds.length} token eliminati dalla scena`);
  };

  const clearDrawings = async () => {
    if (!activeScene) return;
    const confirmed = window.confirm(
      isMaster
        ? t("Cancellare tutti i disegni presenti nella scena?")
        : t("Cancellare tutti i tuoi disegni presenti nella scena?"),
    );
    if (!confirmed) return;
    const query = supabase
      .from("drawings")
      .delete()
      .eq("scene_id", activeScene.id);
    const result = isMaster
      ? await query
      : await query.eq("author_user_id", user.uid);
    if (result.error) setError(result.error.message);
    else {
      await loadSceneData(activeScene.id);
      notify(
        isMaster
          ? "Disegni della scena cancellati"
          : "I tuoi disegni sono stati cancellati",
      );
    }
  };

  const chooseBoardTool = (nextTool: Tool) => {
    setTool(nextTool);
    setDrawToolMenuOpen(false);
    setEraserMenuOpen(false);
    setFogBrushMenuTool(
      (nextTool === "reveal" || nextTool === "hide") &&
        activeScene &&
        !activeScene.fog_enabled
        ? nextTool
        : null,
    );
    if (nextTool !== "measure") setMeasurePreview(null);
    if (nextTool !== "draw") setDrawDraft([]);
    if (nextTool !== "select") {
      setSelectedSceneAssetId(null);
      setSelectedDrawingId(null);
      setSelectedTokenIds([]);
      setTokenSelectionBox(null);
    }
    if (nextTool !== "reveal" && nextTool !== "hide") {
      setFogBrushPreview(null);
    }
  };

  const renderDrawingMark = (
    drawing: Pick<Drawing, "kind" | "points" | "style"> &
      Partial<Pick<Drawing, "author_user_id">>,
    key: string,
  ) => {
    const color = drawing.author_user_id
      ? rollerColor(drawing.author_user_id)
      : (drawing.style?.color ?? rollerColor(user.uid));
    const width = drawing.style?.width ?? 4;
    const bounds = drawingBounds(drawing.points);
    const rotation = drawingRotation(drawing);
    const center = drawingCenterOf(drawing.points);
    const transform =
      rotation && center
        ? `rotate(${rotation} ${center.x} ${center.y})`
        : undefined;
    if (
      bounds &&
      drawing.kind === "rectangle" &&
      bounds.width > 0 &&
      bounds.height > 0
    ) {
      return (
        <rect
          key={key}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx="3"
          fill="none"
          stroke={color}
          strokeWidth={width}
          transform={transform}
        />
      );
    }
    if (
      bounds &&
      drawing.kind === "ellipse" &&
      bounds.width > 0 &&
      bounds.height > 0
    ) {
      return (
        <ellipse
          key={key}
          cx={bounds.x + bounds.width / 2}
          cy={bounds.y + bounds.height / 2}
          rx={bounds.width / 2}
          ry={bounds.height / 2}
          fill="none"
          stroke={color}
          strokeWidth={width}
          transform={transform}
        />
      );
    }
    if (drawing.kind === "line" && drawing.points.length > 1) {
      const start = drawing.points[0];
      const end = drawing.points.at(-1);
      return (
        <line
          key={key}
          x1={start.x}
          y1={start.y}
          x2={end?.x ?? start.x}
          y2={end?.y ?? start.y}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          transform={transform}
        />
      );
    }
    return (
      <polyline
        key={key}
        points={drawing.points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={transform}
      />
    );
  };

  const renderDraftMeasurements = () => {
    if (!activeScene || drawDraft.length < 2) return null;
    if (drawMode !== "rectangle" && drawMode !== "ellipse") return null;
    const bounds = drawingBounds(drawDraft);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const cell = activeScene.grid_cell_px;
    if (cell <= 0) return null;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    if (drawMode === "rectangle") {
      return (
        <g className="draw-measure" aria-hidden="true">
          <text x={centerX} y={bounds.y - 9} textAnchor="middle">
            {distanceLabelFor(activeScene, bounds.width / cell)}
          </text>
          <text
            x={bounds.x - 9}
            y={centerY}
            textAnchor="middle"
            transform={`rotate(-90 ${bounds.x - 9} ${centerY})`}
          >
            {distanceLabelFor(activeScene, bounds.height / cell)}
          </text>
        </g>
      );
    }
    const radiusPx = bounds.width / 2;
    return (
      <g className="draw-measure" aria-hidden="true">
        <line
          x1={centerX}
          y1={centerY}
          x2={centerX + radiusPx}
          y2={centerY}
        />
        <text x={centerX} y={centerY - radiusPx - 9} textAnchor="middle">{t("r · ")}{distanceLabelFor(activeScene, radiusPx / cell)}
        </text>
      </g>
    );
  };

  const renderDrawingSelection = () => {
    if (tool !== "select") return null;
    const drawing = drawings.find((item) => item.id === selectedDrawingId);
    if (!drawing || !canManipulateDrawing(drawing)) return null;
    const bounds = fullDrawingBounds(drawing.points);
    if (!bounds) return null;
    const rotation = drawingRotation(drawing);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const resizable =
      drawing.kind === "rectangle" || drawing.kind === "ellipse";
    const rotateHandleY = bounds.y - 30;
    return (
      <g
        className="drawing-selection"
        transform={
          rotation ? `rotate(${rotation} ${centerX} ${centerY})` : undefined
        }
      >
        <rect
          className="drawing-selection-outline"
          x={bounds.x - 5}
          y={bounds.y - 5}
          width={bounds.width + 10}
          height={bounds.height + 10}
          rx="5"
        />
        <line
          className="drawing-selection-stem"
          x1={centerX}
          y1={bounds.y - 5}
          x2={centerX}
          y2={rotateHandleY}
        />
        <circle
          className="drawing-handle rotate"
          cx={centerX}
          cy={rotateHandleY}
          r="7"
          onPointerDown={(event) =>
            startDrawingHandleInteraction(event, drawing, "rotate")
          }
        >
          <title>{t("Trascina per ruotare")}</title>
        </circle>
        {resizable && (
          <circle
            className="drawing-handle resize"
            cx={bounds.x + bounds.width}
            cy={bounds.y + bounds.height}
            r="7"
            onPointerDown={(event) =>
              startDrawingHandleInteraction(event, drawing, "resize")
            }
          >
            <title>{t("Trascina per ridimensionare")}</title>
          </circle>
        )}
      </g>
    );
  };

  const updateInitiative = async (entryId: string, value: string) => {
    const next = nullableNumber(value);
    setInitiative((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, initiative: next } : entry,
      ),
    );
    const result = await supabase
      .from("initiative_entries")
      .update({ initiative: next })
      .eq("id", entryId);
    if (result.error) setError(result.error.message);
  };

  const swapEqualInitiativeEntries = async (
    entryId: string,
    direction: -1 | 1,
  ) => {
    if (!hasMasterAccess || initiativeSwapPending) return;
    const entryIndex = sortedInitiative.findIndex(
      (entry) => entry.id === entryId,
    );
    const entry = sortedInitiative[entryIndex];
    const adjacentEntry = sortedInitiative[entryIndex + direction];
    if (
      !entry ||
      !adjacentEntry ||
      entry.initiative !== adjacentEntry.initiative
    ) {
      return;
    }

    setInitiativeSwapPending(true);
    setInitiative((current) =>
      current.map((currentEntry) => {
        if (currentEntry.id === entry.id) {
          return { ...currentEntry, sort_order: adjacentEntry.sort_order };
        }
        if (currentEntry.id === adjacentEntry.id) {
          return { ...currentEntry, sort_order: entry.sort_order };
        }
        return currentEntry;
      }),
    );

    try {
      const result = await supabase.rpc("swap_equal_initiative_entries", {
        p_first_entry_id: entry.id,
        p_second_entry_id: adjacentEntry.id,
      });
      if (result.error) throw result.error;
    } catch (reason) {
      console.error(reason);
      setError("Non riesco a cambiare l’ordine dell’iniziativa.");
      if (activeScene) await loadSceneData(activeScene.id);
    } finally {
      setInitiativeSwapPending(false);
    }
  };

  const toggleInitiativeGroupExpanded = (entryId: string) => {
    setExpandedInitiativeGroupIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId],
    );
  };

  const mergeInitiativeSelection = async () => {
    if (!activeScene || !hasMasterAccess || mergingInitiative) return;
    const tokenIds = selectedTokenIds.filter((tokenId) =>
      tokens.some((token) => token.id === tokenId),
    );
    if (tokenIds.length < 2) return;
    setMergingInitiative(true);
    setError("");
    try {
      const result = await supabase.rpc("merge_initiative_group", {
        p_scene_id: activeScene.id,
        p_token_ids: tokenIds,
      });
      if (result.error) throw result.error;
      if (typeof result.data === "string") {
        const groupId = result.data;
        setExpandedInitiativeGroupIds((current) =>
          current.includes(groupId) ? current : [...current, groupId],
        );
      }
      await loadSceneData(activeScene.id);
      notify("Iniziativa unita nel gruppo");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unione dell’iniziativa non riuscita.",
      );
    } finally {
      setMergingInitiative(false);
    }
  };

  const renameInitiativeGroup = async () => {
    if (!initiativeGroupRename) return;
    const name = initiativeGroupRename.name.trim().slice(0, 30);
    if (!name) {
      setError("Il nome del gruppo è obbligatorio.");
      return;
    }
    const entryId = initiativeGroupRename.entryId;
    setInitiativeGroupRename(null);
    setInitiative((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, group_name: name } : entry,
      ),
    );
    const result = await supabase
      .from("initiative_entries")
      .update({ group_name: name })
      .eq("id", entryId);
    if (result.error) {
      setError(result.error.message);
      if (activeScene) await loadSceneData(activeScene.id);
    }
  };

  const deleteInitiativeGroup = async (entry: InitiativeEntry) => {
    if (
      !window.confirm(
        t("Sciogliere il gruppo “{p0}”? I token torneranno voci singole.", { p0: entry.group_name ?? t("Gruppo") }),
      )
    )
      return;
    setInitiativeGroupMenuId(null);
    setError("");
    setInitiative((current) =>
      current
        .filter((item) => item.id !== entry.id)
        .map((item) =>
          item.group_entry_id === entry.id
            ? { ...item, group_entry_id: null }
            : item,
        ),
    );
    const result = await supabase
      .from("initiative_entries")
      .delete()
      .eq("id", entry.id);
    if (result.error) {
      setError(result.error.message);
      if (activeScene) await loadSceneData(activeScene.id);
    } else {
      notify("Gruppo sciolto, token conservati");
    }
  };

  const advanceInitiative = async () => {
    if (!activeScene || !isMaster || runnableInitiative.length === 0) return;
    const currentIndex = sortedInitiative.findIndex(
      (entry) => entry.id === initiativeState?.current_entry_id,
    );
    let nextEntry = runnableInitiative[0];
    let wrapped = false;
    if (currentIndex >= 0) {
      for (let offset = 1; offset <= sortedInitiative.length; offset += 1) {
        const candidateIndex =
          (currentIndex + offset) % sortedInitiative.length;
        const candidate = sortedInitiative[candidateIndex];
        if (deadInitiativeEntryIds.has(candidate.id)) continue;
        nextEntry = candidate;
        wrapped = candidateIndex <= currentIndex;
        break;
      }
    }
    const nextState: InitiativeState = {
      scene_id: activeScene.id,
      round: (initiativeState?.round ?? 1) + (wrapped ? 1 : 0),
      current_entry_id: nextEntry.id,
      is_running: true,
    };
    setInitiativeState(nextState);
    const result = await supabase
      .from("initiative_state")
      .upsert(nextState, { onConflict: "scene_id" });
    if (result.error) setError(result.error.message);
  };

  const resetInitiative = async () => {
    if (!activeScene || !isMaster) return;
    const state = {
      scene_id: activeScene.id,
      round: 1,
      current_entry_id: null,
      is_running: false,
    };
    const result = await supabase
      .from("initiative_state")
      .upsert(state, { onConflict: "scene_id" });
    if (result.error) setError(result.error.message);
    else setInitiativeState(state);
  };

  const renderCategoryEditorForm = (source: MacroMenuSource) => {
    if (!categoryEditor) return null;
    return (
      <form
        key={categoryEditor.categoryId ?? "new-category"}
        className={`macro-category-divider editing ${source}`}
        onSubmit={(event) => {
          event.preventDefault();
          void saveCategoryEditor();
        }}
      >
        <input
          type="text"
          value={categoryEditor.name}
          maxLength={24}
          autoFocus
          placeholder={t("Nome sezione")}
          aria-label={t("Nome della sezione")}
          onChange={(event) =>
            setCategoryEditor((current) =>
              current ? { ...current, name: event.target.value } : current,
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeCategoryEditor();
            }
          }}
        />
        <button
          type="submit"
          disabled={savingCategory}
          title={t("Salva sezione")}
          aria-label={t("Salva sezione")}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={closeCategoryEditor}
          title={t("Annulla")}
          aria-label={t("Annulla")}
        >
          ×
        </button>
      </form>
    );
  };

  const renderCategoryActionMenu = (
    category: CharacterMacroCategory,
    source: MacroMenuSource,
    index: number,
    total: number,
    macroCount: number,
  ) => (
    <div className={`macro-action-menu category ${source}`} role="menu">
      <strong>{category.name}</strong>
      <small>
        {macroCount === 1 ? t("1 macro") : t("{p0} macro", { p0: macroCount })}{t(" · sezione")}{" "}
        {index + 1}{t(" di ")}{total}
      </small>
      <button
        type="button"
        role="menuitem"
        onClick={() => openCategoryRename(category, source)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
        </svg>{t("Rinomina")}</button>
      <button
        type="button"
        role="menuitem"
        disabled={index === 0}
        onClick={() => void moveCategory(category, -1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5m-6 6 6-6 6 6" />
        </svg>{t("Sposta su")}</button>
      <button
        type="button"
        role="menuitem"
        disabled={index === total - 1}
        onClick={() => void moveCategory(category, 1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14m-6-6 6 6 6-6" />
        </svg>{t("Sposta giù")}</button>
      <button
        type="button"
        className="danger"
        role="menuitem"
        onClick={() => void deleteCategory(category)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
        </svg>{t("Elimina sezione")}</button>
      <small className="macro-category-menu-hint">{t("Le macro tornano senza sezione.")}</small>
    </div>
  );

  const renderCategoryDivider = (
    category: CharacterMacroCategory,
    source: MacroMenuSource,
    index: number,
    total: number,
    macroCount: number,
  ) => {
    if (
      categoryEditor?.categoryId === category.id &&
      categoryEditor.source === source
    ) {
      return renderCategoryEditorForm(source);
    }
    const collapsed = !expandedMacroCategoryIds.includes(category.id);
    const menuOpen =
      categoryMenu?.categoryId === category.id &&
      categoryMenu.source === source;
    const toggleMenu = () => {
      setMacroMenu(null);
      setQuickDiePickerOpen(false);
      setCategoryMenu((current) =>
        current?.categoryId === category.id && current.source === source
          ? null
          : { categoryId: category.id, source },
      );
    };
    return (
      <div
        className={`macro-category-divider ${source}${
          collapsed ? " collapsed" : ""
        }`}
      >
        <button
          type="button"
          className="macro-category-toggle"
          onClick={() => toggleCategoryCollapsed(category.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMenu();
          }}
          aria-expanded={!collapsed}
          title={
            collapsed
              ? t("Espandi la sezione {p0}", { p0: category.name })
              : t("Comprimi la sezione {p0}", { p0: category.name })
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span>{category.name}</span>
          {collapsed && macroCount > 0 && (
            <i aria-hidden="true">{macroCount}</i>
          )}
        </button>
        <button
          type="button"
          className="macro-category-menu-button"
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu();
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("Opzioni della sezione {p0}", { p0: category.name })}
        >
          ⋯
        </button>
        {menuOpen &&
          renderCategoryActionMenu(category, source, index, total, macroCount)}
      </div>
    );
  };

  const renderCategoryAddControl = (
    character: Character,
    source: MacroMenuSource,
  ) => {
    if (
      categoryEditor &&
      categoryEditor.categoryId === null &&
      categoryEditor.characterId === character.id &&
      categoryEditor.source === source
    ) {
      return renderCategoryEditorForm(source);
    }
    return (
      <button
        type="button"
        className={`macro-category-add ${source}`}
        onClick={() => openCategoryCreator(character.id, source)}
        title={t("Nuova sezione per le macro di {p0}", { p0: character.name })}
      >{t("＋ Sezione")}</button>
    );
  };

  const renderMacroActionMenu = (
    macro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    const hasTemporaryBonus = hasTemporaryMacroBonus(macro);
    const baseExpression = macroExpression(macro.dice_sides, macro.bonuses);
    const temporaryExpression = macroExpression(
      macro.temporary_dice_sides,
      macro.temporary_bonuses,
    );
    const characterCategories =
      categoriesByCharacter.get(macro.character_id) ?? [];

    return (
      <div className={`macro-action-menu ${source}`} role="menu">
        <strong>{macro.name}</strong>
        {macro.description && (
          <p className="macro-action-description">{macro.description}</p>
        )}
        <small>{t("Base · ")}{baseExpression}</small>
        {hasTemporaryBonus && (
          <small className="macro-temporary-formula">{t("BT · ")}{temporaryExpression}
          </small>
        )}
        <MacroRollModeOptions
          mode={macroRollModes[macro.id] ?? "normal"}
          onChange={(mode) => setMacroRollModes((current) => ({
            ...current,
            [macro.id]: mode,
          }))}
        />
        {characterCategories.length > 0 && (
          <label className="macro-action-category">
            <small>{t("Sezione")}</small>
            <select
              value={macro.category_id ?? ""}
              aria-label={t("Sezione della macro {p0}", { p0: macro.name })}
              onChange={(event) =>
                void setMacroCategoryAssignment(
                  macro,
                  event.target.value || null,
                )
              }
            >
              <option value="">{t("Senza sezione")}</option>
              {characterCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => openTemporaryBonusEditor(macro)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12h16M12 4v16M6.5 6.5l11 11" />
          </svg>{t("Bonus temp")}{hasTemporaryBonus && <i>{t("BT")}</i>}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => openMacroEditor(macro)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
          </svg>{t("Modifica")}</button>
        <button
          type="button"
          className="danger"
          role="menuitem"
          disabled={deletingMacroId === macro.id}
          onClick={() => void deleteMacro(macro)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
          </svg>{t("Elimina")}</button>
      </div>
    );
  };

  const renderMacroDiamond = (
    macro: CharacterMacro,
    source: MacroMenuSource,
  ) => {
    const mode = macroRollModes[macro.id] ?? "normal";
    const hasTemporaryBonus = hasTemporaryMacroBonus(macro);
    const baseExpression = macroExpression(macro.dice_sides, macro.bonuses);
    const temporaryExpression = macroExpression(
      macro.temporary_dice_sides,
      macro.temporary_bonuses,
    );
    const menuOpen =
      macroMenu?.macroId === macro.id && macroMenu.source === source;

    return (
      <div
        className={`macro-diamond-wrap macro-diamond-${source}${
          source === "board" ? " macro-reorderable" : ""
        }${
          macroDrag?.macroId === macro.id && macroDrag.source === source
            ? " macro-reorder-dragging"
            : ""
        }${
          macroDropTarget?.macroId === macro.id &&
          macroDropTarget.source === source
            ? ` macro-drop-${macroDropTarget.placement}`
            : ""
        }`}
        key={`${source}-${macro.id}`}
        draggable={source === "board" && !savingMacroOrder}
        onDragStart={
          source === "board"
            ? (event) => beginMacroDrag(event, macro, source)
            : undefined
        }
        onDragOver={
          source === "board"
            ? (event) => moveMacroOverTarget(event, macro, source)
            : undefined
        }
        onDragLeave={
          source === "board"
            ? (event) => leaveMacroDropTarget(event, macro, source)
            : undefined
        }
        onDrop={
          source === "board"
            ? (event) => dropMacroOnTarget(event, macro, source)
            : undefined
        }
        onDragEnd={source === "board" ? finishMacroDrag : undefined}
      >
        <button
          type="button"
          className={`macro-diamond ${menuOpen ? "active" : ""}`}
          onClick={() => rollMacro(macro, source)}
          onPointerDown={(event) => {
            if (event.button === 2) event.stopPropagation();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setQuickDiePickerOpen(false);
            setMacroMenu((current) =>
              current?.macroId === macro.id && current.source === source
                ? null
                : { macroId: macro.id, source },
            );
          }}
          title={
            source === "board"
              ? undefined
              : t("{p0}: {p1}{p2}{p3} · click per lanciare, trascina per riordinare, destro per gestire", { p0: macro.name, p1: baseExpression, p2: hasTemporaryBonus ? t(" + BT {p0}", { p0: temporaryExpression }) : "", p3: mode !== "normal" ? ` · ${mode.toUpperCase()}` : "" })
          }
          aria-label={t("Usa macro {p0}{p1}{p2}", { p0: macro.name, p1: hasTemporaryBonus ? t(" con bonus temporaneo attivo") : "", p2: mode === "adv" ? t(" con vantaggio") : mode === "dis" ? t(" con svantaggio") : "" })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span>{macroAbbreviation(macro.name)}</span>
        </button>
        {hasTemporaryBonus && (
          <span className="macro-temporary-badge" aria-hidden="true">{t("BT")}</span>
        )}
        <MacroRollModeBadge mode={mode} />
        {source === "board" && (
          <span className="macro-board-tooltip" role="tooltip">
            {macro.name}{mode !== "normal" ? ` · ${mode.toUpperCase()}` : ""}
          </span>
        )}
        {menuOpen && renderMacroActionMenu(macro, source)}
      </div>
    );
  };

  const renderTokenMacroRow = (macro: CharacterMacro) => (
    <div
      className={`token-macro-row macro-reorderable${
        macroDrag?.macroId === macro.id && macroDrag.source === "token"
          ? " macro-reorder-dragging"
          : ""
      }${
        macroDropTarget?.macroId === macro.id &&
        macroDropTarget.source === "token"
          ? ` macro-drop-${macroDropTarget.placement}`
          : ""
      }`}
      key={macro.id}
      draggable={!savingMacroOrder}
      onDragStart={(event) => beginMacroDrag(event, macro, "token")}
      onDragOver={(event) => moveMacroOverTarget(event, macro, "token")}
      onDragLeave={(event) => leaveMacroDropTarget(event, macro, "token")}
      onDrop={(event) => dropMacroOnTarget(event, macro, "token")}
      onDragEnd={finishMacroDrag}
      title={t("Trascina per cambiare l’ordine")}
    >
      {renderMacroDiamond(macro, "token")}
      <span className="token-macro-copy">
        <strong title={macro.name}>{macro.name}</strong>
        {macro.description && (
          <small title={macro.description}>{macro.description}</small>
        )}
      </span>
    </div>
  );

  if (loading) {
    return (
      <main className="table-loading">
        <span className="loader" />
        <strong>{t("Preparo la scena…")}</strong>
        <LanguageToggle />
      </main>
    );
  }

  return (
    <main
      className={`vers-shell ${leftCollapsed ? "left-is-collapsed" : ""} ${
        rightCollapsed ? "right-is-collapsed" : ""
      }`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={dropPanelAsFloating}
    >
      <header className="table-topbar">
        <button className="table-brand" onClick={onBack}>
          <span className="brand-rune small">V</span>
          <span>
            <strong>Vers</strong>
            <small>{campaign.name}</small>
          </span>
        </button>

        <div className="active-scene-heading">
          <span>{playerView ? t("Vista giocatori") : t("Vista Master")}</span>
          <strong>{activeScene?.name ?? t("Nessuna scena")}</strong>
        </div>

        <div className="table-top-actions">
          <LanguageToggle />
          <SourceLink />
          {isMaster && (
            <div className="view-switch">
              <button
                className={!previewPlayer ? "active" : ""}
                onClick={() => setPreviewPlayer(false)}
              >{t("Master")}</button>
              <button
                className={previewPlayer ? "active" : ""}
                onClick={() => setPreviewPlayer(true)}
              >{t("Come Player")}</button>
            </div>
          )}
          <button
            type="button"
            className="layout-reset-button"
            onClick={resetFloatingPanelLayouts}
            title={t("Ripristina posizione e dimensione dei pannelli")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h7v6H4V5Zm9 0h7v10h-7V5ZM4 13h7v6H4v-6Zm9 4h7v2h-7v-2Z" />
            </svg>
            <span>{t("Reset layout")}</span>
          </button>
          <button
            type="button"
            className={`sync-pill ${realtimeStatus}`}
            onClick={() => realtimeReconnectRef.current()}
            title={t("{p0}{p1} Clicca per forzare un nuovo riallineamento.", { p0: realtimeStatus === "connected"
                ? t("Entrambi i canali Realtime sono attivi.")
                : realtimeStatus === "error"
                  ? t("Connessione Realtime interrotta.")
                  : t("Connessione e riallineamento in corso."), p1: lastRealtimeSyncAt
                ? t(" Ultimo riallineamento: {p0}.", { p0: new Date(
                    lastRealtimeSyncAt,
                  ).toLocaleTimeString(uiLocale()) })
                : "" })}
            aria-label={t("Riconnetti e riallinea il tavolo")}
          >
            <i />
            {realtimeStatus === "connected"
              ? t("Sincronizzato")
              : realtimeStatus === "error"
                ? t("Realtime non disponibile")
                : t("Connessione…")}
          </button>
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button
              className="user-menu"
              onClick={() => setAccountMenuOpen((current) => !current)}
              title={t("Apri menu account")}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" />
              ) : (
                <span>{initialsFor(profileDisplayName)}</span>
              )}
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown" role="menu">
                <div className="account-dropdown-summary">
                  <strong>{profileDisplayName}</strong>
                  <small>{user.email}</small>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openUserProfile}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
                  </svg>{t("Profilo")}</button>
                <button
                  type="button"
                  className="danger"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onLogout();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 5H5v14h5m5-3 4-4-4-4m4 4H9" />
                  </svg>{t("Logout")}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside
        className={`scene-rail ${playerView ? "characters-only" : ""}`}
      >
        <div
          ref={setLeftRailTarget}
          className={`rail-panel-stack left-rail-panel-stack ${
            draggedPanelId ? "panel-drag-active" : ""
          }`}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => dropPanelInRail(event, "left")}
        >
          {leftDockedPanelIds.length === 0 && (
            <div className="rail-dock-empty">
              <span aria-hidden="true">◇</span>
              <strong>{t("Barra libera")}</strong>
              <small>{t("Trascina qui una sezione.")}</small>
            </div>
          )}
        </div>
        {isMaster && !playerView && (
          <DockablePanelHost
            id="scenes-list"
            title={t("Scene")}
            subtitle={`${visibleScenes.length}`}
            layout={floatingPanelLayouts["scenes-list"]}
            placement={panelDockPlacements["scenes-list"]}
            floatingLayerTarget={floatingLayerTarget}
            leftRailTarget={leftRailTarget}
            rightRailTarget={rightRailTarget}
            draggedPanelId={draggedPanelId}
            onDockedPanelDrop={dropRelativeToDockedPanel}
            onChange={updateFloatingPanelLayout}
            onCommit={saveFloatingPanelLayouts}
            onFocus={focusFloatingPanel}
            onDockDragStart={beginPanelDockDrag}
            onDockDragEnd={finishPanelDockDrag}
            headerActions={
                <button
                  type="button"
                  onClick={() => void addScene()}
                  title={t("Nuova scena")}
                  aria-label={t("Nuova scena")}
                >
                  ＋
                </button>
            }
          >
            <div className="scene-stack docked-section-stack">
                {visibleScenes.map((scene, index) => (
                  <button
                    key={scene.id}
                    className={`scene-card ${
                      scene.id === activeSceneId ? "active" : ""
                    }`}
                    onClick={() => {
                      activeSceneIdRef.current = scene.id;
                      setActiveSceneId(scene.id);
                    }}
                  >
                    <span
                      className="scene-preview"
                      style={
                        scene.mapUrl
                          ? { backgroundImage: `url("${scene.mapUrl}")` }
                          : undefined
                      }
                    >
                      {!scene.mapUrl && <i>◇</i>}
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </span>
                    <span>
                      <strong>{scene.name}</strong>
                      <small>
                        {scene.id === campaign.player_scene_id
                          ? t("Ai giocatori")
                          : scene.mapUrl
                            ? t("Pronta")
                            : t("Senza mappa")}
                      </small>
                    </span>
                    {scene.id === campaign.player_scene_id && (
                      <i className="live-dot" title={t("Scena dei giocatori")} />
                    )}
                  </button>
                ))}
            </div>
          </DockablePanelHost>
        )}

        <DockablePanelHost
          id="characters-list"
          title={t("PG")}
          subtitle={`${characters.length}`}
          layout={floatingPanelLayouts["characters-list"]}
          placement={panelDockPlacements["characters-list"]}
          floatingLayerTarget={floatingLayerTarget}
          leftRailTarget={leftRailTarget}
          rightRailTarget={rightRailTarget}
          draggedPanelId={draggedPanelId}
          onDockedPanelDrop={dropRelativeToDockedPanel}
          onChange={updateFloatingPanelLayout}
          onCommit={saveFloatingPanelLayouts}
          onFocus={focusFloatingPanel}
          onDockDragStart={beginPanelDockDrag}
          onDockDragEnd={finishPanelDockDrag}
          headerActions={
            <button
              type="button"
              onClick={openCharacterCreator}
              title={t("Nuovo personaggio")}
              aria-label={t("Nuovo personaggio")}
            >
              ＋
            </button>
          }
        >
          <div className="asset-stack docked-section-stack">
            {characters.map((character) => (
              <div
                key={character.id}
                className="asset-card character-card"
                draggable
                onDragStart={(event) => {
                  if (
                    (event.target as HTMLElement).closest(
                      ".character-card-actions",
                    )
                  ) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData(
                    "application/x-vers-character",
                    character.id,
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
                title={t("Trascina sulla mappa")}
              >
                <span
                  style={
                    character.signedUrl
                      ? { backgroundImage: `url("${character.signedUrl}")` }
                      : undefined
                  }
                >
                  {!character.signedUrl && initialsFor(character.name)}
                </span>
                <strong>{character.name}</strong>
                <span
                  className="character-card-actions"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <button
                    type="button"
                    className={
                      openMacroCharacterIds.includes(character.id)
                        ? "active"
                        : ""
                    }
                    draggable={false}
                    aria-pressed={openMacroCharacterIds.includes(character.id)}
                    onClick={() => toggleCharacterMacros(character)}
                    title={t("Macro del personaggio")}
                    aria-label={t("Macro di {p0}", { p0: character.name })}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m12 3 9 9-9 9-9-9 9-9Z" />
                      <path d="M9 12h6m-3-3v6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    draggable={false}
                    onClick={() => openCharacterEditor(character)}
                    title={t("Modifica personaggio")}
                    aria-label={t("Modifica {p0}", { p0: character.name })}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="danger"
                    draggable={false}
                    disabled={deletingCharacterId === character.id}
                    onClick={() => void deleteCharacter(character)}
                    title={t("Elimina personaggio")}
                    aria-label={t("Elimina {p0}", { p0: character.name })}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
            {characters.length === 0 && (
              <button className="empty-assets" onClick={openCharacterCreator}>
                <span>＋</span>
                <strong>{t("Crea personaggio")}</strong>
                <small>{t("Nome e token")}</small>
              </button>
            )}
          </div>
        </DockablePanelHost>
        {isMaster && !playerView && (
          <DockablePanelHost
            id="campaign-assets"
            title={t("NPC")}
            subtitle={`${campaignNpcs.length}`}
            layout={floatingPanelLayouts["campaign-assets"]}
            placement={panelDockPlacements["campaign-assets"]}
            floatingLayerTarget={floatingLayerTarget}
            leftRailTarget={leftRailTarget}
            rightRailTarget={rightRailTarget}
            draggedPanelId={draggedPanelId}
            onDockedPanelDrop={dropRelativeToDockedPanel}
            onChange={updateFloatingPanelLayout}
            onCommit={saveFloatingPanelLayouts}
            onFocus={focusFloatingPanel}
            onDockDragStart={beginPanelDockDrag}
            onDockDragEnd={finishPanelDockDrag}
            headerActions={
              <>
                <button
                  type="button"
                  className={npcSearchOpen ? "active" : ""}
                  aria-pressed={npcSearchOpen}
                  onClick={() => {
                    setNpcSearchOpen((current) => {
                      if (current) setNpcSearchQuery("");
                      return !current;
                    });
                  }}
                  title={npcSearchOpen ? t("Chiudi ricerca") : t("Cerca NPC")}
                  aria-label={
                    npcSearchOpen ? t("Chiudi ricerca NPC") : t("Cerca NPC")
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m16 16 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={openNpcCreator}
                  title={t("Nuovo NPC")}
                  aria-label={t("Nuovo NPC")}
                >
                  ＋
                </button>
              </>
            }
          >
            <div className="asset-stack docked-section-stack">
              {npcSearchOpen && (
                <label className="npc-search-field">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m16 16 4 4" />
                  </svg>
                  <input
                    type="search"
                    value={npcSearchQuery}
                    autoFocus
                    placeholder={t("Cerca per nome…")}
                    aria-label={t("Filtra NPC per nome")}
                    onChange={(event) => setNpcSearchQuery(event.target.value)}
                  />
                </label>
              )}
              {filteredCampaignNpcs.map((character) => (
                <div
                  key={character.id}
                  className="asset-card character-card"
                  draggable
                  onDragStart={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        ".character-card-actions",
                      )
                    ) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(
                      "application/x-vers-character",
                      character.id,
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  title={t("Trascina sulla mappa")}
                >
                  <span
                    style={
                      character.signedUrl
                        ? { backgroundImage: `url("${character.signedUrl}")` }
                        : undefined
                    }
                  >
                    {!character.signedUrl && initialsFor(character.name)}
                  </span>
                  <strong>{character.name}</strong>
                  <span
                    className="character-card-actions"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <button
                      type="button"
                      className={
                        openMacroCharacterIds.includes(character.id)
                          ? "active"
                          : ""
                      }
                      draggable={false}
                      aria-pressed={openMacroCharacterIds.includes(character.id)}
                      onClick={() => toggleCharacterMacros(character)}
                      title={t("Macro dell’NPC")}
                      aria-label={t("Macro di {p0}", { p0: character.name })}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m12 3 9 9-9 9-9-9 9-9Z" />
                        <path d="M9 12h6m-3-3v6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      draggable={false}
                      onClick={() => openCharacterEditor(character)}
                      title={t("Modifica NPC")}
                      aria-label={t("Modifica {p0}", { p0: character.name })}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="danger"
                      draggable={false}
                      disabled={deletingCharacterId === character.id}
                      onClick={() => void deleteCharacter(character)}
                      title={t("Elimina NPC")}
                      aria-label={t("Elimina {p0}", { p0: character.name })}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                      </svg>
                    </button>
                  </span>
                </div>
              ))}
              {campaignNpcs.length === 0 && (
                <button className="empty-assets" onClick={openNpcCreator}>
                  <span>＋</span>
                  <strong>{t("Crea NPC")}</strong>
                  <small>{t("Nome e token")}</small>
                </button>
              )}
              {campaignNpcs.length > 0 &&
                filteredCampaignNpcs.length === 0 && (
                  <div className="empty-assets npc-search-empty">
                    <span>◇</span>
                    <strong>{t("Nessun NPC trovato")}</strong>
                    <small>{t("Prova un altro nome")}</small>
                  </div>
                )}
            </div>
          </DockablePanelHost>
        )}
        {isMaster && !playerView && (
          <DockablePanelHost
            id="asset-library"
            title={t("Asset")}
            subtitle={`${campaignSceneAssets.length}`}
            layout={floatingPanelLayouts["asset-library"]}
            placement={panelDockPlacements["asset-library"]}
            floatingLayerTarget={floatingLayerTarget}
            leftRailTarget={leftRailTarget}
            rightRailTarget={rightRailTarget}
            draggedPanelId={draggedPanelId}
            onDockedPanelDrop={dropRelativeToDockedPanel}
            onChange={updateFloatingPanelLayout}
            onCommit={saveFloatingPanelLayouts}
            onFocus={focusFloatingPanel}
            onDockDragStart={beginPanelDockDrag}
            onDockDragEnd={finishPanelDockDrag}
            headerActions={
              <>
                <input
                  ref={sceneAssetInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(event) => void uploadCampaignSceneAsset(event)}
                />
                <button
                  type="button"
                  disabled={uploadingSceneAsset}
                  onClick={() => sceneAssetInputRef.current?.click()}
                  title={t("Carica asset PNG o JPEG")}
                  aria-label={t("Carica asset PNG o JPEG")}
                >
                  {uploadingSceneAsset ? "…" : "＋"}
                </button>
              </>
            }
          >
            <div className="asset-stack docked-section-stack scene-asset-library">
              {campaignSceneAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="asset-card scene-asset-library-card"
                  draggable={deletingCampaignAssetId !== asset.id}
                  aria-busy={deletingCampaignAssetId === asset.id}
                  onDragStart={(event) => {
                    if (
                      deletingCampaignAssetId === asset.id ||
                      (event.target instanceof Element &&
                        event.target.closest("button"))
                    ) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(SCENE_ASSET_DRAG_MIME, asset.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  title={t("Trascina sulla mappa per aggiungere una copia")}
                >
                  <span
                    style={
                      asset.signedUrl
                        ? { backgroundImage: `url("${asset.signedUrl}")` }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!asset.signedUrl && t("IMG")}
                  </span>
                  <span className="scene-asset-library-copy">
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.width && asset.height
                        ? `${asset.width} × ${asset.height}px`
                        : t("PNG / JPEG")}
                    </small>
                  </span>
                  <span className="scene-asset-drag-grip" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="character-card-actions scene-asset-library-actions">
                    <button
                      type="button"
                      className="danger"
                      draggable={false}
                      disabled={deletingCampaignAssetId !== null}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.focus();
                      }}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteCampaignSceneAsset(asset);
                      }}
                      title={t("Elimina asset dalla campagna")}
                      aria-label={t("Elimina asset {p0}", { p0: asset.name })}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                      </svg>
                    </button>
                  </span>
                </div>
              ))}
              {campaignSceneAssets.length === 0 && (
                <button
                  type="button"
                  className="empty-assets"
                  onClick={() => sceneAssetInputRef.current?.click()}
                >
                  <span>＋</span>
                  <strong>{t("Carica il primo asset")}</strong>
                  <small>{t("PNG o JPEG, massimo 15 MB")}</small>
                </button>
              )}
            </div>
          </DockablePanelHost>
        )}
      </aside>

      <button
        className="left-collapse"
        onClick={toggleLeftRail}
        aria-label={
          leftCollapsed ? t("Apri pannello laterale") : t("Chiudi pannello laterale")
        }
      >
        {leftCollapsed ? "›" : "‹"}
      </button>

      <section className="board-stage">
        <MacroDockRow
          dockRef={macroDockRef}
          order={macroDockOrder}
          onOrderChange={updateMacroDockOrder}
          onReorderStart={closeMenusForDockReorder}
        >
          <aside
            ref={quickDieDockRef}
            data-macro-dock-id={QUICK_DIE_DOCK_ID}
            className={`macro-dock quick-die-dock ${
              quickDieCollapsed ? "collapsed" : ""
            }`}
            aria-label={t("Dado rapido")}
          >
            <button
              type="button"
              className="macro-dock-heading"
              draggable
              onClick={() => {
                setQuickDieCollapsed((collapsed) => !collapsed);
                setQuickDiePickerOpen(false);
              }}
              title={t("{p0} dado rapido · trascina per riordinare (Alt + frecce)", { p0: quickDieCollapsed ? t("Espandi") : t("Comprimi") })}
              aria-expanded={!quickDieCollapsed}
            >
              <strong>{t("Dado")}</strong>
              <span aria-hidden="true">{quickDieCollapsed ? "＋" : "−"}</span>
            </button>

            {!quickDieCollapsed && (
              <div className="quick-die-body">
                <div className="macro-diamond-wrap">
                  <button
                    type="button"
                    className={`macro-diamond quick-die ${
                      quickDiePickerOpen ? "active" : ""
                    }`}
                    onClick={rollQuickDie}
                    onPointerDown={(event) => {
                      if (event.button === 2) event.stopPropagation();
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMacroMenu(null);
                      setQuickDiePickerOpen((open) => !open);
                    }}
                    title={t("{p0}{p1} · click per tirare, destro per configurare il tiro", { p0: quickDieFormula, p1: quickDieMode !== "normal" ? ` · ${quickDieMode.toUpperCase()}` : "" })}
                    aria-label={t("Tira {p0}{p1}", { p0: quickDieFormula, p1: quickDieMode === "adv" ? t(" con vantaggio") : quickDieMode === "dis" ? t(" con svantaggio") : "" })}
                    aria-haspopup="menu"
                    aria-expanded={quickDiePickerOpen}
                  >
                    <span>{t("D")}{quickDieSides}</span>
                  </button>
                  {quickDieCount > 1 && (
                    <span className="quick-die-count-badge" aria-hidden="true">
                      ×{quickDieCount}
                    </span>
                  )}
                  <MacroRollModeBadge mode={quickDieMode} />
                  {quickDiePickerOpen && (
                    <div className="quick-die-menu" role="menu">
                      <strong>{t("Dado rapido")}</strong>
                      <small>{quickDieFormula}{t(" · configura il tiro al volo.")}</small>
                      <div className="quick-die-count-control">
                        <label htmlFor="quick-die-count">{t("Numero di dadi")}</label>
                        <div>
                          <button
                            type="button"
                            aria-label={t("Riduci numero di dadi")}
                            disabled={quickDieCount <= 1}
                            onClick={() => chooseQuickDieCount(quickDieCount - 1)}
                          >−</button>
                          <select
                            id="quick-die-count"
                            value={quickDieCount}
                            onChange={(event) => chooseQuickDieCount(event.target.value)}
                          >
                            {Array.from({ length: MAX_QUICK_DICE_COUNT }, (_, index) => (
                              <option key={index + 1} value={index + 1}>
                                {index + 1} {index === 0 ? t("dado") : t("dadi")}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label={t("Aumenta numero di dadi")}
                            disabled={quickDieCount >= MAX_QUICK_DICE_COUNT}
                            onClick={() => chooseQuickDieCount(quickDieCount + 1)}
                          >＋</button>
                        </div>
                      </div>
                      <div className="quick-die-presets">
                        {QUICK_DIE_PRESETS.map((sides) => (
                          <button
                            type="button"
                            className={quickDieSides === sides ? "active" : ""}
                            key={sides}
                            onClick={() => chooseQuickDie(sides, false)}
                          >{t("d")}{sides}
                          </button>
                        ))}
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          chooseQuickDie(quickDieInput);
                        }}
                      >
                        <label htmlFor="quick-die-custom">{t("Facce personalizzate")}</label>
                        <div>
                          <span>{t("d")}</span>
                          <input
                            id="quick-die-custom"
                            type="number"
                            min="2"
                            max="10000"
                            value={quickDieInput}
                            onChange={(event) =>
                              setQuickDieInput(event.target.value)
                            }
                          />
                          <button type="submit">{t("Imposta")}</button>
                        </div>
                      </form>
                      <MacroRollModeOptions
                        mode={quickDieMode}
                        onChange={setQuickDieMode}
                        includeBonusHint={false}
                      />
                      <button
                        type="button"
                        className="quick-die-roll-button"
                        onClick={rollQuickDie}
                      >{t("Tira ")}{quickDieFormula}{quickDieMode !== "normal" ? ` · ${quickDieMode.toUpperCase()}` : ""}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>

          {openMacroCharacters.map((character) => {
            const collapsed = collapsedMacroCharacterIds.includes(
              character.id,
            );
            const { uncategorized, sections } = macroSectionsForCharacter(
              character.id,
            );
            return (
              <aside
                data-macro-dock-id={characterMacroDockId(character.id)}
                className={`macro-dock ${collapsed ? "collapsed" : ""}`}
                aria-label={t("Macro di {p0}", { p0: character.name })}
                key={character.id}
              >
                <button
                  type="button"
                  className="macro-dock-heading"
                  draggable
                  onClick={() => toggleMacroColumn(character.id)}
                  title={t("{p0} macro di {p1} · trascina per riordinare (Alt + frecce)", { p0: collapsed ? t("Espandi") : t("Comprimi"), p1: character.name })}
                  aria-expanded={!collapsed}
                >
                  <strong>{character.name}</strong>
                  <span aria-hidden="true">{collapsed ? "＋" : "−"}</span>
                </button>

                {!collapsed && (
                  <>
                    {uncategorized.length > 0 && (
                      <>
                        <div className="macro-category-divider board uncategorized">
                          <span>{t("Senza sezione")}</span>
                        </div>
                        <div
                          className="macro-dock-list"
                          style={
                            {
                              "--macro-row-count": Math.ceil(
                                uncategorized.length / 2,
                              ),
                            } as React.CSSProperties
                          }
                        >
                          {uncategorized.map((macro) =>
                            renderMacroDiamond(macro, "board"),
                          )}
                        </div>
                      </>
                    )}
                    {sections.map(({ category, macros: sectionMacros }, index) => (
                      <Fragment key={category.id}>
                        {renderCategoryDivider(
                          category,
                          "board",
                          index,
                          sections.length,
                          sectionMacros.length,
                        )}
                        {expandedMacroCategoryIds.includes(category.id) &&
                          (sectionMacros.length > 0 ? (
                            <div
                              className="macro-dock-list"
                              style={
                                {
                                  "--macro-row-count": Math.ceil(
                                    sectionMacros.length / 2,
                                  ),
                                } as React.CSSProperties
                              }
                            >
                              {sectionMacros.map((macro) =>
                                renderMacroDiamond(macro, "board"),
                              )}
                            </div>
                          ) : (
                            <small className="macro-category-empty">{t("Nessuna macro")}</small>
                          ))}
                      </Fragment>
                    ))}
                    <div
                      className="macro-dock-list"
                      style={
                        { "--macro-row-count": 1 } as React.CSSProperties
                      }
                    >
                      <div className="macro-diamond-wrap">
                        <button
                          type="button"
                          className="macro-diamond add"
                          onClick={() => openMacroCreator(character)}
                          title={t("Nuova macro per {p0}", { p0: character.name })}
                          aria-label={t("Nuova macro per {p0}", { p0: character.name })}
                        >
                          <span>＋</span>
                        </button>
                      </div>
                    </div>
                    {renderCategoryAddControl(character, "board")}
                  </>
                )}
              </aside>
            );
          })}
        </MacroDockRow>

        {macroRollResult && (
          <div
            key={macroRollResult.rollId}
            className={`macro-roll-result ${
              macroRollResult.rolling ? "rolling" : "settled"
            }`}
            role="status"
            aria-live="polite"
          >
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeMacroRollResult();
              }}
              onClick={(event) => {
                event.stopPropagation();
                closeMacroRollResult();
              }}
              aria-label={t("Chiudi risultato")}
            >
              ×
            </button>
            {macroRollResult.rolling ? (
              <div className="macro-roll-animation">
                <span aria-hidden="true">
                  <i>4</i>
                  <i>12</i>
                  <i>20</i>
                </span>
                <small>{t("Lancio di ")}{macroRollResult.macroName}…</small>
              </div>
            ) : (
              <div className="macro-roll-content">
                <small>{macroRollResult.macroName}</small>
                <strong>{macroRollResult.total}</strong>
                <span>{localizeRollBreakdown(macroRollResult.breakdown, getLanguage())}</span>
              </div>
            )}
          </div>
        )}

        <div className="floating-toolbar">
          {TOOLBAR.filter(
            (item) => !item.masterOnly || (isMaster && !playerView),
          ).map((item) =>
            item.id === "draw" ? (
              <div className="toolbar-tool draw-toolbar-tool" key={item.id}>
                <button
                  className={tool === item.id ? "active" : ""}
                  onClick={() => chooseBoardTool(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const opening = !drawToolMenuOpen;
                    chooseBoardTool("draw");
                    setDrawToolMenuOpen(opening);
                  }}
                  title={t("Disegna · tasto destro per scegliere la forma")}
                  aria-haspopup="menu"
                  aria-expanded={drawToolMenuOpen}
                >
                  <span>
                    {drawMode === "freehand"
                      ? "✎"
                      : drawMode === "rectangle"
                        ? "□"
                        : "○"}
                  </span>
                  <small>{t(item.label)}</small>
                </button>
                {drawToolMenuOpen && (
                  <div className="draw-tool-menu" role="menu">
                    {(
                      [
                        ["freehand", "✎", t("Mano libera")],
                        ["rectangle", "□", t("Quadrato")],
                        ["ellipse", "○", t("Cerchio")],
                      ] as const
                    ).map(([mode, icon, label]) => (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={drawMode === mode}
                        className={drawMode === mode ? "active" : ""}
                        key={mode}
                        onClick={() => {
                          setDrawMode(mode);
                          chooseBoardTool("draw");
                        }}
                      >
                        <span>{icon}</span>
                        <strong>{label}</strong>
                        {drawMode === mode && <i>✓</i>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item.id === "erase" ? (
              <div className="toolbar-tool eraser-toolbar-tool" key={item.id}>
                <button
                  className={tool === item.id ? "active" : ""}
                  onClick={() => chooseBoardTool(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const opening = !eraserMenuOpen;
                    chooseBoardTool("erase");
                    setEraserMenuOpen(opening);
                  }}
                  title={t("Gomma · tasto destro per pulire tutti i disegni")}
                  aria-haspopup="menu"
                  aria-expanded={eraserMenuOpen}
                >
                  <span>{item.icon}</span>
                  <small>{t(item.label)}</small>
                </button>
                {eraserMenuOpen && (
                  <div
                    className="draw-tool-menu eraser-tool-menu"
                    role="menu"
                  >
                    <button
                      type="button"
                      className="danger"
                      role="menuitem"
                      onClick={() => {
                        setEraserMenuOpen(false);
                        void clearDrawings();
                      }}
                    >
                      <span>⌫</span>
                      <strong>{t("Pulisci tutto")}</strong>
                    </button>
                  </div>
                )}
              </div>
            ) : item.id === "reveal" || item.id === "hide" ? (
              <div className="toolbar-tool fog-toolbar-tool" key={item.id}>
                <button
                  className={tool === item.id ? "active" : ""}
                  onClick={() => chooseBoardTool(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const opening = fogBrushMenuTool !== item.id;
                    chooseBoardTool(item.id);
                    setFogBrushMenuTool(
                      opening ? (item.id as "reveal" | "hide") : null,
                    );
                  }}
                  title={t("{p0} · tasto destro per regolare il pennello", { p0: t(item.label) })}
                  aria-haspopup="dialog"
                  aria-expanded={fogBrushMenuTool === item.id}
                >
                  <span>{item.icon}</span>
                  <small>{t(item.label)}</small>
                </button>
                {fogBrushMenuTool === item.id && (
                  <div
                    className="fog-brush-menu"
                    role="dialog"
                    aria-label={t("Impostazioni nebbia")}
                  >
                    <span>
                      <strong>{t("Pennello nebbia")}</strong>
                      <small>{t("Lato del quadrato")}</small>
                    </span>
                    {activeScene && (
                      <div className="fog-activation">
                        <strong>
                          {activeScene.fog_enabled
                            ? t("Nebbia attiva")
                            : t("Nebbia disattivata")}
                        </strong>
                        <p>
                          {activeScene.fog_enabled
                            ? t("Rivela o copri trascinando sulla mappa.")
                            : t("Attivala per usare i pennelli. Ripristina la copertura salvata; nelle scene nuove copre tutta la mappa.")}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            void updateScene({
                              fog_enabled: !activeScene.fog_enabled,
                            })
                          }
                        >
                          {activeScene.fog_enabled
                            ? t("Disattiva nebbia")
                            : t("Attiva nebbia")}
                        </button>
                      </div>
                    )}
                    <label>
                      <i>1</i>
                      <input
                        type="range"
                        min="1"
                        max="15"
                        step="1"
                        value={fogBrushSize}
                        onChange={(event) =>
                          setFogBrushSize(toNumber(event.target.value, 3))
                        }
                        aria-label={t("Lato pennello in caselle")}
                      />
                      <i>15</i>
                    </label>
                    <output>
                      {fogBrushSize} × {fogBrushSize}{t(" caselle")}</output>
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.id}
                className={tool === item.id ? "active" : ""}
                onClick={() => chooseBoardTool(item.id)}
                title={
                  item.id === "select"
                    ? t("Seleziona · trascina sul vuoto per selezionare più token")
                    : t(item.label)
                }
              >
                <span>{item.icon}</span>
                <small>{t(item.label)}</small>
              </button>
            ),
          )}
        </div>

        <div
          ref={viewportRef}
          className={`board-viewport tool-${tool} ${
            isPanning ? "is-panning" : ""
          }`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={viewportPointerDown}
          onPointerMove={viewportPointerMove}
          onPointerUp={viewportPointerUp}
          onPointerCancel={viewportPointerUp}
        >
          {activeScene ? (
            <div
              ref={boardRef}
              className={`vers-board ${
                activeScene.mapUrl ? "has-map" : "empty-board"
              }`}
              style={{
                width: activeBoardWidth,
                height: activeBoardHeight,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                backgroundColor: activeScene.background_color,
                backgroundImage: activeScene.mapUrl
                  ? `url("${activeScene.mapUrl}")`
                  : undefined,
                "--cell": `${activeScene.grid_cell_px}px`,
                "--grid-x": `${activeScene.grid_offset_x}px`,
                "--grid-y": `${activeScene.grid_offset_y}px`,
              } as React.CSSProperties}
              onPointerDown={boardPointerDown}
              onPointerMove={boardPointerMove}
              onPointerUp={(event) => void boardPointerUp(event)}
              onPointerCancel={(event) => void boardPointerUp(event)}
              onLostPointerCapture={(event) => {
                if (pointerRef.current?.mode === "fog") {
                  void boardPointerUp(event);
                }
              }}
              onPointerLeave={() => {
                if (pointerRef.current?.mode !== "fog") {
                  setFogBrushPreview(null);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => void dropToken(event)}
            >
              {activeScene.grid === "square" && <div className="board-grid" />}

              <div className="scene-asset-layer" aria-label={t("Asset della scena")}>
                {sceneAssets.map((placement) => {
                  const asset = assets.find(
                    (candidate) => candidate.id === placement.asset_id,
                  );
                  if (!asset?.signedUrl) return null;
                  const selected = selectedSceneAsset?.id === placement.id;
                  const editable = hasMasterAccess && tool === "select";
                  return (
                    <div
                      key={placement.id}
                      className={`board-scene-asset ${
                        selected ? "selected" : ""
                      } ${editable ? "editable" : ""}`}
                      style={{
                        left: placement.x,
                        top: placement.y,
                        width: placement.width,
                        height: placement.height,
                        zIndex: placement.z_index,
                      }}
                      role={editable ? "button" : undefined}
                      tabIndex={editable ? 0 : undefined}
                      aria-label={editable ? t("Asset {p0}", { p0: asset.name }) : undefined}
                      aria-pressed={editable ? selected : undefined}
                      data-board-interactive={editable ? "true" : undefined}
                      onPointerDown={(event) =>
                        startSceneAssetMove(event, placement)
                      }
                      onPointerMove={moveSceneAsset}
                      onPointerUp={(event) =>
                        void endSceneAssetInteraction(event)
                      }
                      onPointerCancel={(event) =>
                        void endSceneAssetInteraction(event)
                      }
                    >
                      <span
                        className="board-scene-asset-image"
                        style={{
                          backgroundImage: `url("${asset.signedUrl}")`,
                          transform: `rotate(${placement.rotation}deg)`,
                        }}
                        aria-hidden="true"
                      />
                      {selected && editable && (
                        <>
                          <span className="board-scene-asset-size">
                            {Math.round(placement.width)} × {Math.round(placement.height)} ·{" "}
                            {Math.round(placement.rotation)}°
                          </span>
                          <button
                            type="button"
                            className="board-scene-asset-rotate"
                            onPointerDown={(event) =>
                              startSceneAssetRotation(event, placement)
                            }
                            onPointerMove={moveSceneAsset}
                            onPointerUp={(event) =>
                              void endSceneAssetInteraction(event)
                            }
                            onPointerCancel={(event) =>
                              void endSceneAssetInteraction(event)
                            }
                            title={t("Ruota liberamente")}
                            aria-label={t("Ruota {p0}", { p0: asset.name })}
                          >
                            <span />
                          </button>
                          <button
                            type="button"
                            className="board-scene-asset-delete"
                            disabled={deletingSceneAssetId === placement.id}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteSceneAssetPlacement(placement.id);
                            }}
                            title={t("Rimuovi dalla scena")}
                            aria-label={t("Rimuovi {p0} dalla scena", { p0: asset.name })}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="board-scene-asset-resize"
                            onPointerDown={(event) =>
                              startSceneAssetResize(event, placement)
                            }
                            onPointerMove={moveSceneAsset}
                            onPointerUp={(event) =>
                              void endSceneAssetInteraction(event)
                            }
                            onPointerCancel={(event) =>
                              void endSceneAssetInteraction(event)
                            }
                            title={t("Ridimensiona mantenendo le proporzioni")}
                            aria-label={t("Ridimensiona {p0}", { p0: asset.name })}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 16 16 8m-5 8h5v-5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <svg className="drawing-layer" aria-hidden="true">
                {drawings.map((drawing) =>
                  renderDrawingMark(drawing, drawing.id),
                )}
                {drawDraft.length > 1 &&
                  renderDrawingMark(
                    {
                      kind: drawMode,
                      points: drawDraft,
                      style: { color: rollerColor(user.uid), width: 4 },
                      author_user_id: user.uid,
                    },
                    "draw-draft",
                  )}
                {drawDraft.length > 1 && renderDraftMeasurements()}
                {renderDrawingSelection()}
              </svg>

              {activeScene.fog_enabled && (
                <div className={`fog-grid ${playerView ? "player" : "master"}`}>
                  {Array.from(
                    { length: activeGridRows },
                    (_, row) =>
                      Array.from(
                        { length: activeGridColumns },
                        (_, column) => {
                          const key = `${column}:${row}`;
                          if (revealedFogCells.has(key)) return null;
                          return (
                            <span
                              key={key}
                              style={{
                                left:
                                  activeScene.grid_offset_x +
                                  column * activeScene.grid_cell_px,
                                top:
                                  activeScene.grid_offset_y +
                                  row * activeScene.grid_cell_px,
                                width: activeScene.grid_cell_px + 1,
                                height: activeScene.grid_cell_px + 1,
                              }}
                            />
                          );
                        },
                      ),
                  )}
                </div>
              )}

              {fogBrushPreviewBounds &&
                hasMasterAccess &&
                (tool === "reveal" || tool === "hide") && (
                  <span
                    className={`fog-brush-preview ${tool}`}
                    aria-hidden="true"
                    style={{
                      left:
                        activeScene.grid_offset_x +
                        fogBrushPreviewBounds.startX *
                          activeScene.grid_cell_px,
                      top:
                        activeScene.grid_offset_y +
                        fogBrushPreviewBounds.startY *
                          activeScene.grid_cell_px,
                      width:
                        (fogBrushPreviewBounds.endX -
                          fogBrushPreviewBounds.startX +
                          1) *
                        activeScene.grid_cell_px,
                      height:
                        (fogBrushPreviewBounds.endY -
                          fogBrushPreviewBounds.startY +
                          1) *
                        activeScene.grid_cell_px,
                    }}
                  />
                )}

              {tokenSelectionBox && (
                <span
                  className="token-selection-box"
                  aria-hidden="true"
                  style={{
                    left: Math.min(
                      tokenSelectionBox.startX,
                      tokenSelectionBox.endX,
                    ),
                    top: Math.min(
                      tokenSelectionBox.startY,
                      tokenSelectionBox.endY,
                    ),
                    width: Math.abs(
                      tokenSelectionBox.endX - tokenSelectionBox.startX,
                    ),
                    height: Math.abs(
                      tokenSelectionBox.endY - tokenSelectionBox.startY,
                    ),
                  }}
                >
                  <strong>{selectedTokenIds.length}</strong>
                </span>
              )}

              <div className="token-layer">
                {visibleTokens.map((token) => {
                  const size = activeScene.grid_cell_px * token.size;
                  const fogObscured = !revealedTokenIds.has(token.id);
                  return (
                    <button
                      key={token.id}
                      className={`board-token ${
                        selectedTokenId === token.id ||
                        selectedTokenIds.includes(token.id)
                          ? "selected"
                          : ""
                      } ${
                        selectedTokenIds.length > 1 &&
                        selectedTokenIds.includes(token.id)
                          ? "multi-selected"
                          : ""
                      } ${token.locked ? "locked" : ""} ${
                        token.is_dead ? "dead" : ""
                      } ${fogObscured ? "fog-obscured" : ""}`}
                      style={{
                        left:
                          activeScene.grid_offset_x +
                          token.x * activeScene.grid_cell_px +
                          3,
                        top:
                          activeScene.grid_offset_y +
                          token.y * activeScene.grid_cell_px +
                          3,
                        width: size - 6,
                        height: size - 6,
                        "--token-color": token.color,
                        backgroundImage: token.imageUrl
                          ? `url("${token.imageUrl}")`
                          : undefined,
                      } as React.CSSProperties}
                      onPointerDown={(event) => startTokenMove(event, token)}
                      onPointerMove={moveToken}
                      onPointerUp={(event) => void endTokenMove(event)}
                      onPointerCancel={(event) => void endTokenMove(event)}
                      aria-hidden={fogObscured || undefined}
                      tabIndex={fogObscured ? -1 : 0}
                      aria-pressed={selectedTokenIds.includes(token.id)}
                    >
                      {!token.imageUrl && <span>{token.initials}</span>}
                      {token.hp_current !== null &&
                        (hasMasterAccess ||
                          token.owner_user_id === user.uid) && (
                        <small>{token.hp_current}</small>
                      )}
                      {token.is_dead && (
                        <span className="board-token-dead-mark" aria-hidden="true" />
                      )}
                      {tool === "select" &&
                        selectedTokenId === token.id &&
                        selectedTokenIds.length <= 1 &&
                        !token.locked &&
                        canControlToken(token) && (
                          <span
                            className="board-token-resize-handle"
                            data-board-interactive="true"
                            title={t("Ridimensiona {p0} · {p1}×{p2} caselle", { p0: token.name, p1: token.size, p2: token.size })}
                            onPointerDown={(event) =>
                              startTokenResize(event, token)
                            }
                            onPointerMove={resizeToken}
                            onPointerUp={endTokenResize}
                            onPointerCancel={endTokenResize}
                          >
                            <i />
                          </span>
                        )}
                    </button>
                  );
                })}
              </div>

              {movementLine && (
                <span
                  className="movement-line"
                  style={{
                    left: movementLine.x,
                    top: movementLine.y,
                    width: movementLine.width,
                    transform: `rotate(${movementLine.angle}deg)`,
                    "--unrotate": `${-movementLine.angle}deg`,
                  } as React.CSSProperties}
                >
                  <strong>{movementLine.label}</strong>
                </span>
              )}

              {measurementLine && (
                <span
                  className="movement-line ruler-line"
                  style={
                    {
                      left: measurementLine.x,
                      top: measurementLine.y,
                      width: measurementLine.width,
                      transform: `rotate(${measurementLine.angle}deg)`,
                      "--unrotate": `${-measurementLine.angle}deg`,
                    } as React.CSSProperties
                  }
                >
                  <strong>{measurementLine.label}</strong>
                </span>
              )}

              {ping && (
                <span
                  key={ping.id}
                  className="board-ping"
                  style={{ left: ping.x, top: ping.y }}
                >
                  <i />
                  <strong>{ping.label}</strong>
                </span>
              )}
            </div>
          ) : (
            <div className="no-scenes">
              <span>◇</span>
              <strong>{t("Nessuna scena disponibile")}</strong>
              <small>
                {isMaster ? t("Crea la prima scena dal pannello a sinistra.") : t("Il Master sta preparando il tavolo.")}
              </small>
            </div>
          )}
        </div>

        {!tokenSelectionBox && selectedTokenIds.length > 1 && (
          <div
            className="token-selection-summary"
            role="toolbar"
            aria-label={t("Azioni selezione multipla")}
            aria-live="polite"
          >
            <span>
              <strong>{selectedTokenIds.length}</strong>{t(" selezionati")}</span>
            <button
              type="button"
              disabled={deletingTokenSelection}
              onClick={() => void deleteSelectedTokens()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
              </svg>
              {deletingTokenSelection
                ? t("Eliminazione…")
                : t("Elimina {p0} token", { p0: selectedTokenIds.length })}
            </button>
          </div>
        )}

        <div className="board-status">
          <span>
            <strong>{activeScene?.name ?? t("Nessuna scena")}</strong>
            <small>
              {activeScene
                ? t("{p0} {p1} per casella · selezione multipla trascinando sul vuoto · tasto destro per spostare", { p0: activeScene.distance_per_cell, p1: activeScene.distance_unit })
                : t("In attesa")}
            </small>
          </span>
          <span className="zoom-set">
            <button onClick={() => setViewport((current) => ({
              ...current,
              zoom: Math.max(0.25, current.zoom - 0.1),
            }))}>
              −
            </button>
            <strong>{Math.round(zoom * 100)}%</strong>
            <button onClick={() => setViewport((current) => ({
              ...current,
              zoom: Math.min(2, current.zoom + 0.1),
            }))}>
              ＋
            </button>
          </span>
        </div>
      </section>

      <aside
        className={`detail-rail dockable-detail-rail ${
          draggedPanelId ? "panel-drag-active" : ""
        }`}
      >
        <div
          ref={setRightRailTarget}
          className={`rail-panel-stack right-rail-panel-stack ${
            draggedPanelId ? "panel-drag-active" : ""
          }`}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => dropPanelInRail(event, "right")}
        >
          {rightDockedPanelIds.length === 0 && (
            <div className="rail-dock-empty">
              <span aria-hidden="true">◇</span>
              <strong>{t("Barra libera")}</strong>
              <small>{t("Trascina qui una sezione.")}</small>
            </div>
          )}
        </div>
      </aside>

      <button
        className="right-collapse"
        onClick={toggleRightRail}
        aria-label={
          rightCollapsed ? t("Apri pannello dettagli") : t("Chiudi pannello dettagli")
        }
      >
        {rightCollapsed ? "‹" : "›"}
      </button>

      <section
        ref={setFloatingLayerTarget}
        className="floating-panels-layer"
        aria-label={t("Pannelli personali del tavolo")}
      >
        <DockablePanelHost
          id="token"
          title={t("Token")}
          subtitle={selectedToken?.name ?? t("Nessuna selezione")}
          layout={floatingPanelLayouts.token}
          placement={panelDockPlacements.token}
          floatingLayerTarget={floatingLayerTarget}
          leftRailTarget={leftRailTarget}
          rightRailTarget={rightRailTarget}
          draggedPanelId={draggedPanelId}
          onDockedPanelDrop={dropRelativeToDockedPanel}
          onChange={updateFloatingPanelLayout}
          onCommit={saveFloatingPanelLayouts}
          onFocus={focusFloatingPanel}
          onDockDragStart={beginPanelDockDrag}
          onDockDragEnd={finishPanelDockDrag}
        >
          <div className="detail-content">
            {selectedToken && canViewSelectedTokenStats ? (
              <>
                <div className="token-profile">
                  <span
                    style={{
                      "--token-color": selectedToken.color,
                      backgroundImage: selectedToken.imageUrl
                        ? `url("${selectedToken.imageUrl}")`
                        : undefined,
                    } as React.CSSProperties}
                  >
                    {!selectedToken.imageUrl && selectedToken.initials}
                  </span>
                  <div>
                    <small>{t("Token selezionato")}</small>
                    <input
                      value={selectedToken.name}
                      disabled={!canControlToken(selectedToken)}
                      onChange={(event) =>
                        queueTokenUpdate(selectedToken.id, {
                          name: event.target.value,
                        })
                      }
                      onBlur={() =>
                        void flushTokenUpdates(selectedToken.id)
                      }
                    />
                  </div>
                </div>

                <label
                  className={`token-dead-toggle ${
                    selectedToken.is_dead ? "active" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedToken.is_dead}
                    disabled={!canControlToken(selectedToken)}
                    onChange={(event) =>
                      void updateToken({ is_dead: event.target.checked })
                    }
                  />
                  <span>
                    <strong>{t("Token morto")}</strong>
                    <small>{t("Mostra una X rossa sulla mappa")}</small>
                  </span>
                  <i aria-hidden="true">×</i>
                </label>

                <section className="token-detail-section">
                  <button
                    type="button"
                    className={`token-section-toggle ${
                      tokenStatsCollapsed ? "" : "is-expanded"
                    }`}
                    onClick={() =>
                      setTokenStatsCollapsed((collapsed) => !collapsed)
                    }
                    aria-expanded={!tokenStatsCollapsed}
                  >
                    <span>
                      <strong>{t("Statistiche")}</strong>
                      <small>{t("HP, HP max, HP temp, CD e CA")}</small>
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                  </button>

                  {!tokenStatsCollapsed && (
                    <div className="stat-grid">
                      <label>
                        <span>{t("HP")}</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={selectedToken.hp_current ?? ""}
                          onChange={(event) =>
                            queueTokenUpdate(selectedToken.id, {
                              hp_current: nullableNumber(event.target.value),
                            })
                          }
                          onBlur={() =>
                            void flushTokenUpdates(selectedToken.id)
                          }
                        />
                      </label>
                      <label>
                        <span>{t("HP MAX")}</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={selectedToken.hp_max ?? ""}
                          onChange={(event) =>
                            queueTokenUpdate(selectedToken.id, {
                              hp_max: nullableNumber(event.target.value),
                            })
                          }
                          onBlur={() =>
                            void flushTokenUpdates(selectedToken.id)
                          }
                        />
                      </label>
                      <label>
                        <span>{t("HP TEMP")}</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={selectedToken.temp_hp ?? ""}
                          onChange={(event) =>
                            queueTokenUpdate(selectedToken.id, {
                              temp_hp: nullableNumber(event.target.value),
                            })
                          }
                          onBlur={() =>
                            void flushTokenUpdates(selectedToken.id)
                          }
                        />
                      </label>
                      <label>
                        <span>{t("CD")}</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={selectedToken.difficulty_class ?? ""}
                          onChange={(event) =>
                            queueTokenUpdate(selectedToken.id, {
                              difficulty_class: nullableNumber(
                                event.target.value,
                              ),
                            })
                          }
                          onBlur={() =>
                            void flushTokenUpdates(selectedToken.id)
                          }
                        />
                      </label>
                      <label>
                        <span>{t("CA")}</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={selectedToken.armor_class ?? ""}
                          onChange={(event) =>
                            queueTokenUpdate(selectedToken.id, {
                              armor_class: nullableNumber(event.target.value),
                            })
                          }
                          onBlur={() =>
                            void flushTokenUpdates(selectedToken.id)
                          }
                        />
                      </label>
                    </div>
                  )}
                </section>

                <section className="token-detail-section saving-throws">
                  <button
                    type="button"
                    className={`token-section-toggle ${
                      tokenSavesCollapsed ? "" : "is-expanded"
                    }`}
                    onClick={() =>
                      setTokenSavesCollapsed((collapsed) => !collapsed)
                    }
                    aria-expanded={!tokenSavesCollapsed}
                  >
                    <span>
                      <strong>{t("Tiri salvezza")}</strong>
                      <small>{t("FOR, DES, COS, INT, SAG e CAR")}</small>
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                  </button>

                  {!tokenSavesCollapsed && (
                    <div>
                      {SAVING_THROWS.map(
                        (save) => (
                          <label key={save}>
                            {t(save)}
                            <input
                              type="number"
                              placeholder="—"
                              value={selectedToken.saving_throws?.[save] ?? ""}
                              onChange={(event) => {
                                const optimisticSavingThrows =
                                  optimisticTokenPatchesRef.current.get(
                                    selectedToken.id,
                                  )?.saving_throws;
                                queueTokenUpdate(selectedToken.id, {
                                  saving_throws: {
                                    ...(selectedToken.saving_throws ?? {}),
                                    ...(optimisticSavingThrows ?? {}),
                                    [save]: toNumber(event.target.value),
                                  },
                                });
                              }}
                              onBlur={() =>
                                void flushTokenUpdates(selectedToken.id)
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                  )}
                </section>

                <label className="wide-field">
                  <span>{t("Note")}</span>
                  <textarea
                    value={selectedToken.notes ?? ""}
                    placeholder={t("Condizioni, concentrazione…")}
                    onChange={(event) =>
                      queueTokenUpdate(selectedToken.id, {
                        notes: event.target.value || null,
                      })
                    }
                    onBlur={() =>
                      void flushTokenUpdates(selectedToken.id)
                    }
                  />
                </label>

                {selectedTokenCharacter && (
                  <section
                    ref={tokenMacroRef}
                    className="token-detail-section token-macro-section"
                    aria-label={t("Macro di {p0}", { p0: selectedTokenCharacter.name })}
                    onPointerDown={(event) => {
                      if (event.button === 2) event.stopPropagation();
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <button
                      type="button"
                      className={`token-section-toggle ${
                        tokenMacrosCollapsed ? "" : "is-expanded"
                      }`}
                      onClick={() => {
                        setTokenMacrosCollapsed((collapsed) => !collapsed);
                        setMacroMenu(null);
                      }}
                      aria-expanded={!tokenMacrosCollapsed}
                    >
                      <span>
                        <strong>{t("Macro")}</strong>
                        <small>
                          {selectedTokenCharacter.name} ·{" "}
                          {selectedTokenMacros.length === 1
                            ? t("1 macro")
                            : t("{p0} macro", { p0: selectedTokenMacros.length })}
                        </small>
                      </span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </button>

                    {!tokenMacrosCollapsed &&
                      (() => {
                        const { uncategorized, sections } =
                          macroSectionsForCharacter(selectedTokenCharacter.id);
                        return (
                          <>
                            <div className="token-macro-list">
                              {uncategorized.map(renderTokenMacroRow)}
                              {sections.map(
                                (
                                  { category, macros: sectionMacros },
                                  index,
                                ) => (
                                  <Fragment key={category.id}>
                                    {renderCategoryDivider(
                                      category,
                                      "token",
                                      index,
                                      sections.length,
                                      sectionMacros.length,
                                    )}
                                    {expandedMacroCategoryIds.includes(
                                      category.id,
                                    ) &&
                                      (sectionMacros.length > 0 ? (
                                        sectionMacros.map(renderTokenMacroRow)
                                      ) : (
                                        <small className="macro-category-empty">{t("Nessuna macro")}</small>
                                      ))}
                                  </Fragment>
                                ),
                              )}
                              <div className="token-macro-row add">
                                <div className="macro-diamond-wrap macro-diamond-token">
                                  <button
                                    type="button"
                                    className="macro-diamond add"
                                    onClick={() =>
                                      openMacroCreator(
                                        selectedTokenCharacter,
                                        false,
                                      )
                                    }
                                    title={t("Nuova macro per {p0}", { p0: selectedTokenCharacter.name })}
                                    aria-label={t("Nuova macro per {p0}", { p0: selectedTokenCharacter.name })}
                                  >
                                    <span>＋</span>
                                  </button>
                                </div>
                                <span className="token-macro-copy">
                                  <strong>{t("Nuova macro")}</strong>
                                </span>
                              </div>
                              {renderCategoryAddControl(
                                selectedTokenCharacter,
                                "token",
                              )}
                            </div>
                            <p>{t("Condivise con il personaggio e con tutti i suoi token. Click per tirare, trascina per riordinare, click destro per gestire.")}</p>
                          </>
                        );
                      })()}
                  </section>
                )}

                {isMaster && !playerView && (
                  <label className="wide-field">
                    <span>{t("Controllato da")}</span>
                    <select
                      value={selectedToken.owner_user_id ?? ""}
                      disabled={Boolean(selectedToken.character_id)}
                      onChange={(event) =>
                        void updateToken({
                          owner_user_id: event.target.value || null,
                        })
                      }
                    >
                      <option value="">{t("Solo Master")}</option>
                      {members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.character_name ??
                            member.app_users?.display_name ??
                            t("Giocatore")}
                        </option>
                      ))}
                    </select>
                    {selectedToken.character_id && (
                      <small>{t("Il controllo segue il proprietario del personaggio.")}</small>
                    )}
                  </label>
                )}

                {isMaster && !playerView && (
                  <div className="toggle-stack">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedToken.visible_to_players}
                        onChange={(event) =>
                          void updateToken({
                            visible_to_players: event.target.checked,
                          })
                        }
                      />{t("Visibile ai giocatori")}</label>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedToken.locked}
                        onChange={(event) =>
                          void updateToken({ locked: event.target.checked })
                        }
                      />{t("Posizione bloccata")}</label>
                  </div>
                )}

                <div className="detail-actions">
                  {canControlToken(selectedToken) && (
                    <button
                      className="danger-button"
                      onClick={() => void deleteToken()}
                    >{t("Elimina")}</button>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-detail">
                <span>{selectedToken ? "◇" : "↖"}</span>
                <strong>
                  {selectedToken ? t("Statistiche private") : t("Seleziona un token")}
                </strong>
                <small>
                  {selectedToken
                    ? t("Solo il proprietario del token e il Master possono visualizzarle.")
                    : t("Qui trovi HP, CA, CD, tiri salvezza, note e controllo.")}
                </small>
              </div>
            )}
          </div>
        </DockablePanelHost>

        <DockablePanelHost
          id="initiative"
          title={t("Iniziativa")}
          subtitle={t("Round {p0} · {p1} token", { p0: initiativeState?.round ?? 1, p1: displayedInitiativeTokenCount })}
          layout={floatingPanelLayouts.initiative}
          placement={panelDockPlacements.initiative}
          floatingLayerTarget={floatingLayerTarget}
          leftRailTarget={leftRailTarget}
          rightRailTarget={rightRailTarget}
          draggedPanelId={draggedPanelId}
          onDockedPanelDrop={dropRelativeToDockedPanel}
          onChange={updateFloatingPanelLayout}
          onCommit={saveFloatingPanelLayouts}
          onFocus={focusFloatingPanel}
          onDockDragStart={beginPanelDockDrag}
          onDockDragEnd={finishPanelDockDrag}
        >
          <div className="detail-content initiative-panel">
            <div className="round-heading">
              <span>
                <small>{t("Round")}</small>
                <strong>{initiativeState?.round ?? 1}</strong>
              </span>
              {isMaster && !playerView && (
                <button onClick={() => void resetInitiative()}>{t("Reset")}</button>
              )}
            </div>
            {mergeSelectionActive && (
              <button
                type="button"
                className="initiative-merge-button"
                disabled={mergingInitiative}
                onClick={() => void mergeInitiativeSelection()}
              >{t("Unisci iniziativa (")}{mergeableInitiativeTokenIds.length})
              </button>
            )}
            <div className="initiative-list">
              {displayedInitiative.map((entry, index) => {
                const isGroup = !entry.token_id;
                const token = isGroup
                  ? null
                  : revealedTokens.find((item) => item.id === entry.token_id);
                if (!isGroup && !token) return null;
                const members = isGroup
                  ? (initiativeMembersByGroup.get(entry.id) ?? []).filter(
                      (member) => hasMasterAccess ||
                        (member.token_id && revealedTokenIds.has(member.token_id)),
                    )
                  : [];
                const expanded = expandedInitiativeGroupIds.includes(entry.id);
                const renaming = initiativeGroupRename?.entryId === entry.id;
                const menuOpen = initiativeGroupMenuId === entry.id;
                const skipped = deadInitiativeEntryIds.has(entry.id);
                const entryLabel = isGroup
                  ? (entry.group_name ?? t("Gruppo"))
                  : (token?.name ?? "Token");
                const mergeCandidate =
                  mergeSelectionActive &&
                  entry.token_id !== null &&
                  mergeableInitiativeTokenIds.includes(entry.token_id);
                const previousEntry = sortedInitiative[index - 1];
                const nextEntry = sortedInitiative[index + 1];
                const canMoveUp =
                  previousEntry?.initiative === entry.initiative;
                const canMoveDown =
                  nextEntry?.initiative === entry.initiative;
                return (
                  <Fragment key={entry.id}>
                    <div
                      className={`initiative-entry ${
                        hasMasterAccess ? "has-order-controls" : ""
                      } ${
                        initiativeState?.current_entry_id === entry.id
                          ? "active"
                          : ""
                      } ${isGroup ? "group" : ""} ${
                        mergeCandidate ? "merge-candidate" : ""
                      } ${skipped ? "skipped" : ""}`}
                      data-initiative-group={isGroup ? entry.id : undefined}
                      onContextMenu={
                        isGroup && hasMasterAccess
                          ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setInitiativeGroupMenuId((current) =>
                                current === entry.id ? null : entry.id,
                              );
                            }
                          : undefined
                      }
                    >
                      {isGroup ? (
                        renaming && initiativeGroupRename ? (
                          <form
                            className="initiative-group-rename"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void renameInitiativeGroup();
                            }}
                          >
                            <input
                              type="text"
                              value={initiativeGroupRename.name}
                              maxLength={30}
                              autoFocus
                              aria-label={t("Nome del gruppo")}
                              onChange={(event) =>
                                setInitiativeGroupRename((current) =>
                                  current
                                    ? { ...current, name: event.target.value }
                                    : current,
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setInitiativeGroupRename(null);
                                }
                              }}
                            />
                            <button
                              type="submit"
                              aria-label={t("Salva nome del gruppo")}
                            >
                              ✓
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="initiative-entry-select initiative-group-toggle"
                            onClick={() =>
                              toggleInitiativeGroupExpanded(entry.id)
                            }
                            title={
                              hasMasterAccess
                                ? t("Click per espandere · destro per gestire")
                                : t("Click per espandere")
                            }
                            aria-expanded={expanded}
                          >
                            <span>{index + 1}</span>
                            <i className="initiative-group-badge">
                              {members.length}
                            </i>
                            <strong>
                              {entryLabel}
                              {skipped && <small>{t(" · tutti morti")}</small>}
                            </strong>
                            <svg
                              className={expanded ? "is-expanded" : ""}
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path d="m7 10 5 5 5-5" />
                            </svg>
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="initiative-entry-select"
                          onClick={() => {
                            if (!token) return;
                            setSelectedTokenId(token.id);
                            setInspectedTokenId(token.id);
                            setSelectedTokenIds([]);
                          }}
                        >
                          <span>{index + 1}</span>
                          <i
                            style={
                              {
                                "--token-color": token?.color,
                              } as React.CSSProperties
                            }
                          >
                            {token?.initials}
                          </i>
                          <strong>
                            {entryLabel}
                            {skipped && <small>{t(" · morto")}</small>}
                          </strong>
                        </button>
                      )}
                      {hasMasterAccess && (
                        <span
                          className="initiative-order-controls"
                          aria-label={t("Ordine manuale di {p0}", { p0: entryLabel })}
                        >
                          <button
                            type="button"
                            disabled={!canMoveUp || initiativeSwapPending}
                            onClick={() =>
                              void swapEqualInitiativeEntries(entry.id, -1)
                            }
                            title={
                              canMoveUp
                                ? t("Sposta prima della voce a pari iniziativa")
                                : t("Nessuna voce a pari iniziativa sopra")
                            }
                            aria-label={t("Sposta {p0} verso l’alto", { p0: entryLabel })}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="m7 14 5-5 5 5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown || initiativeSwapPending}
                            onClick={() =>
                              void swapEqualInitiativeEntries(entry.id, 1)
                            }
                            title={
                              canMoveDown
                                ? t("Sposta dopo la voce a pari iniziativa")
                                : t("Nessuna voce a pari iniziativa sotto")
                            }
                            aria-label={t("Sposta {p0} verso il basso", { p0: entryLabel })}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="m7 10 5 5 5-5" />
                            </svg>
                          </button>
                        </span>
                      )}
                      <input
                        type="number"
                        value={entry.initiative ?? ""}
                        placeholder="—"
                        disabled={!isMaster || playerView}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          void updateInitiative(entry.id, event.target.value)
                        }
                      />
                      {menuOpen && (
                        <div
                          className="initiative-group-menu"
                          role="menu"
                          data-initiative-group={entry.id}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setInitiativeGroupMenuId(null);
                              setInitiativeGroupRename({
                                entryId: entry.id,
                                name: entry.group_name ?? "",
                              });
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
                            </svg>{t("Rinomina")}</button>
                          <button
                            type="button"
                            className="danger"
                            role="menuitem"
                            onClick={() => void deleteInitiativeGroup(entry)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                            </svg>{t("Sciogli gruppo")}</button>
                        </div>
                      )}
                    </div>
                    {isGroup &&
                      expanded &&
                      members.map((member) => {
                        const memberToken = revealedTokens.find(
                          (item) => item.id === member.token_id,
                        );
                        if (!memberToken) return null;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            className={`initiative-group-member ${
                              mergeSelectionActive &&
                              member.token_id !== null &&
                              mergeableInitiativeTokenIds.includes(
                                member.token_id,
                              )
                                ? "merge-candidate"
                                : ""
                            } ${memberToken.is_dead ? "dead" : ""}`}
                            onClick={() => {
                              setSelectedTokenId(memberToken.id);
                              setInspectedTokenId(memberToken.id);
                              setSelectedTokenIds([]);
                            }}
                          >
                            <i
                              style={
                                {
                                  "--token-color": memberToken.color,
                                } as React.CSSProperties
                              }
                            >
                              {memberToken.initials}
                            </i>
                            <span>{memberToken.name}</span>
                          </button>
                        );
                      })}
                  </Fragment>
                );
              })}
              {displayedInitiative.length === 0 && (
                <div className="empty-initiative">{t("Nessun token in iniziativa.")}</div>
              )}
            </div>
            {isMaster && !playerView && (
              <button
                className="next-turn-button"
                disabled={runnableInitiative.length === 0}
                onClick={() => void advanceInitiative()}
              >{t("Prossimo turno ")}<span>→</span>
              </button>
            )}
          </div>
        </DockablePanelHost>

        <DockablePanelHost
          id="rolls"
          title={t("Rolls")}
          layout={floatingPanelLayouts.rolls}
          placement={panelDockPlacements.rolls}
          floatingLayerTarget={floatingLayerTarget}
          leftRailTarget={leftRailTarget}
          rightRailTarget={rightRailTarget}
          draggedPanelId={draggedPanelId}
          onDockedPanelDrop={dropRelativeToDockedPanel}
          onChange={updateFloatingPanelLayout}
          onCommit={saveFloatingPanelLayouts}
          onFocus={focusFloatingPanel}
          onDockDragStart={beginPanelDockDrag}
          onDockDragEnd={finishPanelDockDrag}
        >
          <div className="detail-content dice-roll-log-panel">
            {diceRollLog.length > 0 ? (
              <div className="dice-roll-log-list">
                {diceRollLog.slice(0, DICE_ROLL_LOG_LIMIT).map((entry) => {
                  const showMacroName = canSeeMacroRollName(entry);
                  const title =
                    entry.roll_kind === "quick_die"
                      ? entry.roller_name
                      : showMacroName
                        ? entry.roll_name
                        : entry.actor_name;
                  const subtitle =
                    entry.roll_kind === "macro" && showMacroName
                      ? entry.actor_name
                      : null;

                  return (
                    <article
                      className={`dice-roll-log-entry ${
                        subtitle ? "" : "without-actor"
                      }`}
                      key={entry.id}
                      style={
                        {
                          "--roller-color": rollerColor(entry.roller_user_id),
                        } as React.CSSProperties
                      }
                    >
                      <strong className="dice-roll-log-name" title={title}>
                        {entry.details?.comparison
                          ? `${entry.details.comparison.mode.toUpperCase()} · ${title}`
                          : title}
                      </strong>
                      {subtitle && (
                        <span className="dice-roll-log-actor">
                          {subtitle}
                        </span>
                      )}
                      <output>{entry.total}</output>
                      {entry.roll_kind === "macro" &&
                      ((entry.details?.dice ?? []).some(
                        (die) => die.damage_type,
                      ) ||
                        (entry.details?.bonuses ?? []).some(
                          (bonus) => bonus.damage_type,
                        )) ? (
                        <code className="dice-roll-log-breakdown-lines">
                          {entry.details.comparison && (
                            <span className="dice-roll-comparison">
                              {localizeRollBreakdown(macroRollComparisonSummary(entry.details.comparison), getLanguage())}
                            </span>
                          )}
                          {damageRollBreakdownLines(entry.details).map(
                            (line) => (
                              <span
                                key={line.key}
                                className={line.subtotal ? "subtotal" : ""}
                              >
                                {line.text}
                              </span>
                            ),
                          )}
                        </code>
                      ) : (
                        <code>{localizeRollBreakdown(entry.breakdown, getLanguage())}</code>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="dice-roll-log-empty">
                <span aria-hidden="true">◇</span>
                <strong>{t("Nessun tiro registrato")}</strong>
                <small>{t("Qui compariranno automaticamente macro e dadi rapidi usati dal gruppo.")}</small>
              </div>
            )}
          </div>
        </DockablePanelHost>

        {isMaster && !playerView && (
          <DockablePanelHost
            id="scene"
            title={t("Scena")}
            subtitle={activeScene?.name ?? t("Nessuna scena")}
            layout={floatingPanelLayouts.scene}
            placement={panelDockPlacements.scene}
            floatingLayerTarget={floatingLayerTarget}
            leftRailTarget={leftRailTarget}
            rightRailTarget={rightRailTarget}
            draggedPanelId={draggedPanelId}
            onDockedPanelDrop={dropRelativeToDockedPanel}
            onChange={updateFloatingPanelLayout}
            onCommit={saveFloatingPanelLayouts}
            onFocus={focusFloatingPanel}
            onDockDragStart={beginPanelDockDrag}
            onDockDragEnd={finishPanelDockDrag}
          >
            {activeScene ? (
              <div className="detail-content scene-settings">
            <div className="scene-action-card">
              <small>{t("Visibile al gruppo")}</small>
              <strong>
                {activeScene.id === campaign.player_scene_id
                  ? t("Questa scena è live")
                  : t("I giocatori vedono un’altra scena")}
              </strong>
              <button
                disabled={activeScene.id === campaign.player_scene_id}
                onClick={() => void showSceneToPlayers()}
              >{t("Mostra ai giocatori")}</button>
            </div>

            <button
              className="map-upload-wide"
              disabled={uploading}
              onClick={() => mapInputRef.current?.click()}
            >
              <span>▧</span>
              <strong>{uploading ? t("Caricamento…") : t("Carica mappa dal PC")}</strong>
              <small>{t("PNG, JPG o WebP · max 15 MB")}</small>
            </button>

            <label className="wide-field">
              <span>{t("Nome scena")}</span>
              <input
                value={activeScene.name}
                onChange={(event) =>
                  setScenes((current) =>
                    current.map((scene) =>
                      scene.id === activeScene.id
                        ? { ...scene, name: event.target.value }
                        : scene,
                    ),
                  )
                }
                onBlur={(event) => void updateScene({ name: event.target.value })}
              />
            </label>

            <section className="map-scale-control">
              <header>
                <span>
                  <strong>{t("Dimensione casella")}</strong>
                  <small>{t("Mappa invariata · griglia ")}{activeGridColumns} ×{" "}
                    {activeGridRows}{t(" caselle")}</small>
                </span>
                <output>{activeScene.grid_cell_px}{t(" px")}</output>
              </header>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    updateGridCellSize(activeScene.grid_cell_px - 4)
                  }
                  aria-label={t("Rendi la griglia più fitta")}
                >
                  −
                </button>
                <input
                  type="range"
                  min="12"
                  max="240"
                  step="2"
                  value={activeScene.grid_cell_px}
                  onChange={(event) =>
                    updateGridCellSize(toNumber(event.target.value, 56))
                  }
                  aria-label={t("Dimensione delle caselle della griglia")}
                />
                <button
                  type="button"
                  onClick={() =>
                    updateGridCellSize(activeScene.grid_cell_px + 4)
                  }
                  aria-label={t("Ingrandisci le caselle della griglia")}
                >
                  ＋
                </button>
              </div>
              <footer>
                <span>{t("Più fitta")}</span>
                <span>{t("Caselle più grandi")}</span>
              </footer>
            </section>

            <div className="scene-grid-settings single-field">
              <label>
                <span>{t("Distanza per casella")}</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={activeScene.distance_per_cell}
                  onChange={(event) =>
                    void updateScene({
                      distance_per_cell: Math.max(
                        0.1,
                        toNumber(event.target.value, 5),
                      ),
                    })
                  }
                />
              </label>
            </div>

            <label className="wide-field">
              <span>{t("Unità")}</span>
              <select
                value={activeScene.distance_unit}
                onChange={(event) =>
                  void updateScene({
                    distance_unit: event.target.value as "ft" | "m",
                  })
                }
              >
                <option value="ft">{t("Piedi (ft)")}</option>
                <option value="m">{t("Metri (m)")}</option>
              </select>
            </label>
            <div className="toggle-stack">
              <label>
                <input
                  type="checkbox"
                  checked={activeScene.grid === "square"}
                  onChange={(event) =>
                    void updateScene({
                      grid: event.target.checked ? "square" : "none",
                    })
                  }
                />{t("Mostra griglia")}</label>
              <label>
                <input
                  type="checkbox"
                  checked={activeScene.fog_enabled}
                  onChange={(event) =>
                    void updateScene({ fog_enabled: event.target.checked })
                  }
                />{t("Nebbia attiva")}</label>
            </div>

            <section className="scene-danger-zone">
              <span>
                <strong>{t("Elimina scena")}</strong>
                <small>{t("Rimuove definitivamente la scena e tutto ciò che contiene.")}</small>
              </span>
              <button
                type="button"
                className="danger-button"
                disabled={deletingSceneId === activeScene.id}
                onClick={() => void deleteScene()}
              >
                {deletingSceneId === activeScene.id
                  ? t("Eliminazione…")
                  : t("Elimina scena")}
              </button>
            </section>
              </div>
            ) : (
              <div className="detail-content">
                <div className="empty-detail">
                  <span>◇</span>
                  <strong>{t("Nessuna scena")}</strong>
                  <small>{t("Crea o seleziona una scena dal pannello a sinistra.")}</small>
                </div>
              </div>
            )}
          </DockablePanelHost>
        )}
      </section>

      <input
        ref={mapInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void uploadMap(event)}
      />

      {profileOpen && (
        <section
          className="profile-page"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-page-title"
        >
          <header className="profile-page-header">
            <button
              type="button"
              className="profile-back"
              onClick={() => setProfileOpen(false)}
            >
              <span aria-hidden="true">←</span>{t("Torna al tavolo")}</button>
            <span className="profile-page-brand">
              <i className="brand-rune small">V</i>
              <strong>Vers</strong>
            </span>
            <LanguageToggle />
          </header>

          <main className="profile-page-content">
            <form
              className="profile-card"
              onSubmit={(event) => {
                event.preventDefault();
                void saveUserProfile();
              }}
            >
              <div className="profile-card-heading">
                <small>{t("Account personale")}</small>
                <h1 id="profile-page-title">{t("Il tuo profilo")}</h1>
                <p>{t("Scegli come comparire dentro Vers. L’accesso continuerà a usare il tuo account Google.")}</p>
              </div>

              <div className="profile-identity">
                <span>
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoURL} alt="" />
                  ) : (
                    initialsFor(profileDisplayName)
                  )}
                </span>
                <div>
                  <strong>{profileDisplayName}</strong>
                  <small>{user.email}</small>
                </div>
              </div>

              <div className="profile-fields">
                <label>
                  <span>{t("Nome")}</span>
                  <input
                    type="text"
                    value={profileFirstName}
                    maxLength={80}
                    autoComplete="given-name"
                    onChange={(event) =>
                      setProfileFirstName(event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>{t("Cognome")}</span>
                  <input
                    type="text"
                    value={profileLastName}
                    maxLength={80}
                    autoComplete="family-name"
                    onChange={(event) =>
                      setProfileLastName(event.target.value)
                    }
                  />
                </label>
                <label className="profile-nickname-field">
                  <span>{t("Nickname")}</span>
                  <input
                    type="text"
                    value={profileNickname}
                    maxLength={40}
                    autoComplete="nickname"
                    placeholder={t("Come vuoi essere chiamato")}
                    onChange={(event) =>
                      setProfileNickname(event.target.value)
                    }
                  />
                  <small>{t("Se presente, sarà il nome mostrato agli altri giocatori.")}</small>
                </label>
              </div>

              <div className="profile-actions">
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => setProfileOpen(false)}
                >{t("Annulla")}</button>
                <button type="submit" disabled={savingProfile}>
                  {savingProfile ? t("Salvataggio…") : t("Salva profilo")}
                </button>
              </div>
            </form>
          </main>
        </section>
      )}

      {macroEditorOpen && macroEditorCharacter && (
        <div className="macro-editor-scrim">
          <section
            className="macro-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="macro-editor-title"
          >
            <div className="macro-editor-heading">
              <span>
                <small>{macroEditorCharacter.name}</small>
                <strong id="macro-editor-title">
                  {editingMacroId ? t("Modifica macro") : t("Nuova macro")}
                </strong>
              </span>
              <button
                type="button"
                disabled={savingMacro}
                onClick={closeMacroEditor}
                aria-label={t("Chiudi")}
              >
                ×
              </button>
            </div>

            <label className="macro-name-field">
              <span>{t("Nome breve")}</span>
              <input
                type="text"
                value={macroName}
                maxLength={MACRO_NAME_MAX_LENGTH}
                autoFocus
                placeholder={t("Es. Attacco")}
                onChange={(event) => setMacroName(event.target.value)}
              />
              <small>{t("Nel rombo vedrai: ")}{macroAbbreviation(macroName) || "…"}</small>
            </label>

            <label className="macro-description-field">
              <span>{t("Descrizione")}</span>
              <textarea
                value={macroDescription}
                maxLength={120}
                rows={2}
                placeholder={t("Es. Perforante e fuoco, se buffato")}
                onChange={(event) => setMacroDescription(event.target.value)}
              />
              <small>{t("Opzionale · ")}{macroDescription.length}{t("/120. Nei token apparirà sotto il nome; sulla board nel menu al click destro.")}</small>
            </label>

            <label className="damage-macro-toggle">
              <input
                type="checkbox"
                checked={macroIsDamage}
                onChange={(event) => setMacroIsDamage(event.target.checked)}
              />
              <span>
                <strong>{t("Damage macro")}</strong>
                <small>{t("Associa opzionalmente un tipo di danno a ogni dado e bonus.")}</small>
              </span>
            </label>

            <label className="macro-category-field">
              <span>{t("Sezione")}</span>
              <select
                value={macroCategoryId ?? ""}
                onChange={(event) =>
                  setMacroCategoryId(event.target.value || null)
                }
              >
                <option value="">{t("Senza sezione")}</option>
                {(categoriesByCharacter.get(macroEditorCharacter.id) ?? []).map(
                  (category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ),
                )}
              </select>
              <small>{t("Raggruppa la macro sotto un divider sulla board e nel token.")}</small>
            </label>

            <div className="macro-formula-preview">
              <small>{t("Formula")}</small>
              <strong>
                {macroExpression(
                  expandDiceByCounts(macroDiceSides, macroDiceCounts),
                  macroBonuses,
                )}
              </strong>
            </div>

            <div className="macro-builders">
              <section>
                <div className="macro-builder-heading">
                  <span>
                    <strong>{t("Dadi")}</strong>
                    <small>{t("Quantità × facce, max 50 dadi totali.")}</small>
                  </span>
                  <button
                    type="button"
                    disabled={
                      expandDiceByCounts(macroDiceSides, macroDiceCounts)
                        .length >= 50
                    }
                    onClick={() => {
                      setMacroDiceSides((current) => [...current, 6]);
                      setMacroDiceCounts((current) => [...current, 1]);
                      setMacroDiceDamageTypes((current) => [...current, ""]);
                    }}
                  >{t("＋ Dado")}</button>
                </div>
                <div
                  className={`macro-module-list ${
                    macroIsDamage ? "damage-enabled" : ""
                  }`}
                >
                  {macroDiceSides.map((sides, index) => (
                    <div
                      className={`macro-module dice ${
                        macroIsDamage ? "damage-enabled" : ""
                      }`}
                      key={`die-${index}`}
                    >
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={macroDiceCounts[index] ?? 1}
                        aria-label={t("Quantità del dado {p0}", { p0: index + 1 })}
                        onChange={(event) =>
                          setMacroDiceCounts((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index
                                ? toNumber(event.target.value, 1)
                                : value,
                            ),
                          )
                        }
                      />
                      <span>{t("d")}</span>
                      <input
                        type="number"
                        min="2"
                        max="10000"
                        value={sides}
                        aria-label={t("Facce dado {p0}", { p0: index + 1 })}
                        onChange={(event) =>
                          setMacroDiceSides((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index
                                ? toNumber(event.target.value)
                                : value,
                            ),
                          )
                        }
                      />
                      {macroIsDamage && (
                        <DamageTypePicker
                          value={macroDiceDamageTypes[index] ?? ""}
                          label={t("Tipo di danno del dado {p0}", { p0: index + 1 })}
                          onChange={(value) =>
                            setMacroDiceDamageTypes((current) =>
                              current.map((currentValue, currentIndex) =>
                                currentIndex === index ? value : currentValue,
                              ),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        disabled={macroDiceSides.length === 1}
                        onClick={() => {
                          setMacroDiceSides((current) =>
                            current.filter((_, currentIndex) =>
                              currentIndex !== index,
                            ),
                          );
                          setMacroDiceCounts((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                          setMacroDiceDamageTypes((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                        }}
                        aria-label={t("Rimuovi dado {p0}", { p0: index + 1 })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="macro-builder-heading">
                  <span>
                    <strong>{t("Bonus fissi")}</strong>
                    <small>{t("Puoi usare anche valori negativi.")}</small>
                  </span>
                  <button
                    type="button"
                    disabled={macroBonuses.length >= 50}
                    onClick={() => {
                      setMacroBonuses((current) => [...current, 0]);
                      setMacroBonusDamageTypes((current) => [...current, ""]);
                    }}
                  >{t("＋ Bonus")}</button>
                </div>
                <div
                  className={`macro-module-list ${
                    macroIsDamage ? "damage-enabled" : ""
                  }`}
                >
                  {macroBonuses.map((bonus, index) => (
                    <div
                      className={`macro-module ${
                        macroIsDamage ? "damage-enabled" : ""
                      }`}
                      key={`bonus-${index}`}
                    >
                      <span>±</span>
                      <input
                        type="number"
                        value={bonus}
                        aria-label={t("Bonus {p0}", { p0: index + 1 })}
                        onChange={(event) =>
                          setMacroBonuses((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index
                                ? toNumber(event.target.value)
                                : value,
                            ),
                          )
                        }
                      />
                      {macroIsDamage && (
                        <DamageTypePicker
                          value={macroBonusDamageTypes[index] ?? ""}
                          label={t("Tipo di danno del bonus {p0}", { p0: index + 1 })}
                          onChange={(value) =>
                            setMacroBonusDamageTypes((current) =>
                              current.map((currentValue, currentIndex) =>
                                currentIndex === index ? value : currentValue,
                              ),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMacroBonuses((current) =>
                            current.filter((_, currentIndex) =>
                              currentIndex !== index,
                            ),
                          );
                          setMacroBonusDamageTypes((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                        }}
                        aria-label={t("Rimuovi bonus {p0}", { p0: index + 1 })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {macroBonuses.length === 0 && (
                    <small className="macro-modules-empty">{t("Nessun bonus fisso.")}</small>
                  )}
                </div>
              </section>
            </div>

            <div className="macro-editor-actions">
              <button
                type="button"
                disabled={savingMacro}
                onClick={closeMacroEditor}
              >{t("Annulla")}</button>
              <button
                type="button"
                disabled={
                  savingMacro ||
                  macroName.trim() === "" ||
                  macroDiceSides.length === 0
                }
                onClick={() => void saveMacro()}
              >
                {savingMacro ? t("Salvataggio…") : t("Salva macro")}
              </button>
            </div>
          </section>
        </div>
      )}

      {temporaryBonusMacro && temporaryBonusCharacter && (
        <div className="macro-editor-scrim">
          <section
            className="macro-editor macro-temporary-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="temporary-bonus-editor-title"
          >
            <div className="macro-editor-heading">
              <span>
                <small>
                  {temporaryBonusCharacter.name} · {temporaryBonusMacro.name}
                </small>
                <strong id="temporary-bonus-editor-title">{t("Bonus temp")}</strong>
              </span>
              <button
                type="button"
                disabled={savingTemporaryBonus}
                onClick={closeTemporaryBonusEditor}
                aria-label={t("Chiudi")}
              >
                ×
              </button>
            </div>

            <p className="macro-temporary-description">{t("Questi elementi si sommano a ogni lancio della macro finché non li rimuovi. La formula base non viene modificata.")}</p>
            {temporaryBonusMacro.is_damage_macro && (
              <p className="macro-damage-note">{t("Questa è una Damage macro: puoi assegnare un tipo anche a ogni dado o bonus temporaneo.")}</p>
            )}

            <div className="macro-formula-preview temporary">
              <small>{t("Aggiunta temporanea")}</small>
              <strong>
                {macroExpression(temporaryDiceSides, temporaryBonuses) ||
                  t("Nessun bonus configurato")}
              </strong>
              <span>{t("Tiro completo ·")}{" "}
                {macroExpression(
                  [
                    ...temporaryBonusMacro.dice_sides,
                    ...temporaryDiceSides,
                  ],
                  [...temporaryBonusMacro.bonuses, ...temporaryBonuses],
                )}
              </span>
            </div>

            <div className="macro-builders">
              <section>
                <div className="macro-builder-heading">
                  <span>
                    <strong>{t("Dadi temporanei")}</strong>
                    <small>{t("Si aggiungono ai dadi della formula base.")}</small>
                  </span>
                  <button
                    type="button"
                    disabled={temporaryDiceSides.length >= 50}
                    onClick={() => {
                      setTemporaryDiceSides((current) => [...current, 6]);
                      setTemporaryDiceDamageTypes((current) => [
                        ...current,
                        "",
                      ]);
                    }}
                  >{t("＋ Dado")}</button>
                </div>
                <div
                  className={`macro-module-list ${
                    temporaryBonusMacro.is_damage_macro
                      ? "damage-enabled"
                      : ""
                  }`}
                >
                  {temporaryDiceSides.map((sides, index) => (
                    <div
                      className={`macro-module ${
                        temporaryBonusMacro.is_damage_macro
                          ? "damage-enabled"
                          : ""
                      }`}
                      key={`temp-die-${index}`}
                    >
                      <span>{t("d")}</span>
                      <input
                        type="number"
                        min="2"
                        max="10000"
                        value={sides}
                        aria-label={t("Facce dado temporaneo {p0}", { p0: index + 1 })}
                        onChange={(event) =>
                          setTemporaryDiceSides((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index
                                ? toNumber(event.target.value)
                                : value,
                            ),
                          )
                        }
                      />
                      {temporaryBonusMacro.is_damage_macro && (
                        <DamageTypePicker
                          value={temporaryDiceDamageTypes[index] ?? ""}
                          label={t("Tipo di danno del dado temporaneo {p0}", { p0: index + 1 })}
                          onChange={(value) =>
                            setTemporaryDiceDamageTypes((current) =>
                              current.map((currentValue, currentIndex) =>
                                currentIndex === index ? value : currentValue,
                              ),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTemporaryDiceSides((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                          setTemporaryDiceDamageTypes((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                        }}
                        aria-label={t("Rimuovi dado temporaneo {p0}", { p0: index + 1 })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {temporaryDiceSides.length === 0 && (
                    <small className="macro-modules-empty">{t("Nessun dado temporaneo.")}</small>
                  )}
                </div>
              </section>

              <section>
                <div className="macro-builder-heading">
                  <span>
                    <strong>{t("Bonus fissi temporanei")}</strong>
                    <small>{t("Accetta anche modificatori negativi.")}</small>
                  </span>
                  <button
                    type="button"
                    disabled={temporaryBonuses.length >= 50}
                    onClick={() => {
                      setTemporaryBonuses((current) => [...current, 0]);
                      setTemporaryBonusDamageTypes((current) => [
                        ...current,
                        "",
                      ]);
                    }}
                  >{t("＋ Bonus")}</button>
                </div>
                <div
                  className={`macro-module-list ${
                    temporaryBonusMacro.is_damage_macro
                      ? "damage-enabled"
                      : ""
                  }`}
                >
                  {temporaryBonuses.map((bonus, index) => (
                    <div
                      className={`macro-module ${
                        temporaryBonusMacro.is_damage_macro
                          ? "damage-enabled"
                          : ""
                      }`}
                      key={`temp-bonus-${index}`}
                    >
                      <span>±</span>
                      <input
                        type="number"
                        value={bonus}
                        aria-label={t("Bonus temporaneo {p0}", { p0: index + 1 })}
                        onChange={(event) =>
                          setTemporaryBonuses((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index
                                ? toNumber(event.target.value)
                                : value,
                            ),
                          )
                        }
                      />
                      {temporaryBonusMacro.is_damage_macro && (
                        <DamageTypePicker
                          value={temporaryBonusDamageTypes[index] ?? ""}
                          label={t("Tipo di danno del bonus temporaneo {p0}", { p0: index + 1 })}
                          onChange={(value) =>
                            setTemporaryBonusDamageTypes((current) =>
                              current.map((currentValue, currentIndex) =>
                                currentIndex === index ? value : currentValue,
                              ),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTemporaryBonuses((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                          setTemporaryBonusDamageTypes((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          );
                        }}
                        aria-label={t("Rimuovi bonus temporaneo {p0}", { p0: index + 1 })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {temporaryBonuses.length === 0 && (
                    <small className="macro-modules-empty">{t("Nessun bonus fisso temporaneo.")}</small>
                  )}
                </div>
              </section>
            </div>

            <div className="macro-editor-actions">
              {hasTemporaryMacroBonus(temporaryBonusMacro) && (
                <button
                  type="button"
                  className="danger"
                  disabled={savingTemporaryBonus}
                  onClick={() => void removeTemporaryBonus()}
                >{t("Rimuovi bonus temp")}</button>
              )}
              <button
                type="button"
                disabled={savingTemporaryBonus}
                onClick={closeTemporaryBonusEditor}
              >{t("Annulla")}</button>
              <button
                type="button"
                disabled={
                  savingTemporaryBonus ||
                  (temporaryDiceSides.length === 0 &&
                    temporaryBonuses.length === 0)
                }
                onClick={() => void saveTemporaryBonus()}
              >
                {savingTemporaryBonus ? t("Salvataggio…") : t("Salva bonus temp")}
              </button>
            </div>
          </section>
        </div>
      )}

      {characterCreatorOpen && (
        <div className="character-creator-scrim">
          <section
            className="character-creator"
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-creator-title"
          >
            <div className="character-creator-heading">
              <span>
                <small>
                  {characterLibraryKind === "npc"
                    ? t("Libreria della campagna")
                    : t("Libreria personale")}
                </small>
                <strong id="character-creator-title">
                  {editingCharacter
                    ? characterLibraryKind === "npc"
                      ? t("Modifica NPC")
                      : t("Modifica personaggio")
                    : characterLibraryKind === "npc"
                      ? t("Nuovo NPC")
                      : t("Nuovo personaggio")}
                </strong>
              </span>
              <button
                type="button"
                disabled={creatingCharacter}
                onClick={closeCharacterEditor}
                aria-label={t("Chiudi")}
              >
                ×
              </button>
            </div>
            <p>
              {editingCharacter
                ? characterLibraryKind === "npc"
                  ? t("Aggiorna il nome o sostituisci il token dell’NPC. Le macro restano collegate a questo NPC.")
                  : t("Aggiorna il nome o sostituisci il token. Le modifiche saranno disponibili in tutte le campagne.")
                : characterLibraryKind === "npc"
                  ? t("L’NPC sarà disponibile ai Master di questa campagna.")
                  : t("Il personaggio sarà tuo e disponibile in tutte le campagne.")}
            </p>
            <label>
              <span>{t("Nome")}</span>
              <input
                type="text"
                value={characterName}
                maxLength={80}
                autoFocus
                placeholder={
                  characterLibraryKind === "npc"
                    ? t("Nome dell’NPC")
                    : t("Nome del personaggio")
                }
                onChange={(event) => setCharacterName(event.target.value)}
              />
              <small>
                {characterLibraryKind === "npc"
                  ? t("Deve essere unico tra gli NPC della campagna.")
                  : t("Deve essere unico tra i tuoi personaggi.")}
              </small>
            </label>
            <label>
              <span>
                {editingCharacter ? t("Nuovo token (opzionale)") : t("Token")}
              </span>
              <input
                ref={characterInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setCharacterFile(event.target.files?.[0] ?? null)
                }
              />
              <small>
                {characterFile?.name ??
                  (editingCharacter
                    ? t("Lascia vuoto per mantenere il token attuale")
                    : t("PNG, JPG o WebP"))}
                </small>
            </label>
            <section className="character-stats-editor">
              <button
                type="button"
                className={`token-section-toggle ${
                  characterStatsExpanded ? "is-expanded" : ""
                }`}
                onClick={() =>
                  setCharacterStatsExpanded((expanded) => !expanded)
                }
                aria-expanded={characterStatsExpanded}
              >
                <span>
                  <strong>{t("Statistiche base")}</strong>
                  <small>{t("Opzionali · copiate nei nuovi token")}</small>
                </span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </button>

              {characterStatsExpanded && (
                <div className="character-stats-fields">
                  <div className="stat-grid">
                    {(
                      [
                        ["hp_current", t("HP")],
                        ["hp_max", t("HP MAX")],
                        ["difficulty_class", t("CD")],
                        ["armor_class", t("CA")],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field}>
                        <span>{label}</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={characterStatsDraft[field]}
                          onChange={(event) =>
                            setCharacterStatsDraft((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <div className="saving-throws character-saving-throws">
                    <span>{t("TIRI SALVEZZA")}</span>
                    <div>
                      {SAVING_THROWS.map((save) => (
                        <label key={save}>
                          {t(save)}
                          <input
                            type="number"
                            placeholder="—"
                            value={characterStatsDraft.saving_throws[save]}
                            onChange={(event) =>
                              setCharacterStatsDraft((current) => ({
                                ...current,
                                saving_throws: {
                                  ...current.saving_throws,
                                  [save]: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="character-stat-wide">
                    <span>{t("VELOCITÀ (FT)")}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={characterStatsDraft.speed_ft}
                      onChange={(event) =>
                        setCharacterStatsDraft((current) => ({
                          ...current,
                          speed_ft: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="character-stat-wide">
                    <span>{t("NOTE")}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      placeholder={t("Annotazioni opzionali")}
                      value={characterStatsDraft.notes}
                      onChange={(event) =>
                        setCharacterStatsDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </section>
            <div className="character-creator-actions">
              <button
                type="button"
                disabled={creatingCharacter}
                onClick={closeCharacterEditor}
              >{t("Annulla")}</button>
              <button
                type="button"
                disabled={
                  creatingCharacter ||
                  characterName.trim() === "" ||
                  (!editingCharacter && !characterFile)
                }
                onClick={() =>
                  void (editingCharacter
                    ? updateCharacter()
                    : createCharacter())
                }
              >
                {creatingCharacter
                  ? editingCharacter
                    ? t("Salvataggio…")
                    : t("Creazione…")
                  : editingCharacter
                    ? t("Salva modifiche")
                    : characterLibraryKind === "npc"
                      ? t("Crea NPC")
                      : t("Crea personaggio")}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast success">{t(notice)}</div>}
      {error && (
        <button className="toast error" onClick={() => setError("")}>
          {errorText(error)}
        </button>
      )}
      {uploading && <div className="upload-scrim">{t("Caricamento file…")}</div>}
    </main>
  );
}
