// The Files tab's shared-drive links, for one project (CRE-827). Lifted out
// of the two Files screens the same way `useClientFiles.ts` was, so the
// validation and the save/remove calls exist once.
//
// Revised the same day it shipped: the owner tried the single-link version
// and asked for more than one, each tagged to a project. Both Files screens
// already know which project they are showing -- `ClientFiles.tsx` and
// `FilesSection.tsx` both resolve a `clientProjectId` before they render --
// so this hook reads the whole list from `home()` and narrows it to the one
// project its caller is on, rather than asking the caller to do that.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clientPortal, PortalRequestError } from "@/lib/clientPortalApi";
import type { SharedDriveLink } from "@/lib/clientPortalWire";

/**
 * A link worth clicking, and nothing cleverer than that.
 *
 * Mirrors the check the plugin makes server-side (`requireHttpUrl` in
 * `src/api/context.ts` there) so a client sees the same refusal before the
 * request even goes out, not after.
 */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Self-fetching: the two Files screens reach this hook from different parent
 * data (one already has a `HomeView`, one has never fetched one), so rather
 * than thread the value through two different shapes, this asks for its own
 * copy with the one call every screen already has a credential for.
 */
export function useSharedDriveLinks({
  clientId,
  clientProjectId,
  adminPreview,
}: {
  clientId: string;
  clientProjectId: string;
  adminPreview: boolean;
}) {
  const [links, setLinks] = useState<SharedDriveLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void clientPortal
      .home(clientId, adminPreview)
      .then((home) => {
        if (!live) return;
        setLinks((home.sharedDriveLinks ?? []).filter((link) => link.clientProjectId === clientProjectId));
      })
      .catch(() => {
        // The Files screen already shows its own "unavailable" state from
        // the files list; this card just stays at "no link yet" rather than
        // adding a second error banner for the same outage.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [clientId, clientProjectId, adminPreview]);

  const add = async () => {
    const trimmed = draft.trim();
    if (!isHttpUrl(trimmed)) {
      toast.error("That doesn't look like a link. Paste the full URL, starting with https://.");
      return;
    }
    setSaving(true);
    try {
      const created = await clientPortal.createSharedDriveLink(
        clientId,
        { clientProjectId, url: trimmed },
        adminPreview,
      );
      setLinks((prev) => [...prev, created]);
      setDraft("");
      setAdding(false);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof PortalRequestError ? e.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await clientPortal.removeSharedDriveLink(clientId, id, adminPreview);
      setLinks((prev) => prev.filter((link) => link.id !== id));
    } catch (e) {
      toast.error(e instanceof PortalRequestError ? e.message : "That could not be removed.");
    } finally {
      setBusyId(null);
    }
  };

  return {
    loading,
    links,
    adding,
    setAdding: (next: boolean) => {
      setDraft("");
      setAdding(next);
    },
    draft,
    setDraft,
    saving,
    add,
    busyId,
    remove,
  };
}
