import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Respect reduced-motion: reveal everything immediately, skip animation gating.
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
      return;
    }

    const observed = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
    );

    const observeAll = () => {
      document.querySelectorAll(".reveal:not(.visible)").forEach((el) => {
        if (observed.has(el)) return;
        observed.add(el);
        // If already in viewport at registration time, reveal immediately.
        const rect = el.getBoundingClientRect();
        const inView =
          rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
          rect.bottom > 0;
        if (inView) {
          el.classList.add("visible");
          return;
        }
        observer.observe(el);
      });
    };

    observeAll();

    // Re-scan when the DOM mutates (lazy-loaded sections, async content, route changes).
    const mo = new MutationObserver(() => observeAll());
    mo.observe(document.body, { childList: true, subtree: true });

    // Safety net: if anything is still hidden after 2.5s, force it visible
    // so content can never get permanently stuck behind opacity:0.
    const safety = window.setTimeout(() => {
      document.querySelectorAll(".reveal:not(.visible)").forEach((el) => {
        el.classList.add("visible");
      });
    }, 2500);

    return () => {
      observer.disconnect();
      mo.disconnect();
      window.clearTimeout(safety);
    };
  }, []);
}
