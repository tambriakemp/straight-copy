// Mockup 15: the payment schedule, what is payable now, and the receipts.
//
// THE WHOLE SCHEDULE IS SHOWN, not just the bills that have been raised. A
// client looking at a three-payment contract and seeing two rows reads it as
// a cheaper contract, and then queries the third one when it arrives. The
// rows nobody has billed yet say "Later" and have no button, which is the
// honest version of the same information.
//
// NOTHING HERE TAKES MONEY. "Pay now" asks the server for a checkout URL and
// sends the browser to the provider. The fact of a payment arriving comes
// back through the provider's webhook, to the plugin, and is read on the next
// load -- which is why this page cannot mark anything paid and neither can
// anyone using it.

import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import { useAdminPreview, usePortalView } from "@/components/portal/useClientPortal";
import { PortalRequestError, clientPortal, money, shortDate } from "@/lib/clientPortalApi";
import type { PaymentRow, PaymentsView } from "@/lib/clientPortalWire";

export default function ClientPayments() {
  const { clientId } = useParams<{ clientId: string }>();
  const { adminPreview, viewAsGrant, actor, exitPreview } = useAdminPreview(clientId);
  const load = usePortalView<PaymentsView>(
    clientId ? () => clientPortal.payments(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const view = load.data;

  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(
    async (invoiceId: string) => {
      if (!clientId) return;
      setPaying(invoiceId);
      setError(null);
      try {
        const url = await clientPortal.checkout(clientId, invoiceId, adminPreview);
        // Replacing rather than opening a tab: a popup blocked by the
        // browser is a Pay button that does nothing, and the client has no
        // way to tell that from a broken one.
        window.location.assign(url);
      } catch (caught) {
        setError(
          caught instanceof PortalRequestError
            ? caught.message
            : "That payment could not be started. Please try again.",
        );
        setPaying(null);
      }
    },
    [clientId, adminPreview],
  );

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={view?.branding ?? null}
      me={view?.me ?? null}
      tab="payments"
      adminPreview={adminPreview}
      viewAsGrant={viewAsGrant}
      actor={actor}
      onExitPreview={exitPreview}
    >
      {load.error && !view ? (
        <PortalProblem message={load.error} onRetry={load.reload} />
      ) : !view ? (
        <PortalLoading what="your payments" />
      ) : (
        <>
          <h1 className="cp-h1">Payments</h1>

          <div className="cp__cards cp__cards--tiles">
            <Tile label="Project total" value={money(view.totalCents, view.currency)} />
            <Tile label="Paid" value={money(view.paidCents, view.currency)} tone="positive" />
            <Tile
              label="Next"
              value={view.next ? money(view.next.amountCents, view.currency) : "—"}
              note={view.next?.dueOn ? `due ${shortDate(view.next.dueOn)}` : undefined}
              tone={view.next ? "due" : undefined}
            />
          </div>

          {error && (
            <p className="cp-panel__error" role="alert">
              {error}
            </p>
          )}

          {view.rows.length === 0 ? (
            <div className="cp__state">
              There is nothing to pay yet. Your payment schedule appears here once your agreement
              is signed.
            </div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>
                    <span className="cp-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    currency={view.currency}
                    busy={paying === row.id}
                    onPay={() => void pay(row.id)}
                  />
                ))}
              </tbody>
            </table>
          )}

          <p className="cp-foot">{view.footnote}</p>
        </>
      )}
    </ClientPortalShell>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "due";
}) {
  return (
    <section className="cp-tile">
      <p className="cp-tile__label">{label}</p>
      <p className={`cp-tile__value${tone ? ` cp-tile__value--${tone}` : ""}`}>{value}</p>
      {note && <p className="cp-tile__note">{note}</p>}
    </section>
  );
}

const STATE_WORD: Record<PaymentRow["state"], string> = {
  paid: "Paid",
  ready: "Ready to pay",
  overdue: "Due now",
  later: "Later",
};

function Row({
  row,
  currency,
  busy,
  onPay,
}: {
  row: PaymentRow;
  currency: string;
  busy: boolean;
  onPay: () => void;
}) {
  return (
    <tr>
      <td className="cp-table__name">{row.label}</td>
      <td data-label="Due">
        {/* A date when there is one, and the rule in the licensee's own
            words when there is not -- "Before launch" is information, and
            an empty cell is not. */}
        {row.dueOn ? shortDate(row.dueOn) : (row.dueNote ?? "—")}
      </td>
      <td data-label="Amount">{money(row.amountCents, row.currency || currency)}</td>
      <td data-label="Status">
        <span className={`cp-pill cp-pill--${row.state}`}>
          {STATE_WORD[row.state]}
          {row.state === "paid" && row.paidWith && ` · ${row.paidWith}`}
        </span>
      </td>
      <td className="cp-table__act">
        {row.payable && (
          <button type="button" className="cp__btn cp__btn--primary" disabled={busy} onClick={onPay}>
            {busy ? "Opening…" : "Pay now"}
          </button>
        )}
        {row.receiptUrl && (
          <a className="cp__btn" href={row.receiptUrl}>
            ↓ Receipt
          </a>
        )}
      </td>
    </tr>
  );
}
