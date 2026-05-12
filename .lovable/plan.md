## Goal
Replace the "App Development / Custom Development" product name shown on the SureCart hosted checkout/receipt with the payment schedule label (e.g. "Deposit", "Milestone 2", "Final"), so each invoice clearly identifies which milestone the client is paying.

## Change
**`supabase/functions/project-invoices/index.ts`** — in the `send` action's line item POST (around line 237), add `ad_hoc_name` (and optionally `ad_hoc_description`) so SureCart displays our label instead of the underlying product name.

```ts
await surecart("/line_items", {
  method: "POST",
  body: JSON.stringify({
    line_item: {
      checkout: invoiceCheckoutId,
      price: priceId,
      quantity: 1,
      ad_hoc_amount: row.amount_cents,
      ad_hoc_name: row.label,                              // e.g. "Deposit"
      ad_hoc_description: `${projectName} — ${row.label}`, // optional context line
    },
  }),
});
```

Project name comes from a quick lookup on `client_projects.name` (already fetched elsewhere in this function for the portal action — we'll do the same small select before building the line item).

No frontend, schema, or other backend changes. After deploy, re-send a scheduled invoice to verify the checkout header reads "Deposit" (or matching label) instead of "App Development".

## Notes / fallback
If SureCart ignores `ad_hoc_name` for prices that aren't flagged as ad-hoc on their side, the fallback is to PATCH the line item after creation, or to switch the underlying SureCart product/price to an "ad hoc" price type. We'll confirm with one test send first; if the label doesn't appear, I'll follow up with the price-type adjustment.
