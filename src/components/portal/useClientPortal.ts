// What all four client screens share: who is looking, and one load.
//
// Pulled out rather than repeated because the `?as=admin` preview is subtle
// enough that four copies would be four chances to get it slightly different
// -- and a screen that forgot it would silently show a real client's data to
// an admin without the warning bar that says so.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PortalRequestError } from "@/lib/clientPortalApi";
import { adoptViewAsFromUrl, clearViewAs, viewAsActor } from "@/lib/portalViewAs";

/**
 * Whether this is an admin looking at the portal as the client, and who.
 *
 * Two mechanisms, checked in this order:
 *
 *  * **A view-as token** (CRE-811). Adopted out of the URL fragment that
 *    **Open portal** arrives with, then held in `sessionStorage` for the life
 *    of the tab. This one is a credential: the server signed it for an admin
 *    it had authenticated, scoped it to one client, gave it half an hour and
 *    made it read-only. `actor` is the admin's email, read out of the token
 *    for the banner and believed for nothing else.
 *  * **`?as=admin`**, latched the same way, because the existing admin entry
 *    points link in with the parameter once and then the pages navigate
 *    within the portal.
 *
 * The server does not trust the boolean either way: it resolves the caller's
 * own credential, and an admin who is not an admin gets a 401 whatever this
 * returns.
 */
export function useAdminPreview(clientId: string | undefined): {
  adminPreview: boolean;
  /** True when the grant is a signed token rather than a URL parameter. */
  viewAsGrant: boolean;
  /** The admin, in words, when the token says. Empty otherwise. */
  actor: string;
  exitPreview: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = clientId ? `cre8-portal-as-admin-${clientId}` : "";

  const grant = useMemo(() => {
    if (!clientId) return { adminPreview: false, viewAsGrant: false, actor: "" };
    // Synchronous, and before anything renders: the fragment has to be read
    // and stripped on the first pass, not in an effect after it.
    if (adoptViewAsFromUrl(clientId)) {
      return { adminPreview: true, viewAsGrant: true, actor: viewAsActor() };
    }
    if (searchParams.get("as") === "admin") {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* a browser with storage disabled still gets the parameter */
      }
      return { adminPreview: true, viewAsGrant: false, actor: "" };
    }
    let latched = false;
    try {
      latched = sessionStorage.getItem(key) === "1";
    } catch {
      latched = false;
    }
    return { adminPreview: latched, viewAsGrant: false, actor: "" };
  }, [clientId, searchParams, key]);

  const exitPreview = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* nothing to clear */
    }
    // Hands the grant back rather than just hiding the bar. A view-as token
    // left in storage would be a live credential in a tab whose user has said
    // they are done with it.
    clearViewAs();
    if (searchParams.has("as")) {
      const next = new URLSearchParams(searchParams);
      next.delete("as");
      setSearchParams(next, { replace: true });
    }
    window.location.reload();
  }, [key, searchParams, setSearchParams]);

  return { ...grant, exitPreview };
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
