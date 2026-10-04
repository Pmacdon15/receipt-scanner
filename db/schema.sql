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
