// Creating a project on a client.
//
// CRE-803: Paperclip is the source of truth for client_projects as of the
// CP-6 cutover, so this no longer inserts into it. The dialog and its
// `client_projects` insert are kept as a comment, not deleted, because this
// used to be the only working "+ New project" control (the button navigated
// to a `?new=project` param nothing read, and projects were otherwise
// creatable only from the payment-schedule form) — reviving it means
// reviving exactly this shape, company picker included:
//
//   const { data, error } = await supabase.from("client_projects").insert({
//     client_id: clientId, name: title, type, company_id: companyId || null,
//   }).select("id").single();
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

export default function NewProjectDialog({
  onCreated: _onCreated,
}: {
  clientId?: string;
  /** Unused now that this no longer creates a project; kept so the call
   * site needs no change if this is ever turned back on. */
  onCreated: (projectId: string) => void;
}) {
  return <ReadOnlyNotice subject="project list" />;
}
