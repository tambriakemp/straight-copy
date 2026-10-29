// The Files tab's one field: a link to the client's own shared drive
// (CRE-827). Lifted out of the two Files screens the same way
// `useClientFiles.ts` was, so the validation and the save call exist once.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clientPortal, PortalRequestError } from "@/lib/clientPortalApi";

/**
 * A link worth clicking, and nothing cleverer than that.
 *
 * Mirrors the check the plugin makes server-side (`requireHttpUrl` in
 * `src/api/clients.ts` there) so a client sees the same refusal before the
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
export function useSharedDriveLink({
  clientId,
  adminPreview,
}: {
  clientId: string;
  adminPreview: boolean;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void clientPortal
      .home(clientId, adminPreview)
      .then((home) => {
        if (!live) return;
        const value = home.sharedDriveUrl ?? null;
        setSaved(value);
        setDraft(value ?? "");
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
  }, [clientId, adminPreview]);

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && !isHttpUrl(trimmed)) {
      toast.error("That doesn't look like a link. Paste the full URL, starting with https://.");
      return;
    }
    setSaving(true);
    try {
      const result = await clientPortal.saveSharedDriveUrl(
        clientId,
        trimmed.length > 0 ? trimmed : null,
        adminPreview,
      );
      setSaved(result.sharedDriveUrl);
      setDraft(result.sharedDriveUrl ?? "");
      setEditing(false);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof PortalRequestError ? e.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return {
    loading,
    saved,
    draft,
    setDraft,
    editing,
    setEditing: (next: boolean) => {
      setDraft(saved ?? "");
      setEditing(next);
    },
    saving,
    save,
  };
}
