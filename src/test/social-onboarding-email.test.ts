// The onboarding emails are the whole client-facing half of the flow, so the
// copy is worth pinning — particularly that it never asks for something the
// client did not sign up for.
import { describe, it, expect } from "vitest";
import {
  channelList, welcomeHtml, welcomeSubject, reminderHtml, reminderSubject,
} from "../../supabase/functions/_shared/social/onboarding-email";

const base = {
  contactName: "Jane",
  businessName: "Menovia",
  portalUrl: "https://cre8visions.com/portal/abc",
  channels: ["instagram", "tiktok"],
};

describe("channelList", () => {
  it("reads the way a person would say it", () => {
    expect(channelList(["facebook", "instagram", "tiktok"]))
      .toBe("Facebook, Instagram and TikTok");
    expect(channelList(["instagram"])).toBe("Instagram");
    expect(channelList([])).toBe("your social accounts");
  });
});

describe("welcomeHtml", () => {
  it("names only the channels they said they have", () => {
    // Chasing a TikTok the client never had is how an onboarding email starts
    // getting ignored.
    const html = welcomeHtml(base);
    expect(html).toContain("Instagram and TikTok");
    expect(html).not.toContain("Facebook");
  });

  it("does not tell them to sign up for CoPost", () => {
    // The workspace is ours and the invite is already sent by the time this
    // lands. Telling them to go and sign up would send them to buy their own.
    expect(welcomeHtml(base).toLowerCase()).not.toContain("sign up");
  });

  it("links the portal and greets by name when there is one", () => {
    expect(welcomeHtml(base)).toContain(base.portalUrl);
    expect(welcomeHtml(base)).toContain("Hi Jane,");
    expect(welcomeHtml({ ...base, contactName: null })).toContain("Hi,");
  });

  it("escapes anything the client typed into the signup form", () => {
    const html = welcomeHtml({ ...base, contactName: "<script>x</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("puts the business name in the subject when known", () => {
    expect(welcomeSubject("Menovia")).toContain("Menovia");
    expect(welcomeSubject(null)).toBeTruthy();
  });
});

describe("reminderHtml", () => {
  const copost = { ...base, missing: { copost: true, photos: true }, attempt: 1 };
  const photos = { ...base, missing: { copost: false, photos: true }, attempt: 1 };

  it("asks for one thing at a time, even when two are outstanding", () => {
    // Both are missing here, but the email only mentions the invite: photos
    // are useless until there is somewhere to send them.
    const html = reminderHtml(copost);
    expect(html).toContain("invite");
    expect(html.toLowerCase()).not.toContain("media library");
  });

  it("switches to photos once CoPost is connected", () => {
    const html = reminderHtml(photos);
    expect(html.toLowerCase()).toContain("photos");
    expect(html).not.toContain("invite");
  });

  it("titles each case differently so the two do not look like a resend", () => {
    expect(reminderSubject(copost)).not.toBe(reminderSubject(photos));
  });
});
