export interface TokenMovePosition {
  id: string;
  x: number;
  y: number;
}

export interface OptimisticTokenMoveOrigin {
  tokenId: string;
  priorOptimisticPosition: { x: number; y: number } | null;
}

type PositionPatch = {
  x?: number;
  y?: number;
};

export class TokenMoveSaveCoordinator {
  private readonly tokenChains = new Map<string, Promise<void>>();

  run<Result>(tokenIds: string[], operation: () => PromiseLike<Result>) {
    const uniqueTokenIds = [...new Set(tokenIds)];
    const dependencies = [
      ...new Set(
        uniqueTokenIds
          .map((tokenId) => this.tokenChains.get(tokenId))
          .filter((chain): chain is Promise<void> => Boolean(chain)),
      ),
    ];
    const result = Promise.all(dependencies).then(operation);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );

    for (const tokenId of uniqueTokenIds) {
      this.tokenChains.set(tokenId, completion);
    }
    void completion.then(() => {
      for (const tokenId of uniqueTokenIds) {
        if (this.tokenChains.get(tokenId) === completion) {
          this.tokenChains.delete(tokenId);
        }
      }
    });

    return result;
  }
}

export const applyOptimisticTokenPositions = <Patch extends PositionPatch>(
  patches: Map<string, Patch>,
  positions: TokenMovePosition[],
) => {
  for (const position of positions) {
    patches.set(position.id, {
      ...patches.get(position.id),
      x: position.x,
      y: position.y,
    } as Patch);
  }
};

export const restoreMatchingOptimisticTokenPositions = <
  Patch extends PositionPatch,
>(
  patches: Map<string, Patch>,
  origins: OptimisticTokenMoveOrigin[],
  expectedPositions: TokenMovePosition[],
) => {
  const restoredTokenIds = new Set<string>();
  const expectedById = new Map(
    expectedPositions.map((position) => [position.id, position]),
  );

  for (const origin of origins) {
    const expected = expectedById.get(origin.tokenId);
    const current = patches.get(origin.tokenId);
    if (
      !expected ||
      !current ||
      current.x !== expected.x ||
      current.y !== expected.y
    ) {
      continue;
    }

    const restored = { ...current };
    if (origin.priorOptimisticPosition) {
      restored.x = origin.priorOptimisticPosition.x;
      restored.y = origin.priorOptimisticPosition.y;
    } else {
      delete restored.x;
      delete restored.y;
    }

    if (Object.keys(restored).length > 0) patches.set(origin.tokenId, restored);
    else patches.delete(origin.tokenId);
    restoredTokenIds.add(origin.tokenId);
  }

  return restoredTokenIds;
};

export const clearMatchingOptimisticTokenPositions = <
  Patch extends PositionPatch,
>(patches: Map<string, Patch>, expectedPositions: TokenMovePosition[]) => {
  const clearedTokenIds = new Set<string>();

  for (const expected of expectedPositions) {
    const current = patches.get(expected.id);
    if (
      !current ||
      current.x !== expected.x ||
      current.y !== expected.y
    ) {
      continue;
    }

    const remaining = { ...current };
    delete remaining.x;
    delete remaining.y;
    if (Object.keys(remaining).length > 0) patches.set(expected.id, remaining);
    else patches.delete(expected.id);
    clearedTokenIds.add(expected.id);
  }

  return clearedTokenIds;
};

export const hasMatchingOptimisticTokenPosition = <Patch extends PositionPatch>(
  patches: Map<string, Patch>,
  expectedPositions: TokenMovePosition[],
) =>
  expectedPositions.some((expected) => {
    const current = patches.get(expected.id);
    return current?.x === expected.x && current.y === expected.y;
  });
