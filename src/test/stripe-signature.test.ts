// A webhook that publishes to a client's social accounts and creates billing
// records is worth authenticating properly. These pin the two halves that are
// easy to get wrong: the constant-time compare, and the replay window.
import { describe, it, expect } from "vitest";
import {
  verifyStripeSignature, hmacHex, parseSignatureHeader, timingSafeEqual,
  TOLERANCE_SECONDS,
} from "../../supabase/functions/_shared/stripe/signature";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const NOW = new Date("2026-08-23T12:00:00Z");

async function sign(body: string, at: Date, secret = SECRET) {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}

describe("parseSignatureHeader", () => {
  it("pulls out the timestamp and every v1", () => {
    // Stripe sends more than one v1 while a signing secret is being rolled.
    const p = parseSignatureHeader("t=123,v1=aaa,v1=bbb");
    expect(p.timestamp).toBe("123");
    expect(p.signatures).toEqual(["aaa", "bbb"]);
  });

  it("copes with junk rather than throwing", () => {
    expect(parseSignatureHeader("").signatures).toEqual([]);
    expect(parseSignatureHeader("nonsense").timestamp).toBe("");
  });
});

describe("timingSafeEqual", () => {
  it("compares without short-circuiting on length or content", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  it("accepts a signature it just made", async () => {
    expect(await verifyStripeSignature(BODY, await sign(BODY, NOW), SECRET, NOW)).toBe(true);
  });

  it("rejects a body that changed after signing", async () => {
    const header = await sign(BODY, NOW);
    const tampered = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
    expect(await verifyStripeSignature(tampered, header, SECRET, NOW)).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const header = await sign(BODY, NOW, "whsec_someone_elses");
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it("rejects a replay from outside the window", async () => {
    // The half that is easy to omit. Without it, one captured event can be
    // resent forever and re-run whatever it triggers.
    const old = new Date(NOW.getTime() - (TOLERANCE_SECONDS + 1) * 1000);
    expect(await verifyStripeSignature(BODY, await sign(BODY, old), SECRET, NOW)).toBe(false);
  });

  it("accepts one inside the window, in both directions", async () => {
    const early = new Date(NOW.getTime() - (TOLERANCE_SECONDS - 5) * 1000);
    const late = new Date(NOW.getTime() + (TOLERANCE_SECONDS - 5) * 1000);
    expect(await verifyStripeSignature(BODY, await sign(BODY, early), SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(BODY, await sign(BODY, late), SECRET, NOW)).toBe(true);
  });

  it("accepts when any one of several v1s matches", async () => {
    const t = Math.floor(NOW.getTime() / 1000);
    const good = await hmacHex(SECRET, `${t}.${BODY}`);
    const header = `t=${t},v1=${"0".repeat(good.length)},v1=${good}`;
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });

  it("refuses when there is no secret or no header", async () => {
    expect(await verifyStripeSignature(BODY, await sign(BODY, NOW), "", NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, null, SECRET, NOW)).toBe(false);
  });
});
