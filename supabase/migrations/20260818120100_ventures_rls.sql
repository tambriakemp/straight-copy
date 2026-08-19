-- RLS for the ventures tables. Matches the existing admin-gated pattern:
-- every policy is `public.is_admin(auth.uid())`.
--
-- funnel_events intentionally gets NO anon policy. The public ingest endpoint
-- (funnel-track) writes with the service role key only after validating the
-- venture's public_ingest_key, so the browser never touches the table directly.

ALTER TABLE public.ventures                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_launches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_snapshots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_checklist_items     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ventures" ON public.ventures
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage venture_launches" ON public.venture_launches
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage revenue_entries" ON public.revenue_entries
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage metric_snapshots" ON public.metric_snapshots
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage funnel_events" ON public.funnel_events
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage launch_checklist_templates" ON public.launch_checklist_templates
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage launch_checklist_items" ON public.launch_checklist_items
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- The view runs with the privileges of the querying user, so it inherits the
-- RLS on project_invoices and revenue_entries rather than bypassing it.
ALTER VIEW public.revenue_ledger_v SET (security_invoker = on);
ALTER VIEW public.latest_metric_snapshots_v SET (security_invoker = on);
