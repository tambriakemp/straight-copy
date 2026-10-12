// A file name becomes a storage key, and a storage key with a slash in
// it silently becomes a folder — so a client's "invoices/april.pdf"
// lands somewhere nobody looks and the upload appears to have worked.
import { describe, it, expect } from "vitest";
import { safeFileName, fileSize } from "@/lib/projectFiles";

describe("safeFileName", () => {
  it("drops the path, because a slash makes a folder rather than a name", () => {
    expect(safeFileName("invoices/april.pdf")).toBe("april.pdf");
    expect(safeFileName("C:\\Users\\me\\logo.png")).toBe("logo.png");
  });

  it("replaces anything storage will not take", () => {
    expect(safeFileName("my logo (final) #2.png")).toBe("my_logo_final_2.png");
  });

  it("never returns an empty key", () => {
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("///")).toBe("file");
  });

  it("keeps the key short enough to store", () => {
    expect(safeFileName("a".repeat(400) + ".pdf").length).toBeLessThanOrEqual(120);
  });
});

describe("fileSize", () => {
  it("reads in the unit a person would use", () => {
    expect(fileSize(900)).toBe("900 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(fileSize(1024 * 1024 * 1024 * 3)).toBe("3 GB");
  });

  it("drops the decimal once the number is big enough not to need it", () => {
    expect(fileSize(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("says nothing for an unknown size rather than '0 B'", () => {
    // "0 B" reads as an empty file, and people re-upload a file that
    // arrived perfectly well.
    expect(fileSize(null)).toBeNull();
    expect(fileSize(undefined)).toBeNull();
    expect(fileSize(Number.NaN)).toBeNull();
    expect(fileSize(-1)).toBeNull();
  });

  it("still says 0 B for a genuinely empty file", () => {
    expect(fileSize(0)).toBe("0 B");
  });
});
