// The Files tab on a client's project, in the portal.
//
// CRE-827: the client no longer uploads here. They keep a shared drive
// folder of their own and paste the link below; what Cre8 Visions shares
// back still lists and downloads exactly as before. Files already sent
// before this card shipped stay visible, read-only -- the owner's choice
// between that and hiding them outright, explained in `ClientFiles.tsx`'s
// header, which carries the fuller version of this screen.
//
// `open()` mints a download link for one file, on the click that needs it,
// so a link minted when the page loaded is never still live -- or dead --
// by the time somebody clicks.
import { useState } from "react";
import { ExternalLink, FileText, Download } from "lucide-react";
import { fileSize, previewKind } from "@/lib/projectFiles";
import FilePreview from "@/components/FilePreview";
import { useClientFiles, type OpenedFile, type ProjectFile } from "@/components/portal/useClientFiles";
import { useSharedDriveLink } from "@/components/portal/useSharedDriveLink";

export type { ProjectFile };

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function FilesSection({
  clientId, clientProjectId, adminPreview,
}: {
  clientId: string;
  clientProjectId: string;
  adminPreview: boolean;
}) {
  const [previewing, setPreviewing] = useState<OpenedFile | null>(null);
  const { files, shared, sent, unavailable, open } = useClientFiles({
    clientId,
    clientProjectId,
    adminPreview,
  });
  const drive = useSharedDriveLink({ clientId, adminPreview });

  const row = (f: ProjectFile, mine: boolean) => {
    const canOpen = f.downloadable && previewKind(f.mime, f.name);
    const canDownload = f.downloadable;
    return (
      <div key={f.id} className="cv-it">
        <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}>
          <FileText size={22} />
        </span>
        <span className="cv-it__what">
          {canOpen ? (
            <button type="button" className="cv-filename" onClick={() => void open(f).then(setPreviewing)}>
              {f.name}
            </button>
          ) : <b>{f.name}</b>}
          <small>
            {[
              f.category,
              when(f.created_at),
              fileSize(f.size_bytes),
              f.status === "external" ? "not available yet" : null,
            ].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className={`cv-chip ${mine ? "cv-chip--violet" : "cv-chip--gray"}`}>
          {mine ? "From you" : "From Cre8 Visions"}
        </span>
        {canDownload && (
          <button
            type="button"
            className="cv-open"
            style={{ padding: "0 16px" }}
            onClick={() => void open(f).then((opened) => opened && window.open(opened.url, "_blank"))}
          >
            <Download size={14} style={{ marginRight: 6 }} /> Download
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="cv-pg">
      <div>
        <h2 className="cv-card-title" style={{ fontSize: 22 }}>Files</h2>
        <p className="cv-page-sub">
          Keep your files in your own shared drive, and download what Cre8 Visions has shared with you.
        </p>
      </div>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head">
          <h2 className="cv-card-title">Your shared drive</h2>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--cv-muted)" }}>
          Create a shared folder in Google Drive (or similar), set sharing to "anyone with the link" or add
          the Cre8 Visions team, then paste the link here. Upload everything into that folder — not here.
        </p>
        {drive.editing ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="cv-input"
              style={{ flex: "1 1 260px" }}
              placeholder="https://drive.google.com/…"
              value={drive.draft}
              onChange={(e) => drive.setDraft(e.target.value)}
              autoFocus
            />
            <button type="button" className="cv-open cv-open--dark" disabled={drive.saving} onClick={() => void drive.save()}>
              {drive.saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="cv-open" onClick={() => drive.setEditing(false)}>Cancel</button>
          </div>
        ) : drive.saved ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a href={drive.saved} target="_blank" rel="noreferrer" className="cv-filename">
              {drive.saved} <ExternalLink size={12} style={{ display: "inline" }} />
            </a>
            <button type="button" className="cv-open" onClick={() => drive.setEditing(true)}>Change link</button>
          </div>
        ) : (
          <button type="button" className="cv-open cv-open--dark" onClick={() => drive.setEditing(true)}>
            Add your shared drive link
          </button>
        )}
      </section>

      {unavailable ? (
        <section className="cv-card cv-card-pad">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            File sharing isn't switched on yet. Cre8 Visions will let you know
            when it is — in the meantime, reply to our last email with anything
            you need to send.
          </p>
        </section>
      ) : (
        <>
          <section className="cv-card cv-card-pad">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Shared with you</h2>
              <span className="cv-chip cv-chip--gray">{shared.length}</span>
            </div>
            {files === null ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Loading…</p>
            ) : !shared.length ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                Nothing yet. Contracts, designs and deliverables Cre8 Visions sends
                you show up here.
              </p>
            ) : shared.map((f) => row(f, false))}
          </section>

          {sent.length > 0 && (
            <section className="cv-card cv-card-pad">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Sent by you</h2>
                <span className="cv-chip cv-chip--gray">{sent.length}</span>
              </div>
              {sent.map((f) => row(f, true))}
            </section>
          )}
        </>
      )}

      {previewing && (
        <FilePreview
          name={previewing.filename} url={previewing.url} mime={previewing.mime}
          onClose={() => {
            if (previewing.url.startsWith("blob:")) URL.revokeObjectURL(previewing.url);
            setPreviewing(null);
          }}
        />
      )}
    </div>
  );
}
