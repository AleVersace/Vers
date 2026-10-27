export interface FogState {
  fog_enabled: boolean;
  revealed_cells: string[];
}

export interface FogCell {
  x: number;
  y: number;
}

export const isTokenVisibleThroughFog = (
  token: FogCell & { size: number },
  fogEnabled: boolean,
  revealedCells: ReadonlySet<string>,
  masterView: boolean,
) => {
  if (masterView || !fogEnabled) return true;
  // A large or fractional token is visible if any occupied cell is revealed.
  // The opaque player fog still masks the rest of its image on the board.
  for (let y = Math.floor(token.y); y < Math.ceil(token.y + token.size); y += 1) {
    for (let x = Math.floor(token.x); x < Math.ceil(token.x + token.size); x += 1) {
      if (revealedCells.has(`${x}:${y}`)) return true;
    }
  }
  return false;
};

export const fogBrushBounds = (
  cell: FogCell,
  brushSize: number,
  columns: number,
  rows: number,
) => {
  const size = Math.max(1, Math.min(15, Math.round(brushSize)));
  const leading = Math.floor((size - 1) / 2);
  const startX = Math.max(0, Math.min(cell.x - leading, columns - size));
  const startY = Math.max(0, Math.min(cell.y - leading, rows - size));
  return {
    startX,
    startY,
    endX: Math.min(columns - 1, startX + size - 1),
    endY: Math.min(rows - 1, startY + size - 1),
  };
};

// Activation is explicit. Neither brush may replace the saved mask while off.
export const createFogStrokeCells = (state: FogState) =>
  state.fog_enabled ? new Set(state.revealed_cells) : null;

export const paintFogCells = (
  cells: Set<string>,
  from: FogCell | null,
  to: FogCell,
  reveal: boolean,
  brushSize: number,
  columns: number,
  rows: number,
) => {
  const start = from ?? to;
  const steps = Math.max(Math.abs(to.x - start.x), Math.abs(to.y - start.y), 1);
  let changed = false;
  // Pointer events can skip cells during a fast drag. Fill the whole segment.
  for (let step = 0; step <= steps; step += 1) {
    const bounds = fogBrushBounds(
      {
        x: Math.round(start.x + ((to.x - start.x) * step) / steps),
        y: Math.round(start.y + ((to.y - start.y) * step) / steps),
      },
      brushSize,
      columns,
      rows,
    );
    for (let y = bounds.startY; y <= bounds.endY; y += 1) {
      for (let x = bounds.startX; x <= bounds.endX; x += 1) {
        const key = `${x}:${y}`;
        if (reveal) {
          if (!cells.has(key)) {
            cells.add(key);
            changed = true;
          }
        } else if (cells.delete(key)) {
          changed = true;
        }
      }
    }
  }
  return changed;
};

export class FogStateTracker {
  private readonly entries = new Map<
    string,
    { patch: FogState; confirmedAt: number | null }
  >();
  private readVersion = 0;

  captureReadVersion() {
    return this.readVersion;
  }

  isCurrent(sceneId: string, expected: FogState) {
    return this.entries.get(sceneId)?.patch === expected;
  }

  stage(sceneId: string, state: FogState) {
    const patch = { ...state, revealed_cells: [...state.revealed_cells] };
    this.entries.set(sceneId, { patch, confirmedAt: null });
    return patch;
  }

  apply<Scene extends FogState>(
    sceneId: string,
    scene: Scene,
    readVersion?: number,
  ): Scene {
    const entry = this.entries.get(sceneId);
    if (!entry) return scene;
    if (
      entry.confirmedAt !== null &&
      readVersion !== undefined &&
      readVersion >= entry.confirmedAt
    ) {
      // Only a read started after confirmation can replace the local fog.
      this.entries.delete(sceneId);
      return scene;
    }
    // Keep all other scene fields from the server, even for an older read.
    return { ...scene, ...entry.patch };
  }

  confirm(sceneId: string, expected: FogState) {
    const entry = this.entries.get(sceneId);
    if (entry?.patch !== expected) return false;
    entry.confirmedAt = ++this.readVersion;
    return true;
  }

  discard(sceneId: string, expected: FogState) {
    // An older failure must not clear a newer stroke or toggle.
    if (this.entries.get(sceneId)?.patch !== expected) return false;
    this.entries.delete(sceneId);
    return true;
  }
}
