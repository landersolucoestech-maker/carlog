-- Carlog single-company platform foundation.
-- The platform serves one company. Authorization is user/role/permission based.

create extension if not exists pgcrypto;
create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon;
revoke all on schema app from authenticated;
grant usage on schema app to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('carlog-documents','carlog-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','text/plain'])
on conflict (id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('carlog-cms-media','carlog-cms-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf'])
on conflict (id) do nothing;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table app.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_unique_idx on app.users (lower(email));

create table app.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table app.user_roles (
  user_id uuid not null references app.users(id) on delete cascade,
  role_id uuid not null references app.roles(id) on delete cascade,
  assigned_by uuid references app.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table app.role_permissions (
  role_id uuid not null references app.roles(id) on delete cascade,
  permission_id uuid not null references app.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create index user_roles_role_idx on app.user_roles(role_id);
create index role_permissions_permission_idx on app.role_permissions(permission_id);

create table app.company_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Car Log Connection',
  website_url text not null default 'https://carlogconnection.com',
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  support_email text,
  support_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into app.company_settings(id) values (1) on conflict (id) do nothing;

create table app.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  normalized_phone text,
  company_name text,
  source text,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_email_idx on app.contacts(lower(email)) where email is not null;
create index contacts_phone_idx on app.contacts(phone) where phone is not null;
create index contacts_normalized_phone_idx on app.contacts(normalized_phone) where normalized_phone is not null;

create table app.customers (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references app.contacts(id) on delete restrict,
  status text not null default 'active' check (status in ('active','inactive')),
  client_since timestamptz not null default now(),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_status_idx on app.customers(status, client_since desc);

create table app.attribution_touches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references app.contacts(id) on delete set null,
  visitor_id text,
  session_id text,
  source text,
  medium text,
  campaign text,
  campaign_id text,
  ad_group text,
  ad_group_id text,
  ad text,
  ad_id text,
  keyword text,
  gclid text,
  fbclid text,
  ttclid text,
  landing_page text,
  referrer text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index attribution_contact_time_idx on app.attribution_touches(contact_id, occurred_at desc);
create index attribution_gclid_idx on app.attribution_touches(gclid) where gclid is not null;
create index attribution_fbclid_idx on app.attribution_touches(fbclid) where fbclid is not null;
create index attribution_ttclid_idx on app.attribution_touches(ttclid) where ttclid is not null;

create table app.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references app.contacts(id) on delete restrict,
  status text not null default 'new' check (status in ('new','contacted','quoted','follow_up','won','lost')),
  source text not null default 'unknown',
  assigned_user_id uuid references app.users(id) on delete set null,
  origin text,
  destination text,
  vehicle_description text,
  first_touch_attribution_id uuid references app.attribution_touches(id) on delete set null,
  last_touch_attribution_id uuid references app.attribution_touches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_contact_idx on app.leads(contact_id);
create index leads_status_assignee_idx on app.leads(status, assigned_user_id);
create index leads_created_idx on app.leads(created_at desc);

create table app.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references app.leads(id) on delete restrict,
  contact_id uuid not null references app.contacts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','expired')),
  origin text,
  destination text,
  vehicle_description text,
  customer_price_cents bigint not null check (customer_price_cents >= 0),
  estimated_carrier_pay_cents bigint not null check (estimated_carrier_pay_cents >= 0),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_price_cents >= estimated_carrier_pay_cents)
);
create index quotes_lead_idx on app.quotes(lead_id, created_at desc);
create index quotes_status_expiry_idx on app.quotes(status, expires_at);
