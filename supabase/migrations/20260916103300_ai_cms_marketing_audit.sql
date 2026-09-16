create table app.ai_skill_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text not null,
  category text not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  input_schema jsonb not null,
  output_schema jsonb not null,
  instructions text not null,
  required_permissions text[] not null default '{}',
  approval_policy text not null default 'supervised' check (approval_policy in ('manual','supervised','automatic')),
  timeout_ms integer not null default 30000 check (timeout_ms > 0),
  max_attempts integer not null default 1 check (max_attempts > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version)
);
create unique index ai_skill_one_active_version_idx on app.ai_skill_definitions(key) where status = 'active';

create table app.ai_skill_tools (
  skill_id uuid not null references app.ai_skill_definitions(id) on delete cascade,
  tool_key text not null,
  required_permission text not null,
  primary key (skill_id, tool_key)
);

create table app.ai_skill_executions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references app.ai_skill_definitions(id) on delete restrict,
  skill_version integer not null,
  user_id uuid not null references app.users(id) on delete restrict,
  correlation_id uuid not null,
  status text not null check (status in ('pending_approval','running','completed','failed')),
  input jsonb not null,
  output jsonb,
  pending_tool_calls jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_execution_user_time_idx on app.ai_skill_executions(user_id, started_at desc);
create index ai_execution_status_idx on app.ai_skill_executions(status, started_at);

create table app.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  seo_title text,
  meta_description text,
  published_version integer,
  created_by uuid references app.users(id) on delete set null,
  updated_by uuid references app.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.cms_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references app.cms_pages(id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);

create table app.cms_media (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cms_media_created_idx on app.cms_media(created_at desc);

create table app.cms_navigation_items (
  id uuid primary key default gen_random_uuid(),
  location text not null default 'primary',
  label text not null,
  href text not null,
  sort_order integer not null default 0,
  visible boolean not null default true,
  parent_id uuid references app.cms_navigation_items(id) on delete cascade,
  created_by uuid references app.users(id) on delete set null,
  updated_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cms_navigation_location_idx on app.cms_navigation_items(location, sort_order, id);

create table app.cms_forms (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references app.users(id) on delete set null,
  updated_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.cms_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references app.cms_forms(id) on delete restrict,
  contact_id uuid references app.contacts(id) on delete set null,
  lead_id uuid references app.leads(id) on delete set null,
  attribution_touch_id uuid references app.attribution_touches(id) on delete set null,
  payload jsonb not null,
  idempotency_key text not null unique,
  submitted_at timestamptz not null default now()
);
create index cms_form_submission_form_idx on app.cms_form_submissions(form_id, submitted_at desc);

create table app.social_content (
  id uuid primary key default gen_random_uuid(),
  source_page_id uuid references app.cms_pages(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'draft' check (status in ('draft','review','approved','scheduled','published','failed')),
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.social_content_variants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references app.social_content(id) on delete cascade,
  provider text not null check (provider in ('instagram','facebook','tiktok','youtube','google_business_profile')),
  payload jsonb not null,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_content_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_variant_schedule_idx on app.social_content_variants(approval_status, scheduled_at) where published_at is null;

create table app.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_ads','meta_ads','tiktok_ads','internal')),
  external_campaign_id text,
  name text not null,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index marketing_campaign_external_unique_idx on app.marketing_campaigns(provider, external_campaign_id) where external_campaign_id is not null;

create table app.marketing_conversions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references app.marketing_campaigns(id) on delete set null,
  attribution_touch_id uuid references app.attribution_touches(id) on delete set null,
  contact_id uuid references app.contacts(id) on delete set null,
  lead_id uuid references app.leads(id) on delete set null,
  quote_id uuid references app.quotes(id) on delete set null,
  order_id uuid references app.orders(id) on delete set null,
  conversion_type text not null,
  value_cents bigint,
  occurred_at timestamptz not null,
  external_conversion_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index marketing_conversion_external_unique_idx on app.marketing_conversions(external_conversion_id) where external_conversion_id is not null;
create index marketing_conversion_order_idx on app.marketing_conversions(order_id) where order_id is not null;
create index marketing_conversion_type_time_idx on app.marketing_conversions(conversion_type, occurred_at);

create table app.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on app.audit_events(entity_type, entity_id, created_at desc);
create index audit_actor_idx on app.audit_events(actor_user_id, created_at desc);
create index audit_correlation_idx on app.audit_events(correlation_id) where correlation_id is not null;
