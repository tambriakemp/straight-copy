// Two small things the Files tabs both need, kept out of the components
// so they are the same on each side and can be tested.

/**
 * A storage-safe file name.
 *
 * Supabase storage keys allow a narrow character set, and a name with a
 * slash in it silently becomes a folder — so "invoices/april.pdf" from a
 * client's machine would land somewhere nobody looks for it. The ORIGINAL
 * name is kept in the row; this is only the key.
 */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name).trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return (cleaned.replace(/^[._]+/, "") || "file").slice(0, 120);
}

/**
 * "2.4 MB". Null for an unknown size rather than "0 B", which reads as
 * an empty file and makes people re-upload a file that arrived fine.
 */
export function fileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/** What a file can be shown as, or null when it can only be downloaded. */
export type PreviewKind = "image" | "pdf" | "html" | "text";

const BY_MIME: Array<[RegExp, PreviewKind]> = [
  [/^image\//i, "image"],
  [/^application\/pdf$/i, "pdf"],
  [/^text\/html$/i, "html"],
  [/^text\//i, "text"],
];

const BY_EXT: Array<[RegExp, PreviewKind]> = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.html?$/i, "html"],
  [/\.(txt|md|csv|log|json|ya?ml)$/i, "text"],
];

/**
 * Whether a file can be shown rather than only downloaded.
 *
 * The MIME type is tried first because it is what the browser will
 * actually honour, but it is NOT trusted alone: a file uploaded by
 * drag-and-drop from some clients arrives as application/octet-stream
 * or with no type at all, and refusing to preview a PDF called
 * "contract.pdf" because the browser forgot to label it is the kind of
 * thing that reads as broken.
 *
 * A generic type falls through to the extension; an unrecognised one
 * with no useful extension returns null and the row stays
 * download-only, which is the safe end to fail at.
 */
export function previewKind(mime: string | null | undefined, name = ""): PreviewKind | null {
  const m = (mime ?? "").trim().toLowerCase();
  const generic = !m || m === "application/octet-stream" || m === "binary/octet-stream";
  if (!generic) {
    for (const [re, kind] of BY_MIME) if (re.test(m)) return kind;
  }
  for (const [re, kind] of BY_EXT) if (re.test(name)) return kind;
  return null;
}
