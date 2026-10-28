// The data and state behind the Files tab -- lifted out of
// `FilesSection.tsx` so the dark client surface's own Files screen
// (`ClientFiles.tsx`, mockup 18) can draw the same two lists in `.cp-file`
// markup instead of `FilesSection`'s `cv-it` rows, without a second copy of
// the upload, remove and load logic.
//
// Two lists from one table: what Cre8 Visions shared, and what the client
// sent. Downloads are signed URLs minted per load and good for half an
// hour. The bucket is private on purpose -- the portal is a link, and a
// link that also hands out permanent file URLs turns one forwarded address
// into a document archive that never expires.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { portalFetch } from "@/lib/portalFetch";
import { safeFileName } from "@/lib/projectFiles";
import { isDemoClient } from "@/lib/portalDemo";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export interface ProjectFile {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime: string | null;
  direction: string;
  category: string | null;
  uploaded_by_name: string | null;
  visible_to_client: boolean;
  created_at: string;
  url: string | null;
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
  busy: boolean;
  unavailable: boolean;
  dragging: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  upload: (list: FileList | null) => Promise<void>;
  remove: (file: ProjectFile) => Promise<void>;
}

export function useClientFiles({
  clientId,
  clientProjectId,
  clientName,
  adminPreview,
}: {
  clientId: string;
  clientProjectId: string;
  clientName: string | null;
  adminPreview: boolean;
}): UseClientFiles {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sb = adminPreview ? supabase : supabasePortal;

  const load = useCallback(async () => {
    // The QA harness. `client-files` is not `client-portal`, so this call
    // sits outside that function's own demo guard and needs its own -- see
    // `demoProjectFiles` in `portalDemoData.ts` (CRE-819).
    if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
      const { demoProjectFiles } = await import("@/lib/portalDemoData");
      setFiles(demoProjectFiles());
      setUnavailable(false);
      return;
    }
    try {
      const out = await call("list", { client_id: clientId, client_project_id: clientProjectId }, adminPreview);
      setFiles((out.files ?? []) as ProjectFile[]);
      setUnavailable(false);
    } catch {
      setFiles([]);
      setUnavailable(true);
    }
  }, [clientId, clientProjectId, adminPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
        toast.error("The demo can't send files.");
        return;
      }
      setBusy(true);
      let done = 0;
      for (const file of Array.from(list)) {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is over 15MB`);
          continue;
        }
        try {
          const path = `project-files/${clientId}/${clientProjectId}/${Date.now()}-${safeFileName(file.name)}`;
          const { error } = await sb.storage.from("client-assets").upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });
          if (error) throw new Error(error.message);
          // Two steps on purpose: the bytes go straight to storage, and
          // only then is a row written. A failed upload leaves no row
          // claiming a file that is not there.
          await call(
            "register",
            {
              client_id: clientId,
              client_project_id: clientProjectId,
              name: file.name,
              storage_path: path,
              size_bytes: file.size,
              mime: file.type || null,
              uploaded_by_name: clientName || null,
            },
            adminPreview,
          );
          done++;
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (done) {
        await load();
        toast.success(`Sent ${done} file${done === 1 ? "" : "s"}`);
      }
    },
    [clientId, clientProjectId, clientName, sb, adminPreview, load],
  );

  const remove = useCallback(
    async (file: ProjectFile) => {
      if (!confirm(`Remove ${file.name}?`)) return;
      if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
        toast.error("The demo can't remove files.");
        return;
      }
      try {
        await call("remove", { client_id: clientId, id: file.id }, adminPreview);
        await load();
        toast.success("Removed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove that file");
      }
    },
    [clientId, adminPreview, load],
  );

  const rows = files ?? [];
  const shared = rows.filter((file) => file.direction === "to_client");
  const sent = rows.filter((file) => file.direction !== "to_client");

  return {
    files,
    shared,
    sent,
    busy,
    unavailable,
    dragging,
    inputRef,
    onDragOver: (event) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event) => {
      event.preventDefault();
      setDragging(false);
      void upload(event.dataTransfer.files);
    },
    upload,
    remove,
  };
}
