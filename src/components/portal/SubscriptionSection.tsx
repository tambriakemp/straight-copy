import { useState } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type SubscriptionState = {
  id: string | null;
  status: string | null;
  canceled_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

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
  initial,
}: {
  clientId: string;
  tier: string;
  initial: SubscriptionState;
}) {
  const [sub, setSub] = useState<SubscriptionState>(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const tierLabel = tier === "growth" ? "Growth" : "Launch";
  const isCancelled =
    sub.status === "canceled" || sub.status === "cancelled";
  const statusLabel =
    (sub.status && STATUS_LABELS[sub.status]) || sub.status || "—";

  // No SureCart subscription on file — nothing to manage from the portal.
  if (!sub.id) {
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
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/cancel-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PUB_KEY}`,
          },
          body: JSON.stringify({ clientId, action }),
        },
      );
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data?.error || "Request failed");
      }
      const s = data.subscription || {};
      setSub((prev) => ({
        ...prev,
        status: s.status ?? prev.status,
        canceled_at: s.canceled_at ?? null,
        cancel_at_period_end: !!s.cancel_at_period_end,
      }));
      toast.success(
        action === "cancel"
          ? "Your subscription has been cancelled."
          : "Welcome back — your subscription is active again.",
      );
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
          Manage your subscription below. Cancellations take effect immediately.
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
              fontSize: 11,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              opacity: 0.6,
              marginBottom: 6,
            }}
          >
            Status
          </div>
          <div style={{ fontSize: 18 }}>{statusLabel}</div>
        </div>
        {sub.canceled_at && (
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                opacity: 0.6,
                marginBottom: 6,
              }}
            >
              Cancelled
            </div>
            <div style={{ fontSize: 18 }}>{formatDate(sub.canceled_at)}</div>
          </div>
        )}
      </div>

      <div className="portal-composer__actions" style={{ marginTop: 16 }}>
        {isCancelled ? (
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
            <p style={{ margin: 0, marginBottom: 12, fontSize: 14 }}>
              Are you sure? Your access will end immediately and any in-progress
              builds will pause. You can resume anytime.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="crm-btn crm-btn--bronze crm-btn--sm"
                disabled={working}
                onClick={() => callAction("cancel")}
              >
                {working ? "Cancelling…" : "Yes, cancel now"}
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
