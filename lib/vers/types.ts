export type CampaignRole = "master" | "player";
export type GridKind = "square" | "none";
export type Tool =
  | "select"
  | "draw"
  | "erase"
  | "measure"
  | "reveal"
  | "hide";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  player_scene_id: string | null;
}

export interface Membership {
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  character_name: string | null;
  app_users?: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export interface CampaignChoice {
  campaign: Campaign;
  membership: Membership;
}

export interface Asset {
  id: string;
  campaign_id: string;
  kind: "map" | "token" | "prop";
  name: string;
  storage_path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  signedUrl?: string;
}

export interface SceneAssetPlacement {
  id: string;
  scene_id: string;
  asset_id: string;
  created_by_uid: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  visible_to_players: boolean;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  owner_user_id: string | null;
  campaign_id: string | null;
  kind: "player" | "npc";
  name: string;
  token_storage_path: string;
  token_mime_type: string | null;
  token_width: number | null;
  token_height: number | null;
  hp_current: number | null;
  hp_max: number | null;
  armor_class: number | null;
  difficulty_class: number | null;
  saving_throws: Record<string, number> | null;
  speed_ft: number | null;
  notes: string | null;
  signedUrl?: string;
}

export type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

export type DamageTypeValue = DamageType | "";

export interface CharacterMacroCategory {
  id: string;
  character_id: string;
  name: string;
  sort_order: number;
}

export interface CharacterMacro {
  id: string;
  character_id: string;
  category_id: string | null;
  name: string;
  description: string;
  is_damage_macro: boolean;
  dice_sides: number[];
  dice_damage_types: DamageTypeValue[];
  bonuses: number[];
  bonus_damage_types: DamageTypeValue[];
  temporary_dice_sides: number[];
  temporary_dice_damage_types: DamageTypeValue[];
  temporary_bonuses: number[];
  temporary_bonus_damage_types: DamageTypeValue[];
  sort_order: number;
}

export type MacroRollMode = "normal" | "adv" | "dis";

export interface MacroRollComparison {
  mode: "adv" | "dis";
  rolls: [
    { dice: number[]; total: number },
    { dice: number[]; total: number },
  ];
  selected: 0 | 1;
}

export interface DiceRollLogEntry {
  id: string;
  campaign_id: string;
  scene_id: string | null;
  roller_user_id: string;
  character_id: string | null;
  roll_kind: "quick_die" | "macro";
  actor_name: string;
  roller_name: string;
  roll_name: string;
  formula: string;
  breakdown: string;
  total: number;
  details: {
    comparison?: MacroRollComparison;
    dice: Array<{
      sides: number;
      result: number;
      temporary: boolean;
      damage_type: DamageTypeValue;
    }>;
    bonuses: Array<{
      value: number;
      temporary: boolean;
      damage_type: DamageTypeValue;
    }>;
  };
  created_at: string;
}

export interface Scene {
  id: string;
  campaign_id: string;
  name: string;
  sort_order: number;
  is_enabled: boolean;
  map_asset_id: string | null;
  grid: GridKind;
  grid_columns: number;
  grid_rows: number;
  grid_cell_px: number;
  map_width_px: number;
  grid_offset_x: number;
  grid_offset_y: number;
  distance_per_cell: number;
  distance_unit: "ft" | "m";
  fog_enabled: boolean;
  revealed_cells: string[];
  background_color: string;
  mapUrl?: string | null;
}

export interface Token {
  id: string;
  scene_id: string;
  owner_user_id: string | null;
  created_by_uid: string;
  character_id: string | null;
  image_asset_id: string | null;
  name: string;
  initials: string | null;
  color: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  locked: boolean;
  is_dead: boolean;
  visible_to_players: boolean;
  hp_current: number | null;
  hp_max: number | null;
  temp_hp: number | null;
  armor_class: number | null;
  difficulty_class: number | null;
  saving_throws: Record<string, number> | null;
  speed_ft: number | null;
  notes: string | null;
  imageUrl?: string | null;
}

export interface Drawing {
  id: string;
  scene_id: string;
  author_user_id: string;
  kind: "freehand" | "line" | "rectangle" | "ellipse" | "text";
  points: Array<{ x: number; y: number }>;
  style: {
    color?: string;
    width?: number;
    rotation?: number;
  };
  visibility: "players" | "master";
}

export interface InitiativeEntry {
  id: string;
  scene_id: string;
  token_id: string | null;
  group_name: string | null;
  group_entry_id: string | null;
  initiative: number | null;
  sort_order: number;
}

export interface InitiativeState {
  scene_id: string;
  round: number;
  current_entry_id: string | null;
  is_running: boolean;
}
