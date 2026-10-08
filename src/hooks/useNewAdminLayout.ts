// Whether the admin surface uses the new light side-nav shell (CRE-332)
// or the current dark one. Same localStorage-with-try/catch idiom as
// useAsideWidth.ts. Defaults to off — the old layout stays the default
// until Phase 7 switches it over.
import { useCallback, useEffect, useState } from "react";

const KEY = "cv.admin.newLayout";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw here.
    return false;
  }
}

export function useNewAdminLayout() {
  const [enabled, setEnabledState] = useState(false);

  // Read after mount, not during: a first paint at the default (old layout)
  // is better than not painting, and matches useAsideWidth's own pattern.
  useEffect(() => {
    setEnabledState(readStored());
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    // A full reload keeps every already-mounted admin page in sync with the
    // new choice, rather than only the ones that happen to re-render.
    window.location.reload();
  }, []);

  return { enabled, setEnabled };
}
