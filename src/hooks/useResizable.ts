import { useState, useRef, useCallback } from "react";

/**
 * Hook to make a panel resizable via a drag handle.
 * direction: "left" = left-side drag handle (panel grows leftward)
 *            "right" = right-side drag handle
 */
export function useResizable(
  initial: number,
  min = 240,
  max = 720,
  direction: "left" | "right" = "left",
) {
  const [size, setSize] = useState(initial);
  const start = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, w: size };
    },
    [size],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      const delta =
        direction === "left"
          ? start.current.x - e.clientX
          : e.clientX - start.current.x;
      setSize(Math.max(min, Math.min(max, start.current.w + delta)));
    },
    [direction, min, max],
  );

  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);

  const onPointerCancel = useCallback(() => {
    start.current = null;
  }, []);

  return {
    size,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: {
        cursor: "ew-resize",
        userSelect: "none" as const,
        touchAction: "none" as const,
      } as React.CSSProperties,
    },
  };
}
