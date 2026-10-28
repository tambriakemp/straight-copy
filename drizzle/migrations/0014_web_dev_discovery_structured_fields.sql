-- CRE-780: web-dev-discovery-chat stored the whole conversation as JSON and
-- extracted nothing. Add a column to hold the structured intake pulled out
-- of it (socials, on-site contact details, wording, plus the rest of the
-- discovery fields) so the agency doesn't have to re-read a transcript.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's own agent.
ALTER TABLE public.web_dev_discovery
  ADD COLUMN IF NOT EXISTS extracted_intake jsonb;