// A one-time note, the first time a client meets a surface they have to act on.
//
// The portal has no onboarding of any kind — no coach-marks, no tour, no
// dismissible hints. This is the smallest thing that works: one sentence, shown
// once, gone for good when they dismiss it. Deliberately not a sequence. A
// client with one page to look at should not be walked through three steps to
// get to it, and a tour that reappears is worse than no tour.
//
// Keyed per client, following the convention already used for the brand-kit
// path in PortalProject.tsx: `cre8-portal-<thing>-<clientId>`.
import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  /** Stable id for this tip. Changing it shows the tip again to everyone. */
  tipId: string;
  clientId: string;
  children: React.ReactNode;
}

function storageKey(tipId: string, clientId: string) {
  return `cre8-portal-tip-${tipId}-${clientId}`;
}

export default function PortalFirstRunTip({ tipId, clientId, children }: Props) {
  // Starts hidden and is revealed by the effect, rather than the reverse. A tip
  // that flashes on every load for someone who dismissed it months ago is more
  // annoying than one that appears a frame late.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    try {
      if (!localStorage.getItem(storageKey(tipId, clientId))) setShow(true);
    } catch {
      // Private browsing, or storage disabled. Showing it every time is the
      // better failure: the client can still read and dismiss it, they just do
      // not get remembered.
      setShow(true);
    }
  }, [tipId, clientId]);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(storageKey(tipId, clientId), new Date().toISOString());
    } catch {
      // Nothing to do — it will come back next visit, which is survivable.
    }
  };

  if (!show) return null;

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        margin: "14px 0 0", padding: "12px 14px",
        border: "1px solid hsl(30 20% 34%)",
        background: "hsl(30 25% 44% / 0.12)",
        borderRadius: 6,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, color: "hsl(40 20% 92%)", lineHeight: 1.5 }}>
        {children}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, background: "none", border: "none", cursor: "pointer",
          color: "hsl(30 8% 62%)", padding: 2, lineHeight: 0,
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
