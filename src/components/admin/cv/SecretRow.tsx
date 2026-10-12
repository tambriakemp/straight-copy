// One key, as a card you can open.
//
// It was a dark panel with the hint, the masked value and four buttons
// all stacked out in the open — nine of those down one page, every one
// shouting. Closed it is a name, a one-line summary and whether a value
// is set; open it is the value and what you can do with it. The long
// explanation of where a key goes is read once, when you are setting it
// up, and never again.
//
// Reveal resets when the card closes. These sit on a screen that gets
// shared and screenshotted, and the whole point of the dots is that
// they are the default.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw, ChevronDown, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// app_secrets isn't in the generated Database type — see Briefs.tsx's
// own comment on this same cast. Narrowed to the two calls this file
// makes rather than `any`, so a typo in either is still caught.
interface SecretsTable {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      maybeSingle: () => Promise<{ data: { value: string } | null }>;
    };
  };
  upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
}
const db = supabase as unknown as { from: (table: string) => SecretsTable };

function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export default function SecretRow({
  label, secretKey, placeholder = "", generated, hint,
}: { label: string; secretKey: string; placeholder?: string; generated: boolean; hint: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.from("app_secrets").select("value").eq("key", secretKey).maybeSingle()
      .then(({ data }) => { setValue(data?.value ?? null); setLoaded(true); });
  }, [secretKey]);

  // Closing hides the value again. Leaving it revealed means the next
  // person to open the card gets a plaintext key they did not ask for.
  const toggle = () => {
    setOpen((o) => {
      if (o) setRevealed(false);
      return !o;
    });
  };

  const save = async (next: string) => {
    setBusy(true);
    const { error } = await db.from("app_secrets")
      .upsert({ key: secretKey, value: next, rotated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setValue(next);
    setDraft("");
    setOpen(true);
    setRevealed(true);
    toast.success(`${label} saved`);
  };

  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );
  };

  const status = !loaded ? { label: "…", cls: "cv-chip--gray" }
    : value ? { label: "Set", cls: "cv-chip--green" }
      : { label: "Not set", cls: "cv-chip--amber" };

  return (
    <div className="cv-key">
      <button type="button" className="cv-key__head" onClick={toggle} aria-expanded={open}>
        <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}>
          <KeyRound size={20} />
        </span>
        <span className="cv-key__what">
          <b>{label}</b>
          <small>{hint}</small>
        </span>
        <span className={`cv-chip ${status.cls}`}>{status.label}</span>
        <ChevronDown size={18} className={`cv-key__chev ${open ? "cv-key__chev--on" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="cv-key__body">
          {!loaded ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Loading…</p>
          ) : value ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <code className="cv-code">
                {revealed ? value : "•".repeat(Math.min(value.length, 32))}
              </code>
              <button type="button" className="cv-mini" onClick={() => setRevealed((r) => !r)}
                title={revealed ? "Hide" : "Show"}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button type="button" className="cv-mini" onClick={copy} title="Copy">
                <Copy size={14} />
              </button>
              {generated ? (
                <button type="button" className="cv-mini cv-mini--danger" disabled={busy}
                  onClick={() => {
                    if (confirm(`Rotate ${label}? Anything using the old value stops working immediately.`)) {
                      void save(randomSecret());
                    }
                  }}>
                  <RefreshCw size={14} /><span style={{ marginLeft: 6 }}>Rotate</span>
                </button>
              ) : (
                <button type="button" className="cv-mini" disabled={busy} onClick={() => setValue(null)}>
                  Replace
                </button>
              )}
            </div>
          ) : generated ? (
            <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
              disabled={busy} onClick={() => void save(randomSecret())}>
              Generate
            </button>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input className="cv-input" style={{ flex: "1 1 220px" }} placeholder={placeholder}
                value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
                disabled={busy || !draft.trim()} onClick={() => void save(draft.trim())}>
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
