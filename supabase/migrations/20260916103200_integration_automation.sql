create table app.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  account_label text not null,
  external_account_id text,
  status text not null default 'not_configured' check (status in ('not_configured','authorization_required','connected','degraded','disconnected','error')),
  secret_ref text,
  authorization_status text,
  access_token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_health_check_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index integration_provider_account_unique_idx on app.integration_connections(provider, account_label);
create index integration_provider_idx on app.integration_connections(provider, status);

create table app.integration_capabilities (
  connection_id uuid not null references app.integration_connections(id) on delete cascade,
  capability text not null,
  authorized boolean not null default false,
  configured_at timestamptz,
  primary key (connection_id, capability)
);

create table app.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  connection_id uuid references app.integration_connections(id) on delete set null,
  external_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  raw_payload jsonb not null,
  signature_valid boolean not null,
  replay_window_valid boolean,
  status text not null default 'received' check (status in ('received','processing','processed','failed','dead_lettered','ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  error_message text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index webhook_provider_event_unique_idx on app.webhook_events(provider, external_event_id);
create index webhook_processing_idx on app.webhook_events(status, received_at);

create table app.integration_actions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references app.integration_connections(id) on delete set null,
  provider text not null,
  capability text not null,
  operation text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  correlation_id uuid not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','blocked','dead_lettered')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now()
);
create index integration_actions_queue_idx on app.integration_actions(status, available_at);

create table app.api_idempotency_keys (
  key text not null,
  route text not null,
  request_hash text not null,
  status text not null check (status in ('processing','completed','failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (key, route)
);
create index api_idempotency_created_idx on app.api_idempotency_keys(created_at);

create table app.domain_events (
  id uuid primary key,
  type text not null,
  actor_user_id uuid references app.users(id) on delete set null,
  correlation_id uuid not null,
  causation_id uuid,
  payload_version integer not null default 1 check (payload_version > 0),
  payload jsonb not null,
  source text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','published','failed','dead_lettered')),
  attempts integer not null default 0 check (attempts >= 0),
  occurred_at timestamptz not null,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index domain_events_outbox_idx on app.domain_events(status, available_at, occurred_at);
create index domain_events_correlation_idx on app.domain_events(correlation_id, occurred_at);

create table app.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_user_id uuid references app.users(id) on delete set null,
  lead_id uuid references app.leads(id) on delete cascade,
  quote_id uuid references app.quotes(id) on delete cascade,
  order_id uuid references app.orders(id) on delete cascade,
  conversation_id uuid references app.conversations(id) on delete cascade,
  due_at timestamptz,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_status_idx on app.tasks(assigned_user_id, status, due_at);

create table app.automation_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','published','disabled')),
  definition jsonb not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version)
);
create unique index automation_one_published_version_idx on app.automation_definitions(key) where status = 'published';

create table app.automation_executions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references app.automation_definitions(id) on delete restrict,
  definition_version integer not null,
  trigger_event_id uuid references app.domain_events(id) on delete set null,
  correlation_id uuid not null,
  status text not null check (status in ('running','waiting','waiting_approval','completed','failed','skipped')),
  current_action_id text,
  current_action_index integer not null default 0 check (current_action_index >= 0),
  resume_at timestamptz,
  context jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  logs jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index automation_event_definition_unique_idx on app.automation_executions(definition_id, trigger_event_id) where trigger_event_id is not null;
create index automation_execution_status_idx on app.automation_executions(status, started_at);
create index automation_execution_resume_idx on app.automation_executions(status, resume_at) where status='waiting';
