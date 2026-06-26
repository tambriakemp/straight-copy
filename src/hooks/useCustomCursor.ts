import { useEffect, useRef } from "react";

export function useCustomCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const ring = ringRef.current;
    if (!cursor || !ring) return;

    // Skip on touch / coarse-pointer devices
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
    let animId: number;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      // Move the dot every frame for snappy follow (no CSS transition)
      cursor.style.transform = `translate3d(${mouseX - 4}px, ${mouseY - 4}px, 0)`;
    };

    const animate = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      ring.style.transform = `translate3d(${ringX - 18}px, ${ringY - 18}px, 0)`;
      animId = requestAnimationFrame(animate);
    };

    const isInteractive = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return false;
      return !!el.closest(
        'a, button, [role="button"], input, textarea, select, label, summary, .service-card, .work-card, [data-cursor-hover]'
      );
    };

    const onOver = (e: MouseEvent) => {
      if (isInteractive(e.target)) ring.classList.add("hover");
    };
    const onOut = (e: MouseEvent) => {
      if (isInteractive(e.target)) ring.classList.remove("hover");
    };

    const onLeaveWindow = () => {
      cursor.style.opacity = "0";
      ring.style.opacity = "0";
    };
    const onEnterWindow = () => {
      cursor.style.opacity = "1";
      ring.style.opacity = "1";
    };

    document.documentElement.classList.add("custom-cursor-active");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mouseleave", onLeaveWindow);
    document.addEventListener("mouseenter", onEnterWindow);
    animate();

    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mouseleave", onLeaveWindow);
      document.removeEventListener("mouseenter", onEnterWindow);
      cancelAnimationFrame(animId);
    };
  }, []);

  return { cursorRef, ringRef };
}
