// The client roster, as a filterable table.
//
// Replaces the card list. Bree asked for the shape SureContact uses for
// companies — a real table you can search, filter and sort — because a roster
// you scan is a roster you can find someone in.
//
// Written to be embedded as well as routed: the same table appears at
// /admin/clients and inside an agent's Workspace rail, so the two can never
// drift into showing different things.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ClientRow {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  archived: boolean;
  created_at: string;
}

type SortKey = "name" | "created_at" | "status";
type Status = "active" | "inactive" | "all";

/**
 * The client is the person, so the person's name is what a roster of clients
 * shows. It read the business name first, which meant a client running three
 * businesses appeared under whichever one happened to be primary — Menovia
 * rather than Khadra Kahin. Businesses are companies now and have their own
 * list; this column is who you are working with.
 */
const nameOf = (r: ClientRow) => r.contact_name || r.business_name || "Untitled";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function ClientsTable({
  onOpen, dense = false,
}: {
  /** Where a row click goes. Defaults to the full client page. */
  onOpen?: (id: string) => void;
  /** Trims the chrome for the narrower agent workspace column. */
  dense?: boolean;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created_at", dir: "desc",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Every client, archived included — the status filter is applied in the
      // browser so switching it is instant and does not re-query.
      const { data, error } = await supabase
        .from("clients")
        .select("id, business_name, contact_name, contact_email, archived, created_at")
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      if (!cancelled) {
        setRows((data ?? []) as ClientRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (status === "active" && r.archived) return false;
      if (status === "inactive" && !r.archived) return false;
      if (!q) return true;
      return (
        nameOf(r).toLowerCase().includes(q) ||
        (r.contact_name ?? "").toLowerCase().includes(q) ||
        (r.contact_email ?? "").toLowerCase().includes(q)
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return nameOf(a).localeCompare(nameOf(b)) * dir;
      if (sort.key === "status") return (Number(a.archived) - Number(b.archived)) * dir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });
  }, [rows, search, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" ? "asc" : "desc" }));

  const open = (id: string) => (onOpen ? onOpen(id) : navigate(`/admin/clients/${id}`));

  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="ctbl">
      <div className="ctbl__bar">
        <label className="ctbl__search">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, contact, or email…"
            aria-label="Search clients"
          />
        </label>
        <select
          className="ctbl__filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          aria-label="Filter by status"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
        <span className="ctbl__count">
          {loading ? "…" : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="ctbl__scroll">
        <table className="ctbl__table">
          <thead>
            <tr>
              <th>
                <button onClick={() => toggleSort("name")}>Name{arrow("name")}</button>
              </th>
              {!dense && <th className="ctbl__col-contact">Company</th>}
              <th>
                <button onClick={() => toggleSort("created_at")}>Created{arrow("created_at")}</button>
              </th>
              <th>
                <button onClick={() => toggleSort("status")}>Status{arrow("status")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={dense ? 3 : 4} className="ctbl__empty">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={dense ? 3 : 4} className="ctbl__empty">
                  {rows.length === 0 ? "No clients yet." : "Nothing matches that search."}
                </td>
              </tr>
            )}
            {!loading && filtered.map((r) => (
              <tr key={r.id} onClick={() => open(r.id)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") open(r.id); }}>
                <td className="ctbl__name">{nameOf(r)}</td>
                {!dense && (
                  <td className="ctbl__col-contact">
                    {r.business_name || r.contact_email || "—"}
                  </td>
                )}
                <td className="ctbl__when">{fmtDate(r.created_at)}</td>
                <td>
                  <span className={`ctbl__pill${r.archived ? " ctbl__pill--off" : ""}`}>
                    {r.archived ? "Inactive" : "Active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
