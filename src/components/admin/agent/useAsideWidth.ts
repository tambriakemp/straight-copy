// How wide the document panel is, and remembering it.
//
// A 24,000-character proposal in a 400px column is unreadable — Bree's words
// were "very squashed". So the panel is draggable, trading chat width for
// document width, and the choice sticks: resizing it back on every visit is
// worse than the fixed width was.
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "cv.agent.asideWidth";
export const ASIDE_DEFAULT = 400;
/** Below this the document is not worth showing; above it the chat suffers. */
export const ASIDE_MIN = 320;
export const ASIDE_MAX = 900;

export function clampAside(px: number): number {
  return Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, Math.round(px)));
}

/**
 * The widest the panel may be, given the window.
 *
 * The rail is 232px and the chat needs room to stay a chat. Without this, a
 * width saved on a wide monitor would squeeze the conversation to nothing on a
 * laptop — the same complaint, moved to the other column.
 */
export function maxForViewport(viewportWidth: number): number {
  return Math.max(ASIDE_MIN, Math.min(ASIDE_MAX, viewportWidth - 232 - 420));
}

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return ASIDE_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampAside(n) : ASIDE_DEFAULT;
  } catch {
    // Private windows and blocked site data both throw here.
    return ASIDE_DEFAULT;
  }
}

export function useAsideWidth() {
  const [width, setWidth] = useState(ASIDE_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  // Read after mount rather than during: localStorage is unavailable during SSR
  // and can throw, and a first paint at the default is better than not painting.
  useEffect(() => {
    setWidth((w) => Math.min(readStored(), maxForViewport(window.innerWidth)) || w);
  }, []);

  // A width saved on a wide monitor must not crush the chat on a laptop.
  useEffect(() => {
    const onResize = () =>
      setWidth((w) => Math.min(w, maxForViewport(window.innerWidth)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startDrag = useCallback((e: React.MouseEvent | null) => {
    // Double-click passes null: back to the default.
    if (!e) {
      setWidth(ASIDE_DEFAULT);
      try { window.localStorage.setItem(KEY, String(ASIDE_DEFAULT)); } catch { /* ignore */ }
      return;
    }
    e.preventDefault();
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      // The panel is on the right, so its width is the distance from the
      // pointer to the right edge. Coalesced into a frame — a mousemove per
      // pixel re-laying-out a rendered proposal is what makes a drag feel
      // heavy.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const next = Math.min(
          clampAside(window.innerWidth - ev.clientX),
          maxForViewport(window.innerWidth),
        );
        setWidth(next);
      });
    };

    const onUp = () => {
      setDragging(false);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Read off state at the end rather than writing on every frame.
      setWidth((w) => {
        try { window.localStorage.setItem(KEY, String(w)); } catch { /* ignore */ }
        return w;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { width, dragging, startDrag };
}
