// The social plan signup.
//
// Everything is collected here, before Stripe, because Checkout allows at most
// three custom fields and this needs a dozen. The trade is worth making twice
// over: an abandoned checkout still leaves the answers in social_signups, so a
// half-finished signup is a lead rather than nothing.
//
// No card details ever touch this page — it posts the answers, gets a Checkout
// Session URL back, and hands off to Stripe.
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CHANNELS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
];

const DAYS = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

/** The browser already knows this; asking would only be a chance to get it wrong. */
function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const label: React.CSSProperties = {
  display: "block", fontSize: 15, fontWeight: 500,
  color: "hsl(30 12% 20%)", marginBottom: 6,
};
const hint: React.CSSProperties = {
  display: "block", fontSize: 14, color: "hsl(30 8% 50%)",
  marginBottom: 8, fontWeight: 400,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 16,
  border: "1px solid hsl(30 12% 85%)", borderRadius: 6,
  background: "#fff", color: "hsl(30 12% 20%)",
};
const field: React.CSSProperties = { marginBottom: 22 };

export default function SocialSignup() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "", contact_name: "", business_name: "", phone: "",
    what_they_do: "", primary_offer: "", promote: "", avoid: "",
    tone_words: "", posts_per_week: 5,
    timezone: guessTimezone(),
  });
  const [channels, setChannels] = useState<string[]>(["instagram"]);
  const [days, setDays] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (list: string[], setList: (v: string[]) => void, key: string) =>
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-signup", {
        body: { ...form, channels, preferred_days: days, consent },
      });
      // invoke resolves with data.error set rather than throwing on a 4xx body,
      // so both have to be checked or a validation failure looks like success.
      if (error) throw error;
      const body = data as { url?: string; error?: string };
      if (body?.error) throw new Error(body.error);
      if (!body?.url) throw new Error("Could not start checkout");
      window.location.href = body.url;
    } catch (err) {
      toast({
        title: "That didn't go through",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "hsl(36 30% 97%)", minHeight: "100vh" }}>
      <Navbar />
      <main style={{ maxWidth: 620, margin: "0 auto", padding: "48px 20px 80px" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, color: "hsl(30 12% 15%)", marginBottom: 8 }}>
          Social media, handled
        </h1>
        <p style={{ fontSize: 18, color: "hsl(30 8% 45%)", marginBottom: 8 }}>
          $249 a month. We write the captions, build the calendar and post for
          you — you approve what goes out until you'd rather we just got on with it.
        </p>
        <p style={{ fontSize: 15, color: "hsl(30 8% 55%)", marginBottom: 36 }}>
          A few questions first so we can start properly. Takes about two minutes.
        </p>

        <form onSubmit={submit}>
          <div style={field}>
            <label style={label} htmlFor="business_name">Business name</label>
            <input id="business_name" style={input} required
              value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
          </div>

          <div style={{ ...field, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label} htmlFor="contact_name">Your name</label>
              <input id="contact_name" style={input} required
                value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <label style={label} htmlFor="email">Email</label>
              <input id="email" type="email" style={input} required
                value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div style={field}>
            <label style={label} htmlFor="what_they_do">
              What does the business do?
              <span style={hint}>A sentence or two, the way you'd say it out loud. This is what your captions get written from.</span>
            </label>
            <textarea id="what_they_do" style={{ ...input, minHeight: 90 }} required
              value={form.what_they_do} onChange={(e) => set("what_they_do", e.target.value)} />
          </div>

          <div style={field}>
            <label style={label} htmlFor="promote">
              What do you most want pushed right now?
              <span style={hint}>A product, an offer, a season. Leave it blank if nothing in particular.</span>
            </label>
            <textarea id="promote" style={{ ...input, minHeight: 70 }}
              value={form.promote} onChange={(e) => set("promote", e.target.value)} />
          </div>

          <div style={field}>
            <label style={label} htmlFor="avoid">
              Anything we should never say?
              <span style={hint}>Claims you can't make, topics to stay off, words you hate.</span>
            </label>
            <textarea id="avoid" style={{ ...input, minHeight: 70 }}
              value={form.avoid} onChange={(e) => set("avoid", e.target.value)} />
          </div>

          <div style={field}>
            <label style={label} htmlFor="tone_words">
              How should you sound?
              <span style={hint}>Three or four words — "warm, plain, unhurried".</span>
            </label>
            <input id="tone_words" style={input}
              value={form.tone_words} onChange={(e) => set("tone_words", e.target.value)} />
          </div>

          <fieldset style={{ ...field, border: 0, padding: 0, margin: "0 0 22px" }}>
            <legend style={label}>
              Which accounts do you have?
              <span style={hint}>Only pick what exists — we won't chase you for an account you never had.</span>
            </legend>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {CHANNELS.map((c) => (
                <button key={c.key} type="button"
                  onClick={() => toggle(channels, setChannels, c.key)}
                  style={{
                    padding: "9px 16px", borderRadius: 999, fontSize: 15, cursor: "pointer",
                    border: channels.includes(c.key) ? "1px solid hsl(30 20% 40%)" : "1px solid hsl(30 12% 85%)",
                    background: channels.includes(c.key) ? "hsl(30 30% 94%)" : "#fff",
                    color: "hsl(30 12% 20%)",
                  }}>
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div style={{ ...field, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label} htmlFor="posts_per_week">Posts per week</label>
              <input id="posts_per_week" type="number" min={1} max={14} style={input}
                value={form.posts_per_week}
                onChange={(e) => set("posts_per_week", Number(e.target.value))} />
            </div>
            <div>
              <label style={label} htmlFor="timezone">
                Timezone
                <span style={hint}>So posts land at a sensible hour where you are.</span>
              </label>
              <input id="timezone" style={input}
                value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </div>
          </div>

          <fieldset style={{ ...field, border: 0, padding: 0, margin: "0 0 26px" }}>
            <legend style={label}>
              Best days to post
              <span style={hint}>Optional — leave all unpicked and we'll spread them out.</span>
            </legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS.map((d) => (
                <button key={d.key} type="button"
                  onClick={() => toggle(days, setDays, d.key)}
                  style={{
                    padding: "8px 12px", borderRadius: 6, fontSize: 14, cursor: "pointer",
                    border: days.includes(d.key) ? "1px solid hsl(30 20% 40%)" : "1px solid hsl(30 12% 85%)",
                    background: days.includes(d.key) ? "hsl(30 30% 94%)" : "#fff",
                    color: "hsl(30 12% 20%)",
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            marginBottom: 26, fontSize: 15, color: "hsl(30 12% 25%)", cursor: "pointer",
          }}>
            <input type="checkbox" checked={consent} required
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 4 }} />
            <span>
              I'm authorising Cre8 Visions to publish to the accounts above on my
              behalf, and I have the rights to the photos I share.
            </span>
          </label>

          <button type="submit" disabled={busy}
            style={{
              width: "100%", padding: "14px 20px", fontSize: 17, borderRadius: 8,
              border: "none", cursor: busy ? "default" : "pointer",
              background: busy ? "hsl(30 12% 70%)" : "#8B7355", color: "#fff",
            }}>
            {busy ? "Taking you to checkout…" : "Continue to payment — $249/mo"}
          </button>
          <p style={{ fontSize: 14, color: "hsl(30 8% 55%)", marginTop: 12, textAlign: "center" }}>
            Cancel any time. Payment is handled by Stripe — we never see your card.
          </p>
        </form>
      </main>
      <Footer />
    </div>
  );
}
