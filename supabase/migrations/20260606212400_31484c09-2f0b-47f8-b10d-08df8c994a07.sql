
DO $$
DECLARE
  t record;
  anon_tables text[] := ARRAY[
    'preview_projects','preview_files','preview_external_pages',
    'preview_comments','preview_comment_replies','preview_page_comments',
    'preview_approvals','preview_approval_events',
    'onboarding_invites','email_unsubscribe_tokens','suppressed_emails',
    'clients','client_projects','client_contracts','client_proposals',
    'client_deliveries','client_contacts','client_automations',
    'client_checklist_items','project_invoices','project_links',
    'project_notes','project_progress_reports','project_secrets',
    'project_tasks','project_task_epics','project_task_comments',
    'project_task_activity','project_task_attachments',
    'social_post_batches','social_posts','social_design_templates',
    'web_dev_discovery','journey_nodes','journey_templates',
    'wiki_documents','wiki_folders','wiki_revisions'
  ];
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.table_name);
    IF t.table_name = ANY(anon_tables) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t.table_name);
    END IF;
  END LOOP;

  -- Sequence grants for inserts that rely on serial/identity
  FOR t IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated, anon, service_role', t.sequence_name);
  END LOOP;
END $$;
