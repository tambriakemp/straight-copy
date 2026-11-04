// Creating a client, from wherever the roster is showing.
//
// CRE-803: Paperclip is the source of truth for clients as of the CP-6
// cutover, so this no longer writes `clients` or `client_companies` — it
// used to, and the two inserts below are kept as a comment rather than
// deleted because reviving this dialog later means reviving exactly this
// shape, including the "first company" write done here rather than by the
// roster's own insert (two writers on business_name would race):
//
//   const { data, error } = await supabase.from("clients").insert({
//     contact_name, contact_email, purchased_at: new Date().toISOString(),
//   }).select("id").single();
//   if (data?.id && company) {
//     await supabase.from("client_companies").insert({
//       client_id: data.id, name: company, email, is_primary: true, order_index: 0,
//     });
//   }
//
// This used to live inline in Dashboard.tsx, which was fine while /admin/clients
// was the only place clients appeared. Then the roster moved into every agent's
// Workspace rail and the standalone page dropped out of the nav — so the table
// came along and the one control that adds to it did not. The roster was
// reachable from six screens and creatable from none. Still true now that
// creation is gone: both the standalone page and the agent Workspace rail
// render this one component, so there's one place to carry the read-only
// line instead of two to keep in sync.
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

interface Props {
  /** Called with the new client's id once both writes have settled. Unused
   * now that this no longer creates a client; kept so call sites need no
   * change if this is ever turned back on. */
  onCreated: (clientId: string) => void;
  /** Unused now; kept with the props above. */
  label?: string;
  /** Unused now; kept with the props above. */
  triggerClassName?: string;
}

export default function NewClientDialog(_props: Props) {
  return <ReadOnlyNotice subject="client list" />;
}
