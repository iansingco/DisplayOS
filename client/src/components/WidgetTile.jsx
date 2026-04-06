import { useRef, useState } from "react";
import { resolveWidget } from "../widgets/index.js";

const COLS = 12, ROWS = 8;

export function WidgetTile({ widget, containerWidth, containerHeight, onMove }) {
  const entry = resolveWidget(widget.type);
  if (!entry) return null;
  const { component: Component } = entry;

  const cellW = containerWidth / COLS;
  const cellH = containerHeight / ROWS;

  const dragRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(null);

  function onPointerDown(e) {
    if (e.target !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY };
    setDragOffset({ dx: 0, dy: 0 });
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    setDragOffset({
      dx: e.clientX - dragRef.current.startX,
      dy: e.clientY - dragRef.current.startY,
    });
  }

  function onPointerUp(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current = null;
    setDragOffset(null);

    const colDelta = Math.round(dx / cellW);
    const rowDelta = Math.round(dy / cellH);
    if ((colDelta !== 0 || rowDelta !== 0) && onMove) {
      const newX = Math.max(0, Math.min(COLS - widget.w, widget.x + colDelta));
      const newY = Math.max(0, Math.min(ROWS - widget.h, widget.y + rowDelta));
      if (newX !== widget.x || newY !== widget.y) {
        onMove(widget.id, newX, newY);
      }
    }
  }

  const isDragging = dragOffset !== null;
  const offsetX = dragOffset?.dx ?? 0;
  const offsetY = dragOffset?.dy ?? 0;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: widget.x * cellW + offsetX,
        top:  widget.y * cellH + offsetY,
        width:  widget.w * cellW,
        height: widget.h * cellH,
        overflow: "hidden",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.03)",
        border: isDragging
          ? "1px solid rgba(127,170,255,0.4)"
          : "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(2px)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        transition: isDragging ? "none" : "left 0.15s ease, top 0.15s ease",
        zIndex: isDragging ? 10 : 1,
        boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.5)" : "none",
      }}
    >
      <div style={{ width: "100%", height: "100%", pointerEvents: isDragging ? "none" : "auto" }}>
        <Component config={widget.config ?? {}} />
      </div>
    </div>
  );
}
