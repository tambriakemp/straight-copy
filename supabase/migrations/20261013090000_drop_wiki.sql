-- The wiki is retired. Bree is not using it, and a knowledge base
-- nobody writes to is worse than none: it still answers questions, with
-- whatever was true the last time someone looked.
--
-- Everything goes — the four tables, the three enums and the two access
-- helpers. Nothing outside the wiki ever referenced them: the helpers
-- are used only by the wiki's own policies, and the agents' table
-- allowlist no longer lists the tables.
--
-- CASCADE on the tables, because their own policies and the revisions
-- foreign key depend on them. It cannot reach anything else: no other
-- table has a foreign key INTO these.
--
-- This is destructive and cannot be undone. Deploy the new agency-mcp
-- FIRST — the currently deployed copy still has eighteen wiki tools on
-- it, and they would start answering with "relation does not exist"
-- rather than disappearing.

drop table if exists public.wiki_revisions cascade;
drop table if exists public.wiki_documents cascade;
drop table if exists public.wiki_folders cascade;
drop table if exists public.wiki_user_roles cascade;

drop function if exists public.has_wiki_access(uuid);
drop function if exists public.is_wiki_founder(uuid);

drop type if exists public.wiki_access_level;
drop type if exists public.wiki_doc_status;
drop type if exists public.wiki_role;
