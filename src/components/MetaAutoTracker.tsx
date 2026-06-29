import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackMetaEvent, type MetaEventName } from "@/lib/metaPixel";

// Routes we don't want to track (admin/portal/preview surfaces)
const SKIP_PREFIXES = ["/admin", "/portal", "/p/", "/preview"];

function shouldSkip(pathname: string) {
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

function classifyCta(el: HTMLAnchorElement | HTMLButtonElement): {
  name: MetaEventName;
  params: Record<string, unknown>;
} | null {
  const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80);

  // Explicit override via data attribute
  const explicit = el.getAttribute("data-meta-event") as MetaEventName | null;
  if (explicit) {
    return { name: explicit, params: { content_name: el.getAttribute("data-meta-name") || text } };
  }

  if (el.tagName === "A") {
    const a = el as HTMLAnchorElement;
    const href = a.getAttribute("href") || "";

    if (href.startsWith("mailto:")) {
      return { name: "Contact", params: { content_name: "mailto_click", value: href } };
    }
    if (href.startsWith("tel:")) {
      return { name: "Contact", params: { content_name: "tel_click", value: href } };
    }
    if (href.startsWith("/contact")) {
      return { name: "ClickContactCTA", params: { content_name: text || "contact_link" } };
    }
    if (href.startsWith("/onboarding")) {
      return { name: "ClickContactCTA", params: { content_name: text || "onboarding_link" } };
    }
    // File download
    if (/\.(pdf|zip|csv|xlsx?|docx?|pptx?|mp4|mov)(\?|$)/i.test(href)) {
      return { name: "ViewContent" as MetaEventName, params: { content_type: "download", content_name: href.split("/").pop() } as Record<string, unknown> };
    }
    // Outbound link
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin && /^https?:$/.test(url.protocol)) {
        return { name: "ViewContent", params: { content_type: "outbound", content_name: url.hostname + url.pathname } };
      }
    } catch { /* ignore */ }
    return null;
  }

  // Buttons: only fire if explicitly opted in via data-meta-cta
  if (el.hasAttribute("data-meta-cta")) {
    return { name: "ClickContactCTA", params: { content_name: text || "button_click" } };
  }
  return null;
}

export default function MetaAutoTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const scrollFired = useRef<Set<number>>(new Set());

  // SPA PageView on route change
  useEffect(() => {
    if (shouldSkip(location.pathname)) return;
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    scrollFired.current = new Set();
    try {
      trackMetaEvent("PageView", { page_path: location.pathname });
    } catch { /* ignore */ }
  }, [location.pathname]);

  // Delegated click tracking
  useEffect(() => {
    function onClick(ev: MouseEvent) {
      if (shouldSkip(window.location.pathname)) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest("a, button") as HTMLAnchorElement | HTMLButtonElement | null;
      if (!el) return;
      const result = classifyCta(el);
      if (!result) return;
      try {
        trackMetaEvent(result.name, result.params);
      } catch { /* ignore */ }
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
  }, []);

  // Scroll depth tracking (50%, 90%)
  useEffect(() => {
    function onScroll() {
      if (shouldSkip(window.location.pathname)) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max <= 0) return;
      const pct = Math.round((window.scrollY / max) * 100);
      [50, 90].forEach((threshold) => {
        if (pct >= threshold && !scrollFired.current.has(threshold)) {
          scrollFired.current.add(threshold);
          try {
            trackMetaEvent("ViewContent", {
              content_type: "scroll_depth",
              content_name: `scroll_${threshold}`,
              value: threshold,
            });
          } catch { /* ignore */ }
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
