// Mockup 18: a shared-drive link, and what Cre8 Visions has shared back.
//
// CRE-827. The owner's decision, by voice: a client no longer uploads into
// the portal. They keep a shared drive folder of their own -- Google Drive
// or similar -- and paste the link here; the agency's own file CRUD moved
// to the Client Portal plugin (Bree only), and this screen only shows the
// client their own link and their "Shared with you" list.
//
// Files sent before this card shipped ("Sent by you") stay visible,
// read-only: no remove control, because removing one is the one action this
// card does not ask a client to be able to take any more, and no "nothing
// sent yet" filler for a list that can no longer grow. See `useClientFiles.ts`
// for the one copy of what the list does, and `useSharedDriveLink.ts` for the
// link field both Files screens share.
//
// A client with several live projects sees the chooser in this shell. A
// named project opens from `/files/:projectId`. See `useResolvedProject`.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download, ExternalLink, FileText } from "lucide-react";
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
import { useSharedDriveLink } from "@/components/portal/useSharedDriveLink";
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
  agencyName,
  adminPreview,
  viewAs,
}: {
  clientId: string;
  clientProjectId: string;
  agencyName: string;
  adminPreview: boolean;
  /**
   * A CRE-811 view-as grant (CRE-818).
   *
   * `client-files`' `list` is on the read allowlist, so the list below is
   * the client's real files; saving the shared-drive link is not, so a
   * preview draws the field read-only instead of a save button that would
   * fail.
   */
  viewAs: boolean;
}) {
  const { files, shared, unavailable, open } = useClientFiles({
    clientId,
    clientProjectId,
    adminPreview,
  });
  const drive = useSharedDriveLink({ clientId, adminPreview });
  const [previewing, setPreviewing] = useState<OpenedFile | null>(null);

  return (
    <>
      <div>
        <h1 className="cp-h1">Files</h1>
        <p className="cp-sub">Keep your files in your own shared drive, and download what {agencyName} has shared with you.</p>
      </div>

      <section className="cp-card">
        <div className="cp-card-head">
          <h2 className="cp-card__title">Your shared drive</h2>
        </div>
        <p className="cp-card__calm">
          Create a shared folder in Google Drive (or similar), set sharing to "anyone with the link" or
          add the {agencyName} team, then paste the link here. Upload everything into that folder — not here.
        </p>
        {viewAs ? (
          <p className="cp-card__calm">{drive.saved ?? "No link on file yet."}</p>
        ) : drive.editing ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input
              className="cp-input"
              style={{ flex: "1 1 260px" }}
              placeholder="https://drive.google.com/…"
              value={drive.draft}
              onChange={(event) => drive.setDraft(event.target.value)}
              autoFocus
            />
            <button type="button" className="cp__btn cp__btn--primary" disabled={drive.saving} onClick={() => void drive.save()}>
              {drive.saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="cp__btn" onClick={() => drive.setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : drive.saved ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <a href={drive.saved} target="_blank" rel="noreferrer" className="cp-file__name cp-file__name--link">
              {drive.saved} <ExternalLink size={12} style={{ display: "inline" }} />
            </a>
            <button type="button" className="cp__btn" onClick={() => drive.setEditing(true)}>
              Change link
            </button>
          </div>
        ) : (
          <button type="button" className="cp__btn cp__btn--primary" style={{ marginTop: 8 }} onClick={() => drive.setEditing(true)}>
            Add your shared drive link
          </button>
        )}
      </section>

      {unavailable ? (
        <section className="cp-card">
          <p className="cp-card__calm">
            File sharing isn't switched on yet. Reply to our last email with anything you need to
            send in the meantime.
          </p>
        </section>
      ) : (
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
                <FileRow key={file.id} file={file} agencyName={agencyName} onOpen={open} onPreview={setPreviewing} />
              ))}
            </ul>
          )}
        </section>
      )}

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
  agencyName,
  onOpen,
  onPreview,
}: {
  file: ProjectFile;
  agencyName: string;
  onOpen: (file: ProjectFile) => Promise<OpenedFile | null>;
  onPreview: (file: OpenedFile) => void;
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
        <span className="cp-pill">{`From ${agencyName}`}</span>
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
        </span>
      </div>
    </li>
  );
}
