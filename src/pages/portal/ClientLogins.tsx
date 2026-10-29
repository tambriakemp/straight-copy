// Mockup 16: the logins a client has shared, and the one being asked for.
//
// THE LIST NEVER CARRIES A PASSWORD. Each row shows a mask. Copy on the
// password cell asks the server for that one login, writes the answer
// straight to the clipboard, and does not keep it in React state. The server
// only answers for a login shared with the signed-in client (or an admin
// previewing that client) and records the copy before it returns the value.
//
// The eye toggle on the share form is a different thing entirely -- it
// reveals what THEY are typing, before it is sent, which is how a person
// checks they did not fat-finger their own password.
//
// A PASSWORD TYPED INTO THE FORM is dropped the moment the request returns.
// A password fetched for Copy never enters state at all: it is a local in
// the click handler until the clipboard write settles.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
// The line-drawn eye mockup 16 puts in the password field, as an SVG -- which
// is also the only version of it that cannot fail. U+1F441 is
// `Emoji_Presentation=No`, so a browser hunts for it in the element's text
// fonts and never reaches the colour-emoji font that has it, putting a tofu
// box on the face of a control the client presses to check their own typing.
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import { useAdminPreview, usePortalView } from "@/components/portal/useClientPortal";
import { PortalRequestError, clientPortal, shortDate } from "@/lib/clientPortalApi";
import type { LoginRequest, LoginsView, SharedLogin } from "@/lib/clientPortalWire";

export default function ClientLogins() {
  const { clientId } = useParams<{ clientId: string }>();
  const { adminPreview, viewAsGrant, actor, exitPreview } = useAdminPreview(clientId);
  const load = usePortalView<LoginsView>(
    clientId ? () => clientPortal.logins(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const view = load.data;
  const [editing, setEditing] = useState<SharedLogin | null>(null);

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={view?.branding ?? null}
      me={view?.me ?? null}
      tab="logins"
      adminPreview={adminPreview}
      viewAsGrant={viewAsGrant}
      actor={actor}
      onExitPreview={exitPreview}
    >
      {load.error && !view ? (
        <PortalProblem message={load.error} onRetry={load.reload} />
      ) : !view ? (
        <PortalLoading what="your logins" />
      ) : (
        <>
          <h1 className="cp-h1">Logins you’ve shared</h1>
          <p className="cp-sub">
            Only {view.branding.agencyName} can see these. You can remove one any time.
          </p>

          <div className="cp-logins">
            <div className="cp-logins__list">
              {view.logins.length === 0 ? (
                <div className="cp__state">
                  You have not shared any logins yet. Use the form to send one securely.
                </div>
              ) : (
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>Login</th>
                      <th>Username</th>
                      <th>Password</th>
                      <th>Shared</th>
                      <th>
                        <span className="cp-sr">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.logins.map((login) => (
                      <LoginRow
                        key={login.id}
                        login={login}
                        clientId={clientId ?? ""}
                        adminPreview={adminPreview}
                        onEdit={() => setEditing(login)}
                        onChanged={load.reload}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <SharePanel
              // Remounted per request or per edit, so no password or field
              // from one form can survive into the next.
              key={editing?.id ?? view.requests[0]?.id ?? "new"}
              clientId={clientId ?? ""}
              view={view}
              request={editing ? null : (view.requests[0] ?? null)}
              editing={editing}
              adminPreview={adminPreview}
              onDone={() => {
                setEditing(null);
                load.reload();
              }}
              onCancelEdit={() => setEditing(null)}
            />
          </div>
        </>
      )}
    </ClientPortalShell>
  );
}

function LoginRow({
  login,
  clientId,
  adminPreview,
  onEdit,
  onChanged,
}: {
  login: SharedLogin;
  clientId: string;
  adminPreview: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await clientPortal.removeLogin(clientId, login.id, adminPreview);
      onChanged();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [clientId, login.id, adminPreview, onChanged]);

  return (
    <tr>
      <td className="cp-table__name">
        <span className="cp-chip" aria-hidden="true">
          {login.label.slice(0, 1).toUpperCase()}
        </span>
        {login.label}
      </td>
      <td className="cp-mono" data-label="Username">
        {login.username ? (
          <span className="cp-copyable">
            <span className="cp-copyable__text">{login.username}</span>
            <CopyButton value={login.username} what="username" />
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="cp-mono cp-mask" data-label="Password">
        <span className="cp-copyable">
          <span className="cp-copyable__text">{login.masked}</span>
          <CopyPasswordButton
            clientId={clientId}
            loginId={login.id}
            adminPreview={adminPreview}
          />
        </span>
      </td>
      <td data-label="Shared">{shortDate(login.sharedAt)}</td>
      <td className="cp-table__act">
        {confirming ? (
          <>
            <button type="button" className="cp__btn" onClick={() => setConfirming(false)} disabled={busy}>
              Keep
            </button>
            <button type="button" className="cp__btn cp__btn--danger" onClick={() => void remove()} disabled={busy}>
              {busy ? "Removing…" : "Remove it"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cp__btn" onClick={onEdit}>
              Update
            </button>
            <button type="button" className="cp__btn" onClick={() => setConfirming(true)}>
              Remove
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * The right-hand panel: three jobs, one form.
 *
 * It answers a named ask when there is one (mockup 16), edits a login when
 * the client pressed Update, and otherwise takes a new one. One form rather
 * than three because they differ in their heading and in one hidden field,
 * and three nearly-identical forms is three places to forget to clear the
 * password.
 */
function SharePanel({
  clientId,
  view,
  request,
  editing,
  adminPreview,
  onDone,
  onCancelEdit,
}: {
  clientId: string;
  view: LoginsView;
  request: LoginRequest | null;
  editing: SharedLogin | null;
  adminPreview: boolean;
  onDone: () => void;
  onCancelEdit: () => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? request?.label ?? "");
  const [url, setUrl] = useState(editing?.url ?? request?.urlHint ?? "");
  const [username, setUsername] = useState(editing?.username ?? request?.usernameHint ?? "");
  const [secret, setSecret] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt and braces with the `key` on the parent: if this ever stops being
  // remounted, the password still does not survive a change of subject.
  useEffect(() => {
    setSecret("");
    setShown(false);
  }, [editing?.id, request?.id]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await clientPortal.updateLogin(
          clientId,
          {
            id: editing.id,
            label: label.trim(),
            url: url.trim() || null,
            username: username.trim() || null,
            // An empty box on an edit means "leave the password alone". The
            // form never showed it, so submitting it unchanged must not
            // wipe what is stored.
            ...(secret.length > 0 ? { secret } : {}),
          },
          adminPreview,
        );
      } else {
        await clientPortal.shareLogin(
          clientId,
          {
            requestId: request?.id ?? null,
            label: label.trim() || null,
            url: url.trim() || null,
            username: username.trim() || null,
            secret,
          },
          adminPreview,
        );
      }
      setSecret("");
      onDone();
    } catch (caught) {
      setError(
        caught instanceof PortalRequestError
          ? caught.message
          : "That could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [editing, clientId, label, url, username, secret, request?.id, adminPreview, onDone]);

  const canSubmit =
    !busy && label.trim().length > 0 && (editing ? true : secret.length > 0);

  const asker = view.branding.contactName
    ? `${view.branding.contactName} asked for`
    : "We asked for";

  return (
    <section className="cp-panel cp-share">
      {editing ? (
        <h2 className="cp-panel__title">Update this login</h2>
      ) : request ? (
        <>
          <h2 className="cp-panel__title">{asker}</h2>
          <p className="cp-share__what">{request.label}</p>
          <p className="cp-share__why">
            {request.note}
            {request.note && " · "}
            requested {shortDate(request.requestedAt)}
            {/* An agent asking is a different fact from a person asking, and
                the client is entitled to know which it was. */}
            {request.askedByAgent && " · by an assistant"}
          </p>
        </>
      ) : (
        <h2 className="cp-panel__title">Share a login</h2>
      )}

      {(!request || editing) && (
        <label className="cp-field">
          <span className="cp-field__label">What it is for</span>
          <input
            className="cp-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Google Business Profile"
          />
        </label>
      )}

      <label className="cp-field">
        <span className="cp-field__label">Website</span>
        <input
          className="cp-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="business.google.com"
          autoComplete="off"
        />
      </label>

      <label className="cp-field">
        <span className="cp-field__label">Username</span>
        <input
          className="cp-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="cp-field">
        <span className="cp-field__label">
          Password{editing && <span className="cp-field__note"> — leave blank to keep it</span>}
        </span>
        <span className="cp-input__wrap">
          <input
            className="cp-input"
            type={shown ? "text" : "password"}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            // Offering to save a password INTO the browser on the page where
            // the client is handing it over is a second, unmanaged copy of
            // the thing being shared.
            autoComplete="new-password"
          />
          <button
            type="button"
            className="cp-input__eye"
            onClick={() => setShown((value) => !value)}
            aria-label={shown ? "Hide the password" : "Show what I typed"}
          >
            {shown ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        </span>
      </label>

      <p className="cp-locked">
        {/* The mockup's yellow padlock, and it survives being one: U+1F512 is
            `Emoji_Presentation=Yes`, so a browser goes straight to the
            colour-emoji font for it. The eye above is the opposite case. */}
        <span className="cp-locked__icon" aria-hidden="true">🔒️</span>
        Encrypted the moment you press Share. Copy places it on your clipboard and does not show it here.
      </p>

      {error && (
        <p className="cp-panel__error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="cp__btn cp__btn--primary cp__btn--wide"
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {busy ? "Sending…" : editing ? "Save changes" : "Share securely"}
      </button>

      {editing && (
        <button type="button" className="cp__btn cp__btn--wide" onClick={onCancelEdit} disabled={busy}>
          Cancel
        </button>
      )}
    </section>
  );
}

/**
 * Copy-to-clipboard with a short "Copied" confirmation.
 *
 * Username only. The password has its own button, which fetches the value
 * at click time and never receives it as a prop -- a prop would be state
 * in the parent.
 */
function CopyButton({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="cp__btn cp-copy"
      aria-label={copied ? "Copied" : `Copy ${what}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined);
      }}
    >
      {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * Copy one password. The value is requested when the button is pressed,
 * written to the clipboard, and dropped. It is not a prop and not state.
 */
function CopyPasswordButton({
  clientId,
  loginId,
  adminPreview,
}: {
  clientId: string;
  loginId: string;
  adminPreview: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "busy" | "copied" | "failed" | "empty">("idle");
  useEffect(() => {
    if (phase !== "copied" && phase !== "failed" && phase !== "empty") return;
    const timer = window.setTimeout(() => setPhase("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const label =
    phase === "copied"
      ? "Copied"
      : phase === "empty"
        ? "No password"
        : phase === "failed"
          ? "Try again"
          : phase === "busy"
            ? "Copying…"
            : "Copy";

  return (
    <button
      type="button"
      className="cp__btn cp-copy"
      aria-label={
        phase === "copied"
          ? "Copied"
          : phase === "empty"
            ? "No password is stored"
            : phase === "failed"
              ? "Couldn't copy the password"
              : "Copy password"
      }
      disabled={phase === "busy"}
      onClick={() => {
        if (phase === "busy") return;
        setPhase("busy");
        void (async () => {
          let password: string | null = null;
          try {
            password = await clientPortal.revealLogin(clientId, loginId, adminPreview);
            if (!password) {
              setPhase("empty");
              return;
            }
            if (!navigator.clipboard?.writeText) {
              setPhase("failed");
              return;
            }
            await navigator.clipboard.writeText(password);
            setPhase("copied");
          } catch {
            // The message is not shown. A refusal can be specific; an
            // unexpected error must not be, in case it quotes the request.
            setPhase("failed");
          } finally {
            password = null;
          }
        })();
      }}
    >
      {phase === "copied" ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
      <span>{label}</span>
    </button>
  );
}
