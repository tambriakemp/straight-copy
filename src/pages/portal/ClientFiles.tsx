// Mockup 18: send files to Cre8 Visions, download what they've shared.
//
// SAME DATA PATH AS THE OLD FILES TAB -- `client-files` list/register/remove,
// the two-step upload (bytes to `client-assets` via the caller's own
// session, then a row) and the 15MB cap -- just drawn in the row idiom
// Camille added for this card (`cp-file`/`cp-files`/`cp-drop`) instead of
// `FilesSection`'s light-admin rows. See `useClientFiles.ts` for the one copy
// of what the screen does.
//
// A client with several live projects has no file list of their own to show
// here: Files needs a resolved project id the same way Project does, and the
// nav item behind both leads to the chooser at `/projects` until somebody
// draws a switcher. See `useResolvedProject`.

import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import {
  useAdminPreview,
  usePortalView,
  useResolvedProject,
} from "@/components/portal/useClientPortal";
import { clientPortal } from "@/lib/clientPortalApi";
import { useClientFiles, type ProjectFile } from "@/components/portal/useClientFiles";
import FilePreview from "@/components/FilePreview";
import { fileSize, previewKind } from "@/lib/projectFiles";
import type { HomeView } from "@/lib/clientPortalWire";

// This is licensed, client-facing UI -- the agency's own name is sample
// text, same as mockup 18 drew it, not something to fall back on for a
// licensee whose branding hasn't loaded yet.
const FALLBACK_AGENCY_NAME = "the team";

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ClientFiles() {
  const { clientId } = useParams<{ clientId: string }>();
  const { adminPreview, viewAsGrant, actor, exitPreview } = useAdminPreview(clientId);

  const shell = usePortalView<HomeView>(
    clientId ? () => clientPortal.home(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const resolved = useResolvedProject(clientId, adminPreview);

  if (resolved.status === "choose") {
    return <Navigate replace to={`/portal/${clientId}/projects`} />;
  }

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={shell.data?.branding ?? null}
      me={shell.data?.me ?? null}
      tab="files"
      adminPreview={adminPreview}
      viewAsGrant={viewAsGrant}
      actor={actor}
      onExitPreview={exitPreview}
    >
      {shell.error && !shell.data ? (
        <PortalProblem message={shell.error} onRetry={shell.reload} />
      ) : resolved.status === "error" ? (
        <PortalProblem message="Something went wrong. Please try again." />
      ) : resolved.status === "missing" ? (
        <div className="cp__state">Your project has not been set up yet. We will tell you when it is.</div>
      ) : resolved.status === "loading" || !shell.data ? (
        <PortalLoading what="your files" />
      ) : (
        <FilesBody
          clientId={clientId ?? ""}
          clientProjectId={resolved.projectId!}
          clientName={resolved.data?.client.contact_name ?? null}
          agencyName={shell.data.branding?.agencyName || FALLBACK_AGENCY_NAME}
          adminPreview={adminPreview}
          viewAs={viewAsGrant}
        />
      )}
    </ClientPortalShell>
  );
}

function FilesBody({
  clientId,
  clientProjectId,
  clientName,
  agencyName,
  adminPreview,
  viewAs,
}: {
  clientId: string;
  clientProjectId: string;
  clientName: string | null;
  agencyName: string;
  adminPreview: boolean;
  /**
   * A CRE-811 view-as grant (CRE-818).
   *
   * `client-files`' `list` is on the read allowlist, so both tables below are
   * the client's real files. `register` and `remove` are NOT, and the upload
   * itself goes to storage through a Supabase session a view-as tab does not
   * have -- so the drop zone and the remove buttons are two controls that
   * would fail twice over. A disabled button is still a button somebody
   * clicks; the drop zone becomes a sentence instead.
   */
  viewAs: boolean;
}) {
  const {
    files, shared, sent, busy, unavailable, dragging, inputRef, onDragOver, onDragLeave, onDrop, upload, remove,
  } = useClientFiles({ clientId, clientProjectId, clientName, adminPreview });
  const [previewing, setPreviewing] = useState<ProjectFile | null>(null);

  return (
    <>
      <div>
        <h1 className="cp-h1">Files</h1>
        <p className="cp-sub">Send files to {agencyName} and download what they've shared with you.</p>
      </div>

      {viewAs ? (
        <section className="cp-card">
          <p className="cp-card__calm">
            The client sees a drop zone here. A preview is read-only, so it is left out rather
            than shown and refused — the two lists below are their real files.
          </p>
        </section>
      ) : unavailable ? (
        <section className="cp-card">
          <p className="cp-card__calm">
            File sharing isn't switched on yet. Reply to our last email with anything you need to
            send in the meantime.
          </p>
        </section>
      ) : (
        <section
          className="cp-card cp-drop"
          data-dragging={dragging ? "yes" : undefined}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <span className="cp-drop__icon" aria-hidden="true">
            <Upload size={20} strokeWidth={1.75} />
          </span>
          <div className="cp-drop__what">
            <div className="cp-drop__title">Drop files here to send them</div>
            <div className="cp-drop__sub">
              Logos, photos, documents, anything the team asked for. Up to 15MB each.
            </div>
          </div>
          <button
            type="button"
            className="cp__btn cp__btn--primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Sending…" : "Choose files"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => void upload(event.target.files)}
          />
        </section>
      )}

      <section className="cp-card">
        <div className="cp-card-head">
          <h2 className="cp-card__title">Shared with you</h2>
          <span className="cp-pill">{shared.length}</span>
        </div>
        {files === null ? (
          <p className="cp-card__calm">Loading…</p>
        ) : shared.length === 0 ? (
          <p className="cp-card__calm">
            Nothing yet. Contracts, designs and deliverables {agencyName} sends you show up here.
          </p>
        ) : (
          <ul className="cp-files">
            {shared.map((file) => (
              <FileRow key={file.id} file={file} mine={false} agencyName={agencyName} onPreview={setPreviewing} />
            ))}
          </ul>
        )}
      </section>

      <section className="cp-card">
        <div className="cp-card-head">
          <h2 className="cp-card__title">Sent by you</h2>
          <span className="cp-pill">{sent.length}</span>
        </div>
        {sent.length === 0 ? (
          <p className="cp-card__calm">Nothing sent yet. Anything you upload above goes straight to the team.</p>
        ) : (
          <ul className="cp-files">
            {sent.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                mine
                agencyName={agencyName}
                onPreview={setPreviewing}
                onRemove={viewAs ? undefined : remove}
              />
            ))}
          </ul>
        )}
      </section>

      {previewing?.url && (
        <FilePreview
          name={previewing.name}
          url={previewing.url}
          mime={previewing.mime}
          onClose={() => setPreviewing(null)}
        />
      )}
    </>
  );
}

function FileRow({
  file,
  mine,
  agencyName,
  onPreview,
  onRemove,
}: {
  file: ProjectFile;
  mine: boolean;
  agencyName: string;
  onPreview: (file: ProjectFile) => void;
  onRemove?: (file: ProjectFile) => Promise<void>;
}) {
  return (
    <li>
      <div className="cp-file">
        <span className="cp-file__icon" aria-hidden="true">
          <FileText size={16} strokeWidth={1.75} />
        </span>
        <span className="cp-file__what">
          {file.url && previewKind(file.mime, file.name) ? (
            <button
              type="button"
              className="cp-file__name cp-file__name--link"
              onClick={() => onPreview(file)}
            >
              {file.name}
            </button>
          ) : (
            <span className="cp-file__name">{file.name}</span>
          )}
          <span className="cp-file__meta">
            {[file.category, when(file.created_at), fileSize(file.size_bytes)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={`cp-pill${mine ? " cp-pill--sent" : ""}`}>
          {mine ? "From you" : `From ${agencyName}`}
        </span>
        <span className="cp-file__actions">
          {file.url && (
            <a className="cp__btn" href={file.url} target="_blank" rel="noreferrer">
              <Download size={14} strokeWidth={1.75} /> Download
            </a>
          )}
          {mine && onRemove && (
            <button
              type="button"
              className="cp__btn cp__btn--danger"
              aria-label="Remove"
              onClick={() => void onRemove(file)}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}
