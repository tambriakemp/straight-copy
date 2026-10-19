// Workspace hub for the new .cv-admin shell (CRE-332). Phase 1: plain
// link-cards to each existing page — no content merging yet, that's Phase 5.
import { Link } from "react-router-dom";
import {
  Sparkles,
  CheckSquare,
  Rocket,
  LayoutGrid,
  Mail,
  ShieldCheck,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";

const HUB_ITEMS: Array<{ to: string; label: string; description: string; icon: LucideIcon }> = [
  { to: "/admin/agents", label: "Agents", description: "What every agent is doing", icon: Sparkles },
  { to: "/admin/tasks", label: "Tasks", description: "Every task across clients", icon: CheckSquare },
  { to: "/admin/ventures", label: "Ventures", description: "Venture pipeline and launches", icon: Rocket },
  { to: "/admin/portfolio", label: "Portfolio", description: "Past and live client work", icon: LayoutGrid },
  { to: "/admin/invites", label: "Invites", description: "Admin and client invites", icon: Mail },
  { to: "/admin/portal-access", label: "Portal access", description: "Client portal login status and invites", icon: KeyRound },
  { to: "/admin/audits", label: "Client passwords", description: "Portal credential audits", icon: ShieldCheck },
];

export default function More() {
  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader eyebrow="Workspace / More" title="More" subtitle="Everything else — agents, tasks, ventures and the rest of the workspace. Your profile, the API connection and the keys live at the bottom of the side nav now." />
        <div
          style={{
            padding: "8px 32px 32px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {HUB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} style={{ textDecoration: "none" }}>
                <Card style={{ padding: 20, height: "100%" }}>
                  <Icon size={20} strokeWidth={1.75} color="var(--cv-accent)" />
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--cv-ink)", marginTop: 10 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: "var(--cv-muted)", marginTop: 4 }}>{item.description}</div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
