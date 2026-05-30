import { format } from "date-fns";

interface SubscriptionClient {
  id: string;
  tier: string;
  surecart_subscription_id: string | null;
  surecart_customer_id: string | null;
  surecart_order_id: string | null;
  subscription_status: string | null;
  subscription_canceled_at: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  purchased_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  unpaid: "Unpaid",
  paused: "Paused",
  canceled: "Cancelled",
  cancelled: "Cancelled",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, padding: "12px 0", borderBottom: "1px solid hsl(40 20% 97% / 0.06)" }}>
      <div style={{ fontSize: 13, letterSpacing: "0.25em", textTransform: "uppercase", opacity: 0.55 }}>{label}</div>
      <div style={{ fontSize: 16, color: "hsl(40 20% 97%)", wordBreak: "break-all" }}>{value ?? "—"}</div>
    </div>
  );
}

export default function AutomationSubscriptionPanel({ client }: { client: SubscriptionClient }) {
  const tierLabel = client.tier === "growth" ? "Growth" : "Launch";
  const statusLabel = (client.subscription_status && STATUS_LABELS[client.subscription_status]) || client.subscription_status || "—";
  const isCancelled = client.subscription_status === "canceled" || client.subscription_status === "cancelled";

  if (!client.surecart_subscription_id) {
    return (
      <div style={{ padding: "32px 24px", color: "hsl(30 8% 62%)" }}>
        <div style={{ fontSize: 18, color: "hsl(40 20% 97%)", marginBottom: 8 }}>No SureCart subscription on file</div>
        <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 560 }}>
          This client hasn't been linked to a SureCart subscription yet. Once they purchase or are linked, the subscription details and status will show here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontStyle: "italic", fontSize: 32, color: "hsl(40 20% 97%)", margin: 0 }}>
          {tierLabel} Subscription
        </h2>
        <span
          style={{
            fontSize: 12,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            padding: "4px 10px",
            border: "1px solid hsl(40 20% 97% / 0.2)",
            color: isCancelled ? "hsl(0 70% 70%)" : "hsl(140 50% 65%)",
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div style={{ maxWidth: 720 }}>
        <Row label="Tier" value={tierLabel} />
        <Row label="Status" value={statusLabel} />
        <Row label="Purchased" value={fmt(client.purchased_at)} />
        <Row label="Current period ends" value={fmt(client.subscription_current_period_end)} />
        <Row label="Cancels at period end" value={client.subscription_cancel_at_period_end ? "Yes" : "No"} />
        {client.subscription_canceled_at && <Row label="Cancelled at" value={fmt(client.subscription_canceled_at)} />}
        <Row label="Subscription ID" value={<code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{client.surecart_subscription_id}</code>} />
        <Row label="Customer ID" value={client.surecart_customer_id ? <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{client.surecart_customer_id}</code> : "—"} />
        <Row label="Order ID" value={client.surecart_order_id ? <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{client.surecart_order_id}</code> : "—"} />
      </div>
    </div>
  );
}
