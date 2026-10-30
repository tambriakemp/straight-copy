import { useState } from "react";
import { toast } from "sonner";
import { clientPortal } from "@/lib/clientPortalApi";
import type { PortalSubscription } from "@/lib/clientPortalWire";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  unpaid: "Unpaid",
  paused: "Paused",
  canceled: "Cancelled",
  cancelled: "Cancelled",
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SubscriptionSection({
  clientId,
  tier,
  subscription,
  adminPreview,
}: {
  clientId: string;
  tier: string;
  subscription: PortalSubscription | null;
  adminPreview: boolean;
}) {
  const [sub, setSub] = useState<PortalSubscription | null>(subscription);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const tierLabel = tier === "growth" ? "Growth" : "Launch";
  const statusLabel = (sub?.status && STATUS_LABELS[sub.status]) || sub?.status || "—";

  // No subscription on file — nothing to manage from the portal.
  if (!sub) {
    return (
      <section className="portal-node-card">
        <div className="portal-node-card__head">
          <div className="portal-node-card__num">
            Plan <em>·</em>
          </div>
          <h2 className="portal-node-card__title">
            {tierLabel} <em>Plan</em>.
          </h2>
          <p className="portal-node-card__desc">
            Your billing isn't linked to the portal yet. To make changes to
            your plan, please reach out to your CRE8 contact.
          </p>
        </div>
      </section>
    );
  }

  async function callAction(action: "cancel" | "resume") {
    setWorking(true);
    try {
      const result = await (action === "cancel"
        ? clientPortal.cancelSubscription(clientId, sub!.id, adminPreview)
        : clientPortal.resumeSubscription(clientId, sub!.id, adminPreview));
      setSub(result.subscription);
      // The server's own words, not a toast written here: `requested: true`
      // does not mean done, and the two sources mean different things by
      // "cancelled" -- see `PortalSubscription.resumable`.
      toast.success(result.message);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update subscription");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="portal-node-card">
      <div className="portal-node-card__head">
        <div className="portal-node-card__num">
          Plan <em>·</em>
        </div>
        <h2 className="portal-node-card__title">
          {tierLabel} <em>Plan</em>.
        </h2>
        <p className="portal-node-card__desc">
          Manage your subscription below.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          padding: "24px 0 8px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              opacity: 0.6,
              marginBottom: 6,
            }}
          >
            Status
          </div>
          <div style={{ fontSize: 22 }}>{statusLabel}</div>
        </div>
        {sub.endsOn && (
          <div>
            <div
              style={{
                fontSize: 15,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                opacity: 0.6,
                marginBottom: 6,
              }}
            >
              {sub.canceledAt ? "Cancelled" : "Ends"}
            </div>
            <div style={{ fontSize: 22 }}>{formatDate(sub.endsOn)}</div>
          </div>
        )}
      </div>

      <div className="portal-composer__actions" style={{ marginTop: 16 }}>
        {sub.resumable ? (
          <button
            className="crm-btn crm-btn--bronze crm-btn--sm"
            disabled={working}
            onClick={() => callAction("resume")}
          >
            {working ? "Restoring…" : "Resume subscription"}
          </button>
        ) : !confirmOpen ? (
          <button
            className="crm-btn crm-btn--ghost crm-btn--sm"
            disabled={working}
            onClick={() => setConfirmOpen(true)}
          >
            Cancel subscription
          </button>
        ) : (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              padding: 16,
              width: "100%",
            }}
          >
            <p style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>
              Are you sure you want to cancel your plan? We'll confirm exactly
              when it stops once you do.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="crm-btn crm-btn--bronze crm-btn--sm"
                disabled={working}
                onClick={() => callAction("cancel")}
              >
                {working ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                className="crm-btn crm-btn--ghost crm-btn--sm"
                disabled={working}
                onClick={() => setConfirmOpen(false)}
              >
                Keep subscription
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
