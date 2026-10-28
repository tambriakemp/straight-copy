// What all four client screens share: who is looking, and one load.
//
// Pulled out rather than repeated because the `?as=admin` preview is subtle
// enough that four copies would be four chances to get it slightly different
// -- and a screen that forgot it would silently show a real client's data to
// an admin without the warning bar that says so.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PortalRequestError } from "@/lib/clientPortalApi";

/**
 * Whether this is an admin previewing the portal as the client.
 *
 * Latched into `sessionStorage` the first time `?as=admin` is seen, because
 * the existing admin entry point links in with the parameter once and the
 * client then navigates within the portal. The server does not trust any of
 * this: it resolves the caller's own session, and an admin who is not an
 * admin gets a 401 whatever this returns.
 */
export function useAdminPreview(clientId: string | undefined): {
  adminPreview: boolean;
  exitPreview: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = clientId ? `cre8-portal-as-admin-${clientId}` : "";

  const adminPreview = useMemo(() => {
    if (!clientId) return false;
    if (searchParams.get("as") === "admin") {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* a browser with storage disabled still gets the parameter */
      }
      return true;
    }
    try {
      return sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [clientId, searchParams, key]);

  const exitPreview = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* nothing to clear */
    }
    if (searchParams.has("as")) {
      const next = new URLSearchParams(searchParams);
      next.delete("as");
      setSearchParams(next, { replace: true });
    }
    window.location.reload();
  }, [key, searchParams, setSearchParams]);

  return { adminPreview, exitPreview };
}

export interface Load<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * One request, with a reload.
 *
 * `data` is kept across a reload on purpose: a screen that blanked itself
 * every time a payment was made would flash an empty table at the client at
 * the exact moment they most want to see it worked.
 */
export function usePortalView<T>(
  load: (() => Promise<T>) | null,
  deps: unknown[],
): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    setLoading(true);
    load()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof PortalRequestError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return {
    data,
    loading,
    error,
    reload: useCallback(() => setNonce((value) => value + 1), []),
  };
}
