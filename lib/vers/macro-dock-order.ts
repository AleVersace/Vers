export const QUICK_DIE_DOCK_ID = "quick-die";

export const characterMacroDockId = (characterId: string) =>
  `character:${characterId}`;

export function readMacroDockOrder(layout: unknown): string[] {
  const stored =
    typeof layout === "object" && layout !== null && "macroDockOrder" in layout
      ? layout.macroDockOrder
      : null;
  const order = Array.isArray(stored)
    ? [...new Set(stored.filter((id): id is string =>
        typeof id === "string" &&
        (id === QUICK_DIE_DOCK_ID || /^character:\S+$/.test(id)),
      ))]
    : [];
  return order.includes(QUICK_DIE_DOCK_ID)
    ? order
    : [QUICK_DIE_DOCK_ID, ...order];
}

// Keep closed panels in the saved order so reopening one restores its position.
export function mergeMacroDockOrder(order: string[], visibleIds: string[]) {
  return [...new Set([...order, ...visibleIds])];
}

export function moveMacroDock(
  order: string[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): string[] {
  if (
    sourceId === targetId ||
    !order.includes(sourceId) ||
    !order.includes(targetId)
  ) return order;

  const next = order.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceId);
  return next;
}
