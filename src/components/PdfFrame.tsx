// A stored PDF, rendered inline.
//
// Fetched into a blob rather than pointed at directly. A Supabase Storage
// signed URL is another origin, and Chromium refuses to render a cross-origin
// PDF in a frame unless the response is both `content-type: application/pdf`
// and `content-disposition: inline`. Miss either and it does not fail loudly —
// it hands the response to the download manager and leaves the frame blank, so
// the page looks like it is still loading forever. Reading the bytes and
// handing the browser a same-origin blob: URL sidesteps both headers.
//
// CRE-829, measured rather than assumed. A two-origin harness in Chromium,
// one page per header set:
//
//   | response from "storage"            | frame src = the URL | frame src = blob |
//   |------------------------------------|---------------------|------------------|
//   | application/pdf + inline           | renders             | renders          |
//   | application/pdf + attachment       | BLANK + download    | renders          |
//   | application/octet-stream + inline  | BLANK + download    | renders          |
//
// Both failing rows are reachable in production: `?download` and an object
// stored without an explicit content type — which is every proposal PDF that
// did not come through the admin upload form, including anything carried over
// by the /admin import. WebKit sniffs the bytes and renders them anyway, which
// is why this only showed up once a proposal was opened in a Chromium browser.
//
// Shared between the admin proposal preview and the client portal on purpose:
// the portal had the same blank frame, which is the worse half of the bug —
// a client opening a proposal and seeing nothing.
import { useEffect, useState } from "react";

/**
 * How the viewer should open.
 *
 * `navpanes=0` shuts the page-thumbnail rail — a 53-page proposal opened with
 * half the frame given to thumbnails of pages nobody is reading yet.
 * `toolbar=1` keeps the page counter, zoom and download, which are the
 * controls someone genuinely reaching page 40 needs. `zoom=page-width` rather
 * than `zoom=100`: a US Letter page is 816px and this frame is narrower than
 * that on most screens, so 100 clipped the right edge and gave the viewer its
 * own horizontal scrollbar.
 *
 * Other engines honour different subsets and ignore the rest harmlessly, so
 * all three are sent rather than guessing at the reader's browser.
 */
const VIEWER_PARAMS = "#navpanes=0&toolbar=1&zoom=page-width";

export default function PdfFrame({
  url,
  title,
  viewerParams = VIEWER_PARAMS,
  stateClassName = "cv-paper__none",
}: {
  url: string;
  title: string;
  viewerParams?: string;
  /**
   * The class the loading and failure messages wear. Both call sites sit
   * inside `.cv-paper__sheet`, which already styles a message filling the
   * sheet; the frame itself is sized by that same stylesheet, so nothing
   * here carries inline geometry.
   */
  stateClassName?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let created: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setFailed(false);

    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (cancelled) return;
        created = URL.createObjectURL(
          // Force the type: storage can serve octet-stream, which prompts a
          // download even from a blob URL.
          blob.type === "application/pdf"
            ? blob
            : new Blob([blob], { type: "application/pdf" }),
        );
        setBlobUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    // Revoked on unmount and whenever the url changes; without this, previewing
    // several documents leaks a copy of each for the life of the tab.
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (failed) {
    return (
      <div className={stateClassName}>
        <p style={{ margin: 0 }}>Could not load the document here.</p>
        {/* The signed URL still works in a tab of its own even when the
            headers stop it rendering in a frame, so this is a real way out
            rather than a shrug. */}
        <a href={url} target="_blank" rel="noreferrer">Open it in a new tab</a>
      </div>
    );
  }

  if (!blobUrl) {
    return <div className={stateClassName}>Loading the document…</div>;
  }

  return <iframe src={`${blobUrl}${viewerParams}`} title={title} />;
}
