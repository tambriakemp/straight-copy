// The data and state behind the Files tab -- lifted out of
// `FilesSection.tsx` so the dark client surface's own Files screen
// (`ClientFiles.tsx`, mockup 18) can draw the same two lists in `.cp-file`
// markup instead of `FilesSection`'s `cv-it` rows, without a second copy of
// the list and load logic.
//
// Two lists from one table: what Cre8 Visions shared, and what the client
// sent before CRE-827. `client-files` answers from one of two backends --
// see that function's own header. Neither carries a download link
// (CRE-822): `open()` mints one, for one file, on the click that needs it,
// so nothing minted when the list loaded is still live -- or dead -- by the
// time somebody clicks.
//
// CRE-827 removed upload and remove from this hook. A client cannot upload
// anywhere in the portal any more -- they keep their own shared drive
// folder instead, see `useSharedDriveLinks.ts` -- and the "Sent by you" list
// is read-only history now that nothing can add to it.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { portalFetch } from "@/lib/portalFetch";
import { blobUrlFromBase64 } from "@/lib/fileBytes";
import { isDemoClient } from "@/lib/portalDemo";

export interface ProjectFile {
  id: string;
  name: string;
  size_bytes: number | null;
  mime: string | null;
  direction: string;
  category: string | null;
  uploaded_by_name: string | null;
  visible_to_client: boolean;
  created_at: string;
  status: "pending" | "stored" | "external" | "removed";
  downloadable: boolean;
}

/** What `open()` hands back: enough to show or download one file, once. */
export interface OpenedFile {
  url: string;
  mime: string | null;
  filename: string;
}

async function call(action: string, body: Record<string, unknown>, adminPreview: boolean) {
  const res = await portalFetch("client-files", { action, ...body }, adminPreview);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? res.statusText);
  return json as Record<string, unknown>;
}

export interface UseClientFiles {
  files: ProjectFile[] | null;
  shared: ProjectFile[];
  sent: ProjectFile[];
  unavailable: boolean;
  /** A fresh way to see or download one file. Never cache what it returns. */
  open: (file: ProjectFile) => Promise<OpenedFile | null>;
}

export function useClientFiles({
  clientId,
  clientProjectId,
  adminPreview,
  category,
}: {
  clientId: string;
  /** Null for a file filed against no project -- the account-access form's
   * attachments (CRE-822, G4), which belong to the client, not a build. */
  clientProjectId: string | null;
  adminPreview: boolean;
  /** Scopes the list to one category, so a screen that is not the Files tab
   * never draws or counts a row it did not create. Undefined keeps the
   * Files tab's unscoped behaviour. */
  category?: string;
}): UseClientFiles {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const demo = import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId);

  const load = useCallback(async () => {
    // The QA harness. `client-files` is not `client-portal`, so this call
    // sits outside that function's own demo guard and needs its own -- see
    // `demoProjectFiles` in `portalDemoData.ts` (CRE-819).
    if (demo) {
      const { demoProjectFiles } = await import("@/lib/portalDemoData");
      setFiles(demoProjectFiles());
      setUnavailable(false);
      return;
    }
    try {
      const out = await call("list", { client_id: clientId, client_project_id: clientProjectId }, adminPreview);
      const all = (out.files ?? []) as ProjectFile[];
      // The server has no category filter on `list` -- a category this
      // narrow is not worth a query parameter the other callers never use --
      // so a scoped hook filters the one response itself.
      setFiles(category ? all.filter((file) => file.category === category) : all);
      setUnavailable(false);
    } catch {
      setFiles([]);
      setUnavailable(true);
    }
  }, [demo, clientId, clientProjectId, adminPreview, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (file: ProjectFile): Promise<OpenedFile | null> => {
      if (demo) {
        const { demoFileUrl } = await import("@/lib/portalDemoData");
        const url = demoFileUrl(file.id);
        return url ? { url, mime: file.mime, filename: file.name } : null;
      }
      try {
        const data = await call("download", { client_id: clientId, id: file.id }, adminPreview);
        const mime = (data.mime as string | null) ?? file.mime;
        if (typeof data.url === "string" && data.url) {
          return { url: data.url, mime, filename: (data.filename as string) || file.name };
        }
        if (typeof data.content_base64 === "string" && data.content_base64) {
          return {
            url: blobUrlFromBase64(data.content_base64, mime),
            mime,
            filename: (data.filename as string) || file.name,
          };
        }
        throw new Error("That file has no bytes to open yet.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open that file");
        return null;
      }
    },
    [demo, clientId, adminPreview],
  );

  const rows = files ?? [];
  const shared = rows.filter((file) => file.direction === "to_client");
  const sent = rows.filter((file) => file.direction !== "to_client");

  return { files, shared, sent, unavailable, open };
}
