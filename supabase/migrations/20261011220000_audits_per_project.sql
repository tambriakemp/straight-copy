-- Audits that belong to a project, with a kind and a review trail.
--
-- client_audits held a client_name, a slug, a password and a report URL:
-- enough to host one report behind a password, which is what /audit/:slug
-- does. It has no idea which project a report is about, what KIND of
-- audit it is, or whether anyone has looked at it before it went out.
-- The portal's Audits tab and the admin's review-and-send page both need
-- all three.
--
-- `kind` is a key into the catalogue in src/lib/auditKinds.ts, not an
-- enum: the catalogue is a product decision that changes with a code
-- review, and a check constraint here would mean a migration every time
-- an audit type is added.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

alter table public.client_audits
  add column if not exists client_project_id uuid references public.client_projects(id) on delete set null,
  add column if not exists kind text,
  add column if not exists cover_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists shared_at timestamptz;

comment on column public.client_audits.client_project_id is
  'Which project this report is about. Null for an audit run before a project existed — a prospect audit, say.';
comment on column public.client_audits.kind is
  'Catalogue key from src/lib/auditKinds.ts (security, performance, seo, …). Free text on purpose; the catalogue is code.';
comment on column public.client_audits.cover_note is
  'What Cre8 Visions wrote to the client. Opens the email and sits above the report.';
comment on column public.client_audits.reviewed_at is
  'When someone here checked it. Null means it has not been reviewed and must not be sent.';
comment on column public.client_audits.shared_at is
  'When it went to the client. Null means the client cannot see it yet.';

create index if not exists idx_client_audits_project
  on public.client_audits(client_project_id, created_at desc);

-- Versions are ordered by audited_at today, which breaks the moment two
-- land in the same second and gives no stable number to print. An
-- explicit one, backfilled from the existing order.
alter table public.audit_report_versions
  add column if not exists version integer;

with ranked as (
  select id, row_number() over (partition by client_audit_id order by audited_at, created_at) as rn
  from public.audit_report_versions
)
update public.audit_report_versions v
   set version = r.rn
  from ranked r
 where v.id = r.id and v.version is null;

comment on column public.audit_report_versions.version is
  'Version number within one audit, 1-based. Backfilled from audited_at order.';
