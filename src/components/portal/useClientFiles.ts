// The data and state behind the Files tab -- lifted out of
// `FilesSection.tsx` so the dark client surface's own Files screen
// (`ClientFiles.tsx`, mockup 18) can draw the same two lists in `.cp-file`
// markup instead of `FilesSection`'s `cv-it` rows, without a second copy of
// the upload, remove and load logic.
//
// Two lists from one table: what Cre8 Visions shared, and what the client
// sent. `client-files` answers from one of two backends -- see that
// function's own header -- and `source` is how this hook knows which
// upload path to take. Neither carries a download link any more (CRE-822):
// `open()` mints one, for one file, on the click that needs it, so nothing
// minted when the list loaded is still live -- or dead -- by the time
// somebody clicks.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { portalFetch } from "@/lib/portalFetch";
import { safeFileName } from "@/lib/projectFiles";
import { fileToBase64, blobUrlFromBase64 } from "@/lib/fileBytes";
import { isDemoClient } from "@/lib/portalDemo";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Mirrors the Client Portal plugin's own inline-store ceiling
 * (`MAX_INLINE_FILE_BYTES`). A file at or under this rides to the server as
 * base64 in the same request that creates its row; anything larger asks for
 * an upload ticket instead, so its bytes are never read into memory as
 * base64 here at all.
 */
const INLINE_MAX_BYTES = 6 * 1024 * 1024;

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

interface UploadTicket {
  url: string;
  method: string;
  headers: Record<string, string>;
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
  /** A fresh way to see or download one file. Never cache what it returns. */
  open: (file: ProjectFile) => Promise<OpenedFile | null>;
}

export function useClientFiles({
  clientId,
  clientProjectId,
  clientName,
  adminPreview,
  category,
}: {
  clientId: string;
  /** Null for a file filed against no project -- the account-access form's
   * attachments (CRE-822, G4), which belong to the client, not a build. */
  clientProjectId: string | null;
  clientName: string | null;
  adminPreview: boolean;
  /** Scopes both the list and every upload to one category, so a screen
   * that is not the Files tab never draws, counts or re-files a row it did
   * not create. Undefined keeps today's unscoped Files tab behaviour. */
  category?: string;
}): UseClientFiles {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [source, setSource] = useState<"plugin" | "admin-tables">("admin-tables");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sb = adminPreview ? supabase : supabasePortal;
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
      if (out.source === "plugin" || out.source === "admin-tables") setSource(out.source);
      setUnavailable(false);
    } catch {
      setFiles([]);
      setUnavailable(true);
    }
  }, [demo, clientId, clientProjectId, adminPreview, category]);

  useEffect(() => {
    void load();
  }, [load]);

  /** CRE-822: the server mints the object key and the bytes go to the
   *  plugin, never to a bucket this page names itself. */
  const uploadViaPlugin = useCallback(
    async (file: File) => {
      const inline = file.size <= INLINE_MAX_BYTES;
      const created = await call(
        "create",
        {
          client_id: clientId,
          client_project_id: clientProjectId,
          name: file.name,
          mime: file.type || null,
          byte_size: file.size,
          ...(inline ? { content_base64: await fileToBase64(file) } : {}),
          uploaded_by_name: clientName || null,
          ...(category ? { category } : {}),
        },
        adminPreview,
      );
      const ticket = created.upload as UploadTicket | null;
      if (!ticket) return;
      // Anything past the inline ceiling, or any install using a
      // `storage/v1` adapter rather than the built-in store: PUT the raw
      // bytes to the ticket, then tell the plugin to check they landed.
      const put = await fetch(ticket.url, {
        method: ticket.method || "PUT",
        headers: ticket.headers,
        body: file,
      });
      if (!put.ok) throw new Error("The upload did not reach storage. Try again.");
      const fileId = (created.file as { id?: string } | null)?.id;
      if (fileId) {
        await call("complete", { client_id: clientId, client_project_id: clientProjectId, id: fileId }, adminPreview);
      }
    },
    [clientId, clientProjectId, clientName, category, adminPreview],
  );

  /** The pre-CRE-822 path, kept exactly as it worked until CP-6's import
   *  runs and this install's three plugin variables are set. */
  const uploadViaLegacy = useCallback(
    async (file: File) => {
      const path = `project-files/${clientId}/${clientProjectId ?? "general"}/${Date.now()}-${safeFileName(file.name)}`;
      const { error } = await sb.storage.from("client-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      // Two steps on purpose: the bytes go straight to storage, and only
      // then is a row written. A failed upload leaves no row claiming a
      // file that is not there.
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
          ...(category ? { category } : {}),
        },
        adminPreview,
      );
    },
    [clientId, clientProjectId, clientName, category, sb, adminPreview],
  );

  const upload = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      if (demo) {
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
          if (source === "plugin") await uploadViaPlugin(file);
          else await uploadViaLegacy(file);
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
    [demo, source, uploadViaPlugin, uploadViaLegacy, load],
  );

  const remove = useCallback(
    async (file: ProjectFile) => {
      if (!confirm(`Remove ${file.name}?`)) return;
      if (demo) {
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
    [demo, clientId, adminPreview, load],
  );

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
    open,
  };
}
