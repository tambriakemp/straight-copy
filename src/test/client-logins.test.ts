// The Logins tab's rules. What they get wrong is a credential shown to the
// wrong person or a password silently wiped, and neither of those looks
// wrong on screen.
import { describe, it, expect } from "vitest";
import {
  signInLabel, subtitleFor, hrefFor, passwordToSend, shareBody, MASK,
  type ClientLoginRow,
} from "@/lib/clientLogins";

function row(over: Partial<ClientLoginRow> = {}): ClientLoginRow {
  return { id: "1", label: "Admin portal", url: null, username: null, note: null, has_password: true, ...over };
}

describe("signInLabel", () => {
  it("shows the host, not 120 characters of query string", () => {
    expect(signInLabel("https://login.example.com/?redirect=%2Fdash&t=abc")).toBe("login.example.com");
  });

  it("keeps a meaningful path", () => {
    expect(signInLabel("https://example.com/wp-admin")).toBe("example.com/wp-admin");
  });

  it("assumes https for a link typed without one", () => {
    expect(signInLabel("admin.example.com")).toBe("admin.example.com");
  });

  it("prints unparseable text as typed rather than dropping it", () => {
    // A link someone typed by hand is still the link they meant.
    expect(signInLabel("ask Gwyn for the link")).toBe("ask Gwyn for the link");
  });

  it("says nothing when there is no link", () => {
    expect(signInLabel(null)).toBeNull();
    expect(signInLabel("   ")).toBeNull();
  });
});

describe("subtitleFor", () => {
  it("joins the link and the username", () => {
    expect(subtitleFor({ url: "https://admin.example.com", username: "bree" }))
      .toBe("admin.example.com · bree");
  });

  it("skips whichever is missing instead of leaving a dangling dot", () => {
    expect(subtitleFor({ url: null, username: "bree" })).toBe("bree");
    expect(subtitleFor({ url: "https://a.com", username: null })).toBe("a.com");
    expect(subtitleFor({ url: null, username: null })).toBe("");
  });
});

describe("hrefFor", () => {
  it("adds a scheme so the link does not resolve against /admin", () => {
    expect(hrefFor("admin.example.com")).toBe("https://admin.example.com");
  });

  it("leaves a real URL alone", () => {
    expect(hrefFor("http://localhost:3000/login")).toBe("http://localhost:3000/login");
  });

  it("gives nothing to link to when there is no link", () => {
    expect(hrefFor(null)).toBeNull();
    expect(hrefFor(" ")).toBeNull();
  });
});

describe("passwordToSend", () => {
  it("sends blank on an edit, which the server reads as leave it alone", () => {
    // The form never shows the current password. Treating blank as "clear
    // it" wipes a credential every time someone fixes a typo in the label.
    expect(passwordToSend("", true)).toBe("");
    expect(passwordToSend("   ", true)).toBe("");
  });

  it("sends what was typed when something was typed", () => {
    expect(passwordToSend("hunter2", true)).toBe("hunter2");
    expect(passwordToSend("hunter2", false)).toBe("hunter2");
  });

  it("does not trim a password", () => {
    // A trailing space can be part of a password, and silently trimming it
    // produces a credential that does not work and looks right.
    expect(passwordToSend(" hunter2 ", false)).toBe(" hunter2 ");
  });
});

describe("shareBody", () => {
  const rows = [
    row({ id: "1", label: "Admin portal", url: "https://admin.example.com", username: "bree" }),
    row({ id: "2", label: "Patient portal", url: null, username: null }),
  ];

  it("never includes a password", () => {
    // Email is stored forever, forwarded and synced to every device. The
    // links and usernames are the useful half.
    const body = shareBody("Khadra", rows);
    expect(body).not.toContain(MASK);
    expect(body.toLowerCase()).not.toContain("hunter2");
    expect(body).toContain("Passwords are not in this email");
  });

  it("lists every login with whatever it has", () => {
    const body = shareBody("Khadra", rows);
    expect(body).toContain("Admin portal");
    expect(body).toContain("https://admin.example.com");
    expect(body).toContain("Username: bree");
    expect(body).toContain("Patient portal");
  });

  it("greets the client by name", () => {
    expect(shareBody("Khadra", rows).startsWith("Hi Khadra,")).toBe(true);
  });
});
