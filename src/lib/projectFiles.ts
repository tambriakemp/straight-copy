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
