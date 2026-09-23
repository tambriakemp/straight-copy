import { supabase } from "@/integrations/supabase/client";

export type ClientSignals = {
  proposalPending: boolean;
  balanceDue: boolean;
  previewAwaitingApproval: boolean;
};

export type ProposalRollup = {
  id: string;
  client_id: string;
  client_project_id: string;
  title: string;
  status: string;
  sent_at: string | null;
  client_signed_at: string | null;
  created_at: string;
};

export type InvoiceRollup = {
  id: string;
  client_id: string;
  client_project_id: string;
  label: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: string;
};

export type ProjectRollup = {
  id: string;
  client_id: string;
  name: string;
  status: string;
};

export type PreviewRollup = {
  id: string;
  client_project_id: string | null;
  name: string;
  slug: string;
};

export type AdminOperations = {
  proposals: ProposalRollup[];
  invoices: InvoiceRollup[];
  projects: ProjectRollup[];
  previewsAwaitingApproval: PreviewRollup[];
  clientNames: Record<string, string>;
  signals: Record<string, ClientSignals>;
};

export async function loadAdminOperations(): Promise<AdminOperations> {
  const [proposalsRes, invoicesRes, projectsRes, previewsRes, approvalsRes, clientsRes] = await Promise.all([
    supabase.from("client_proposals")
      .select("id, client_id, client_project_id, title, status, sent_at, client_signed_at, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("project_invoices")
      .select("id, client_id, client_project_id, label, amount_cents, currency, due_date, status")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("client_projects").select("id, client_id, name, status").order("created_at", { ascending: false }),
    supabase.from("preview_projects")
      .select("id, client_project_id, name, slug")
      .eq("archived", false),
    supabase.from("preview_approvals").select("project_id"),
    supabase.from("clients").select("id, business_name, contact_name"),
  ]);

  const error = proposalsRes.error ?? invoicesRes.error ?? projectsRes.error
    ?? previewsRes.error ?? approvalsRes.error ?? clientsRes.error;
  if (error) throw error;

  const proposals = (proposalsRes.data ?? []) as ProposalRollup[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRollup[];
  const projects = (projectsRes.data ?? []) as ProjectRollup[];
  const approvedPreviewIds = new Set((approvalsRes.data ?? []).map((row) => row.project_id));
  const previewsAwaitingApproval = ((previewsRes.data ?? []) as PreviewRollup[])
    .filter((preview) => preview.client_project_id && !approvedPreviewIds.has(preview.id));
  const clientNames = Object.fromEntries((clientsRes.data ?? []).map((client) => [
    client.id,
    client.contact_name || client.business_name || "Untitled client",
  ]));
  const projectById = Object.fromEntries(projects.map((project) => [project.id, project]));
  const signals: Record<string, ClientSignals> = {};
  const signalFor = (clientId: string) => (signals[clientId] ??= {
    proposalPending: false,
    balanceDue: false,
    previewAwaitingApproval: false,
  });

  proposals.filter((proposal) => proposal.status === "sent" && !proposal.client_signed_at)
    .forEach((proposal) => { signalFor(proposal.client_id).proposalPending = true; });
  invoices.filter((invoice) => invoice.status === "sent")
    .forEach((invoice) => { signalFor(invoice.client_id).balanceDue = true; });
  previewsAwaitingApproval.forEach((preview) => {
    const project = preview.client_project_id ? projectById[preview.client_project_id] : undefined;
    if (project) signalFor(project.client_id).previewAwaitingApproval = true;
  });

  return { proposals, invoices, projects, previewsAwaitingApproval, clientNames, signals };
}

export function projectMap(projects: ProjectRollup[]) {
  return Object.fromEntries(projects.map((project) => [project.id, project]));
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}