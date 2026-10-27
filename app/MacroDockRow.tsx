"use client";

import { t } from "@/lib/i18n/store";

import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { mergeMacroDockOrder, moveMacroDock } from "@/lib/vers/macro-dock-order";

const DOCK_DRAG_MIME = "application/x-vers-macro-dock";

interface DockProps {
  "data-macro-dock-id": string;
  className?: string;
  onDragEnter?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}

interface MacroDockRowProps {
  children: ReactNode;
  dockRef: Ref<HTMLDivElement>;
  order: string[];
  onOrderChange: (order: string[]) => void;
  onReorderStart: () => void;
}

export function MacroDockRow({
  children,
  dockRef,
  order,
  onOrderChange,
  onReorderStart,
}: MacroDockRowProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    placement: "before" | "after";
  } | null>(null);
  const suppressClickRef = useRef(false);
  const docks = Children.toArray(children).filter(isValidElement<DockProps>);
  const visibleIds = docks.map((dock) => dock.props["data-macro-dock-id"]);
  const fullOrder = mergeMacroDockOrder(order, visibleIds);
  const orderedDocks = fullOrder.flatMap((id) => {
    const dock = docks.find((item) => item.props["data-macro-dock-id"] === id);
    return dock ? [dock] : [];
  });

  const placementAt = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  };

  const isDockDrag = (event: DragEvent<HTMLElement>) =>
    draggedId !== null && event.dataTransfer.types.includes(DOCK_DRAG_MIME);

  return (
    <div
      ref={dockRef}
      className="macro-docks"
      aria-label={t("Dado rapido e macro aperte")}
      onPointerDown={(event) => {
        if (event.button === 2) event.stopPropagation();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        const heading = (event.target as Element).closest(".macro-dock-heading");
        const id = heading?.closest("[data-macro-dock-id]")
          ?.getAttribute("data-macro-dock-id");
        if (!id || !visibleIds.includes(id)) return;
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DOCK_DRAG_MIME, id);
        suppressClickRef.current = true;
        setDraggedId(id);
        onReorderStart();
      }}
      onDragEnd={(event) => {
        if (!isDockDrag(event)) return;
        event.stopPropagation();
        setDraggedId(null);
        setDropTarget(null);
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      }}
      onKeyDown={(event) => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const heading = (event.target as Element).closest(".macro-dock-heading");
        const id = heading?.closest("[data-macro-dock-id]")
          ?.getAttribute("data-macro-dock-id");
        if (!id) return;
        const ids = orderedDocks.map((dock) => dock.props["data-macro-dock-id"]);
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const targetId = ids[ids.indexOf(id) + direction];
        event.preventDefault();
        event.stopPropagation();
        if (!targetId) return;
        onReorderStart();
        onOrderChange(moveMacroDock(fullOrder, id, targetId, direction < 0 ? "before" : "after"));
      }}
    >
      {orderedDocks.map((dock) => {
        const id = dock.props["data-macro-dock-id"];
        const markDropTarget = (event: DragEvent<HTMLElement>) => {
          if (!isDockDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          const placement = placementAt(event);
          setDropTarget((current) => {
            if (id === draggedId) return null;
            return current?.id === id && current.placement === placement
              ? current
              : { id, placement };
          });
        };
        return cloneElement(dock, {
          className: `${dock.props.className ?? ""}${
            draggedId === id ? " macro-dock-dragging" : ""
          }${dropTarget?.id === id ? ` dock-drop-${dropTarget.placement}` : ""}`,
          onDragEnter: markDropTarget,
          onDragOver: markDropTarget,
          onDragLeave: (event) => {
            if (!isDockDrag(event)) return;
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) return;
            setDropTarget((current) => current?.id === id ? null : current);
          },
          onDrop: (event) => {
            if (!isDockDrag(event)) return;
            event.preventDefault();
            event.stopPropagation();
            const sourceId = event.dataTransfer.getData(DOCK_DRAG_MIME);
            if (sourceId === draggedId && sourceId !== id) {
              onOrderChange(moveMacroDock(fullOrder, sourceId, id, placementAt(event)));
            }
            setDropTarget(null);
          },
        });
      })}
    </div>
  );
}
