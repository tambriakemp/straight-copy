-- Current-site URL for each prospect row (CRE-303): lets Bree open the
-- prospect's existing website next to our redesigned preview, right from the
-- approvals row, without opening the notes modal.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

alter table public.prospect_approvals
  add column if not exists current_site_url text;