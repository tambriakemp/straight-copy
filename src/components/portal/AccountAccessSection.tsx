// "Set Up Your Accounts" (CRE-822, G4).
//
// Moved off `brand-kit-intake`'s `account-access-*` actions and onto the
// Client Portal plugin. Two things changed shape along with the address:
//
//   * The checklist is data now, not four names hardcoded in this file and
//     four more in the edge function that had to agree with it. `initial.items`
//     comes from the server, already filtered to this client's tier, and an
//     install with nothing configured draws an empty list rather than a
//     guess at what to ask for.
//   * The secure note is write-only. The form used to read `notes` straight
//     back out of a plain jsonb column and pre-fill the textarea with it --
//     the one field this form's own copy tells a client to put a password
//     in, echoed to whoever next opened the page in that browser. The server
//     now answers `notes.present` and nothing else; this draws "Sent --
//     replace it" the way the Logins screen draws a row of dots, and only
//     sends `notes` on a save where the client actually touched the field.
//
// Attachments are plain Files (CRE-822, G7) filed with no project and the
// category "account-access", through the same `useClientFiles` hook the
// Files tab uses -- not a second upload mechanism that picks its own bucket
// path.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { clientPortal, PortalRequestError } from "@/lib/clientPortalApi";
import type { AccountAccessItem, AccountAccessView } from "@/lib/clientPortalWire";
import { useClientFiles } from "@/components/portal/useClientFiles";

const ATTACHMENTS_CATEGORY = "account-access";

function ItemCopy({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <ReactMarkdown
      components={{
        // Unwrapped rather than a `<p>`: this renders inside a `<span>`,
        // and a single short paragraph needs no block of its own.
        p: ({ children }) => <>{children}</>,
        a: (props) => <a {...props} target="_blank" rel="noreferrer" className="portal-access__link" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function AccountAccessSection({
  clientId,
  clientName,
  initial,
  adminPreview,
}: {
  clientId: string;
  /** For `uploaded_by_name` on an attachment, same as the Files tab. */
  clientName: string | null;
  initial: AccountAccessView;
  adminPreview: boolean;
}) {
  const [items] = useState<AccountAccessItem[]>(initial.items);
  const [checks, setChecks] = useState<Record<string, boolean>>(initial.checks);
  const [notePresent, setNotePresent] = useState(initial.notes.present);
  const [noteDraft, setNoteDraft] = useState("");
  const [submittedAt, setSubmittedAt] = useState<string | null>(initial.submittedAt);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!initial.complete);
  const noteEdited = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const requiredKeys = items.filter((item) => item.required).map((item) => item.key);
  const completedCount = requiredKeys.filter((key) => !!checks[key]).length;
  // Computed from `checks` directly, for feedback on the tap rather than on
  // the debounce. `submittedAt` -- the one fact that must never be guessed
  // locally -- still comes only from the server's response, below.
  const allDone = requiredKeys.length > 0 && requiredKeys.every((key) => !!checks[key]);

  const files = useClientFiles({
    clientId,
    clientProjectId: null,
    clientName,
    adminPreview,
    category: ATTACHMENTS_CATEGORY,
  });

  const persist = useCallback(async () => {
    setSaving(true);
    const sendingNote = noteEdited.current;
    try {
      const view = await clientPortal.saveAccountAccess(
        clientId,
        { checks, ...(sendingNote ? { notes: noteDraft } : {}) },
        adminPreview,
      );
      setSubmittedAt(view.submittedAt);
      setNotePresent(view.notes.present);
      if (sendingNote) {
        noteEdited.current = false;
        setNoteDraft("");
      }
    } catch (e) {
      console.error("[account-access] save failed", e);
      toast.error(e instanceof PortalRequestError ? e.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [clientId, checks, noteDraft, adminPreview]);

  // Auto-save on a debounce, same as the form always has. Firing on every
  // change to `checks` OR `noteDraft` is safe specifically because `persist`
  // only puts `notes` on the wire when `noteEdited` is set -- a checkbox
  // toggle never touches the note.
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(), 600);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, noteDraft]);

  const toggle = (key: string) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onNoteChange = (value: string) => {
    noteEdited.current = true;
    setNoteDraft(value);
  };

  const topLevel = items.filter((item) => !item.parentKey);
  const childrenOf = (key: string) => items.filter((item) => item.parentKey === key);

  return (
    <section className={`portal-access ${open ? "is-open" : "is-closed"}`}>
      <button type="button" className="portal-access__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Node 01 · Intake</div>
          <h2 className="portal-access__title">
            Set Up Your <em>Accounts</em>.
          </h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className={`portal-access__status ${allDone ? "is-done" : ""}`}>
            {requiredKeys.length === 0
              ? "Nothing to set up yet"
              : allDone
                ? "All set"
                : `${completedCount} of ${requiredKeys.length} complete`}
          </span>
          <span className={`portal-access__chev ${open ? "is-open" : ""}`}>›</span>
        </div>
      </button>

      {open && (
        <div className="portal-access__body">
          <p className="portal-access__intro">
            Before we start building your AI OS, we need a few things set up on your end. Don't worry --
            we'll guide you through each one. These are the accounts and tools your system will run on.
            Everything we build lives in your accounts so you own it all.
          </p>

          {topLevel.length > 0 && (
            <ul className="portal-access__list">
              {topLevel.map((item) => {
                const checked = !!checks[item.key];
                const children = childrenOf(item.key);
                return (
                  <li key={item.key} className={`portal-access__item ${checked ? "is-done" : ""}`}>
                    <label className="portal-access__row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(item.key)}
                        className="portal-access__cb"
                      />
                      <div className="portal-access__copy">
                        <span className="portal-access__lbl">
                          {item.label}
                          {!item.required && <span style={{ opacity: 0.6, fontWeight: 400 }}> (optional)</span>}
                        </span>
                        <span className="portal-access__desc">
                          <ItemCopy text={item.description} />
                        </span>
                      </div>
                    </label>

                    {children.length > 0 && (
                      <div className="portal-access__subs">
                        {children.map((child) => (
                          <label key={child.key} className="portal-access__sub">
                            <input type="checkbox" checked={!!checks[child.key]} onChange={() => toggle(child.key)} />
                            <span>{child.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="portal-access__divider" />

          <div className="portal-access__share">
            <h3 className="portal-access__sub-title">
              Share Your <em>Access</em>.
            </h3>
            <p className="portal-access__intro">
              Once your accounts are set up, use the options below to share access with us. Never share
              passwords directly -- instead add{" "}
              <a href="mailto:hello@cre8visions.com" className="portal-access__link">
                hello@cre8visions.com
              </a>{" "}
              as a team member or admin on each platform where that option exists. For platforms that
              don't have team access, use the secure note field below to share what we need.
            </p>

            <label className="portal-access__field-label">Secure notes</label>
            <textarea
              className="portal-access__textarea"
              placeholder={
                notePresent && !noteEdited.current
                  ? "Sent -- type here to replace it."
                  : "Anything we should know about your accounts, special access notes, or platforms without team invites…"
              }
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={4}
              maxLength={4000}
            />
            {notePresent && !noteEdited.current && (
              <p style={{ opacity: 0.6, fontSize: 13, margin: "4px 0 0" }}>A note is on file. Typing above replaces it.</p>
            )}

            <label className="portal-access__field-label">Attachments</label>
            <div className="portal-access__upload">
              <input
                ref={files.inputRef}
                type="file"
                multiple
                onChange={(e) => void files.upload(e.target.files)}
                disabled={files.busy}
                className="portal-access__file"
              />
              <span className="portal-access__upload-hint">
                {files.busy ? "Uploading…" : files.unavailable ? "Attachments are unavailable right now." : "Up to 15MB each"}
              </span>
            </div>

            {files.sent.length > 0 && (
              <ul className="portal-access__files">
                {files.sent.map((f) => (
                  <li key={f.id} className="portal-access__file-row">
                    <span className="portal-access__file-name">{f.name}</span>
                    <button
                      type="button"
                      className="portal-access__file-remove"
                      onClick={() => void files.remove(f)}
                      aria-label={`Remove ${f.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="portal-access__footer">
            <span className="portal-access__save">
              {saving ? "Saving…" : submittedAt ? `Submitted · ${new Date(submittedAt).toLocaleDateString()}` : "Auto-saved"}
            </span>
            {allDone && <span className="portal-access__badge">✓ Submitted to your CRE8 team</span>}
          </div>
        </div>
      )}
    </section>
  );
}
