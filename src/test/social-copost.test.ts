// The CoPost payload rules, extracted from two edge functions that had them
// duplicated and untested. The quirks pinned here are all things CoPost
// rejects in production rather than anything we chose.
import { describe, it, expect } from "vitest";
import {
  buildPostText,
  copostPayload,
  withImageExtension,
  isValidCopostEndpoint,
  MAX_IMAGES,
  MAX_TAGS,
} from "../../supabase/functions/_shared/social/copost";

describe("buildPostText", () => {
  it("puts the caption and the hashtags either side of a blank line", () => {
    expect(buildPostText("Fresh bread daily", ["bakery", "local"]))
      .toBe("Fresh bread daily\n\n#bakery #local");
  });

  it("normalises to exactly one leading hash", () => {
    // Stored without one, but a hand-written caption often has them.
    expect(buildPostText(null, ["#bakery", "local"])).toBe("#bakery #local");
  });

  it("copes with either half being missing", () => {
    expect(buildPostText("Just words", null)).toBe("Just words");
    expect(buildPostText("Just words", [])).toBe("Just words");
    expect(buildPostText(null, null)).toBe("");
    expect(buildPostText("   ", null)).toBe("");
  });
});

describe("withImageExtension", () => {
  it("appends the fragment CoPost's extension check needs", () => {
    expect(withImageExtension("https://x.co/a.png?token=abc"))
      .toBe("https://x.co/a.png?token=abc#.png");
  });

  it("is idempotent, so a retry cannot produce #.png#.png", () => {
    const once = withImageExtension("https://x.co/a?token=abc");
    expect(withImageExtension(once)).toBe(once);
  });
});

describe("copostPayload", () => {
  it("caps images at CoPost's limit", () => {
    const urls = Array.from({ length: 14 }, (_, i) => `https://x.co/${i}.png`);
    const p = copostPayload({ caption: "hi", hashtags: null, imageUrls: urls });
    expect(p.images).toHaveLength(MAX_IMAGES);
    expect(p.images[0]).toBe("https://x.co/0.png#.png");
  });

  it("caps tags and strips their leading hash", () => {
    const tags = Array.from({ length: 14 }, (_, i) => `#tag${i}`);
    const p = copostPayload({ caption: "hi", hashtags: tags, imageUrls: [] });
    expect(p.tags).toHaveLength(MAX_TAGS);
    expect(p.tags?.[0]).toBe("tag0");
  });

  it("omits tags entirely when there are none", () => {
    const p = copostPayload({ caption: "hi", hashtags: [], imageUrls: [] });
    expect(p.tags).toBeUndefined();
  });
});

describe("isValidCopostEndpoint", () => {
  it("accepts the real hosts", () => {
    expect(isValidCopostEndpoint("https://api.copost.io/triggers/abc")).toBe(true);
    expect(isValidCopostEndpoint("https://copost.io/triggers/abc")).toBe(true);
  });

  it("rejects a lookalike domain", () => {
    // This is the one that matters. Both existing senders check
    // host.endsWith("copost.io"), and "evilcopost.io".endsWith("copost.io")
    // is true — so the check they rely on lets this through.
    expect(isValidCopostEndpoint("https://evilcopost.io/triggers/abc")).toBe(false);
    expect(isValidCopostEndpoint("https://notcopost.io/x")).toBe(false);
  });

  it("rejects plaintext and anything unparseable", () => {
    expect(isValidCopostEndpoint("http://api.copost.io/triggers/abc")).toBe(false);
    expect(isValidCopostEndpoint("https://evil.com/triggers/abc")).toBe(false);
    expect(isValidCopostEndpoint("not a url")).toBe(false);
    expect(isValidCopostEndpoint("")).toBe(false);
  });
});
