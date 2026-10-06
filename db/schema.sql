create extension if not exists "pgcrypto";

create table if not exists receipts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text        not null,
  merchant            text        not null,
  purchased_on        date,
  currency            char(3)     not null default 'CAD',
  subtotal_cents      integer,
  tax_cents           integer,
  total_cents         integer     not null default 0,
  receipt_type        text        not null default 'other',
  type_source         text        not null default 'user',
  detected_type       text,
  detected_confidence real,
  raw_text            text,
  -- Pathname of the receipt photo in the private Vercel Blob store
  -- (receipts/<user_id>/<uuid>.jpg), not a URL and not the image itself.
  image_url           text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint receipts_type_source_check check (type_source in ('user', 'auto')),
  constraint receipts_confidence_check
    check (detected_confidence is null or (detected_confidence >= 0 and detected_confidence <= 1))
);

create index if not exists receipts_user_purchased_idx
  on receipts (user_id, purchased_on desc nulls last, created_at desc);

create index if not exists receipts_user_type_idx
  on receipts (user_id, receipt_type);

-- Organizations (Clerk). A receipt saved while an organization is active is
-- shared with that organization; personal receipts keep org_id null.
-- Safe to re-run on an existing database.
alter table receipts add column if not exists org_id text;

create index if not exists receipts_org_purchased_idx
  on receipts (org_id, purchased_on desc nulls last, created_at desc)
  where org_id is not null;

create index if not exists receipts_org_type_idx
  on receipts (org_id, receipt_type)
  where org_id is not null;
