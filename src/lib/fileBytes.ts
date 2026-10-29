// Converting a File to base64 for a small inline upload, and a base64
// response from the server back into something a browser can open or
// download (CRE-822).
//
// Both directions are only ever used up to the plugin's inline-store
// ceiling -- a file above it is never read into memory as base64 at all,
// because the whole reason that ceiling exists is to bound how much a
// request handler holds in memory at once.

/** Base64 of a File's bytes, with no `data:...;base64,` prefix. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * A same-origin, revocable URL over base64 bytes the server handed back.
 *
 * The caller owns the URL and should `URL.revokeObjectURL` it once the
 * preview or download that used it is done -- there is no automatic
 * cleanup, and a tab that opens many files without revoking leaks memory
 * for as long as it stays open.
 */
export function blobUrlFromBase64(base64: string, mime: string | null): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], mime ? { type: mime } : undefined);
  return URL.createObjectURL(blob);
}
