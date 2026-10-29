// Mockup 18: send files to Cre8 Visions, download what they've shared.
//
// SAME DATA PATH AS THE OLD FILES TAB -- `client-files` list/remove and the
// 15MB cap -- just drawn in the row idiom Camille added for this card
// (`cp-file`/`cp-files`/`cp-drop`) instead of `FilesSection`'s light-admin
// rows. See `useClientFiles.ts` for the one copy of what the screen does,
// including the CRE-822 split between the plugin's create/complete flow and
// the pre-CRE-822 direct-to-bucket one.
//
// A client with several live projects sees the chooser in this shell. A
// named project opens from `/files/:projectId`. See `useResolvedProject`.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import ProjectChooser from "@/components/portal/ProjectChooser";
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
import {
  useClientFiles,
  type OpenedFile,
  type ProjectFile,
} from "@/components/portal/useClientFiles";
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
  const { clientId, projectId } = useParams<{ clientId: string; projectId?: string }>();
  const { adminPreview, viewAsGrant, actor, exitPreview } = useAdminPreview(clientId);

  const shell = usePortalView<HomeView>(
    clientId ? () => clientPortal.home(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const resolved = useResolvedProject(clientId, adminPreview, projectId);

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
      ) : resolved.status === "choose" ? (
        <ProjectChooser clientId={clientId ?? ""} projects={resolved.choices ?? []} target="files" />
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
    files, shared, sent, busy, unavailable, dragging, inputRef, onDragOver, onDragLeave, onDrop, upload, remove, open,
  } = useClientFiles({ clientId, clientProjectId, clientName, adminPreview });
  const [previewing, setPreviewing] = useState<OpenedFile | null>(null);

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
              <FileRow key={file.id} file={file} mine={false} agencyName={agencyName} onOpen={open} onPreview={setPreviewing} />
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
                onOpen={open}
                onPreview={setPreviewing}
                onRemove={viewAs ? undefined : remove}
              />
            ))}
          </ul>
        )}
      </section>

      {previewing && (
        <FilePreview
          name={previewing.filename}
          url={previewing.url}
          mime={previewing.mime}
          onClose={() => {
            if (previewing.url.startsWith("blob:")) URL.revokeObjectURL(previewing.url);
            setPreviewing(null);
          }}
        />
      )}
    </>
  );
}

function FileRow({
  file,
  mine,
  agencyName,
  onOpen,
  onPreview,
  onRemove,
}: {
  file: ProjectFile;
  mine: boolean;
  agencyName: string;
  onOpen: (file: ProjectFile) => Promise<OpenedFile | null>;
  onPreview: (file: OpenedFile) => void;
  onRemove?: (file: ProjectFile) => Promise<void>;
}) {
  const canOpen = file.downloadable && previewKind(file.mime, file.name);
  return (
    <li>
      <div className="cp-file">
        <span className="cp-file__icon" aria-hidden="true">
          <FileText size={16} strokeWidth={1.75} />
        </span>
        <span className="cp-file__what">
          {canOpen ? (
            <button
              type="button"
              className="cp-file__name cp-file__name--link"
              onClick={() => void onOpen(file).then((opened) => opened && onPreview(opened))}
            >
              {file.name}
            </button>
          ) : (
            <span className="cp-file__name">{file.name}</span>
          )}
          <span className="cp-file__meta">
            {[
              file.category,
              when(file.created_at),
              fileSize(file.size_bytes),
              file.status === "external" ? "not available yet" : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={`cp-pill${mine ? " cp-pill--sent" : ""}`}>
          {mine ? "From you" : `From ${agencyName}`}
        </span>
        <span className="cp-file__actions">
          {file.downloadable && (
            <button
              type="button"
              className="cp__btn"
              onClick={() => void onOpen(file).then((opened) => opened && window.open(opened.url, "_blank"))}
            >
              <Download size={14} strokeWidth={1.75} /> Download
            </button>
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
