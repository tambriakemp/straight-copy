ALTER TABLE public.client_proposals ALTER COLUMN source_pdf_path DROP NOT NULL;
ALTER TABLE public.client_proposals ALTER COLUMN status SET DEFAULT 'draft';