// Looking at a file without downloading it first.
//
// Shared by the admin project panel and the client portal, because
// "can I see it" is the same question on both sides and a file that
// previews in one place and not the other is a bug report waiting to
// be filed.
//
// The URL is the short-lived signed one the list already holds, so a
// preview expires with everything else rather than being a second,
// longer-lived way to reach a private file.
import { useEffect } from "react";
import { X, Download } from "lucide-react";
import { previewKind, type PreviewKind } from "@/lib/projectFiles";

export default function FilePreview({
  name, url, mime, onClose,
}: {
  name: string;
  url: string;
  mime: string | null;
  onClose: () => void;
}) {
  const kind: PreviewKind | null = previewKind(mime, name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while this is over it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="cv-preview" role="dialog" aria-modal="true" aria-label={name}>
      {/* The backdrop closes it; the panel stops the click so a click
          inside never falls through to it. */}
      <button type="button" className="cv-preview__back" aria-label="Close preview" onClick={onClose} />
      <div className="cv-preview__panel" onClick={(e) => e.stopPropagation()}>
        <header className="cv-preview__bar">
          <span className="cv-preview__name">{name}</span>
          <span style={{ flex: 1 }} />
          <a className="cv-mini" href={url} target="_blank" rel="noreferrer" download>
            <Download size={14} /><span style={{ marginLeft: 6 }}>Download</span>
          </a>
          <button type="button" className="cv-mini" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>

        <div className="cv-preview__body">
          {kind === "image" ? (
            <img src={url} alt={name} className="cv-preview__img" />
          ) : kind ? (
            // Sandboxed, and with no allow-same-origin: a shared HTML
            // file is somebody else's markup, and it should not be able
            // to read this page's storage or call its session.
            <iframe
              src={kind === "pdf" ? `${url}#navpanes=0&toolbar=1&zoom=page-width` : url}
              title={name}
              className="cv-preview__frame"
              sandbox="allow-scripts allow-popups"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="cv-preview__none">
              <p style={{ margin: 0, fontSize: 15 }}>This kind of file can't be shown here.</p>
              <a className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
                href={url} target="_blank" rel="noreferrer" download>
                Download it instead
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
