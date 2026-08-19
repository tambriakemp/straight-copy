-- RLS for the agent tables. Same admin-gated pattern as everything else.
-- push_subscriptions is the one exception: a row belongs to the admin who
-- registered that browser, so it is scoped by user_id as well.

ALTER TABLE public.agents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agents" ON public.agents
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage agent_runs" ON public.agent_runs
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage agent_actions" ON public.agent_actions
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Your own browser registrations only, even among admins.
CREATE POLICY "Admins manage own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (public.is_admin(auth.uid()) AND user_id = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid());

ALTER VIEW public.agent_pending_actions_v SET (security_invoker = on);
