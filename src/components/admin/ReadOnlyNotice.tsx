// CRE-803: CP-6 cutover. Clients, Projects, Proposals and Money are now
// read-only here — Paperclip is the source of truth, and the record still
// shows on this page so Bree can see the history, but nothing on this page
// writes to it any more. One line, wherever a create/edit/delete control
// used to be, rather than a removed button with no explanation in its place.
export function ReadOnlyNotice({ subject = "record" }: { subject?: string }) {
  return (
    // --cv-muted with a literal fallback: this renders on both the light
    // cv-* canvas pages and the dark .crm-vars / .ws__* surfaces (the
    // client dialog, the agent workspace rail), and only the first of
    // those defines --cv-muted.
    <p style={{ fontSize: 13, color: "var(--cv-muted, #5B6478)", margin: 0 }}>
      This {subject} now lives in Paperclip. Editing here is off.
    </p>
  );
}
