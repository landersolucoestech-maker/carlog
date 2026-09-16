create table app.carriers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  dba_name text,
  usdot_number text,
  mc_number text,
  email text,
  phone text,
  authority_status text not null default 'unknown' check (authority_status in ('active','inactive','unknown')),
  insurance_status text not null default 'unknown' check (insurance_status in ('verified','expired','unknown')),
  insurance_expires_at timestamptz,
  internal_approval text not null default 'review' check (internal_approval in ('approved','review','blocked')),
  risk_level text not null default 'unknown' check (risk_level in ('low','medium','high','unknown')),
  compliance_last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index carriers_usdot_unique_idx on app.carriers(usdot_number) where usdot_number is not null;
create unique index carriers_mc_unique_idx on app.carriers(mc_number) where mc_number is not null;
create index carriers_eligibility_idx on app.carriers(authority_status, insurance_status, internal_approval, risk_level);

create table app.carrier_compliance_snapshots (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references app.carriers(id) on delete cascade,
  provider text not null check (provider in ('fmcsa','internal')),
  provider_reference text,
  factual_data jsonb not null,
  normalized_data jsonb not null,
  checked_at timestamptz not null default now(),
  changed_from_previous boolean not null default false,
  created_at timestamptz not null default now()
);
create index carrier_compliance_history_idx on app.carrier_compliance_snapshots(carrier_id, checked_at desc);

create table app.orders (
  id uuid primary key default gen_random_uuid(),
  source_quote_id uuid not null unique references app.quotes(id) on delete restrict,
  contact_id uuid not null references app.contacts(id) on delete restrict,
  customer_id uuid not null references app.customers(id) on delete restrict,
  carrier_id uuid references app.carriers(id) on delete restrict,
  origin text,
  destination text,
  vehicle_description text,
  status text not null default 'booked' check (status in ('booked','sourcing','carrier_selected','pickup_scheduled','picked_up','in_transit','delivered','settled','cancelled')),
  customer_price_cents bigint not null check (customer_price_cents >= 0),
  carrier_pay_cents bigint not null default 0 check (carrier_pay_cents >= 0),
  pickup_start_at timestamptz,
  pickup_end_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  settled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup_end_at is null or pickup_start_at is null or pickup_end_at >= pickup_start_at),
  check (customer_price_cents >= carrier_pay_cents)
);
create index orders_status_idx on app.orders(status, updated_at desc);
create index orders_carrier_idx on app.orders(carrier_id) where carrier_id is not null;

create table app.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references app.users(id) on delete set null,
  source text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index order_status_history_idx on app.order_status_events(order_id, occurred_at);

create table app.dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete cascade,
  carrier_id uuid not null references app.carriers(id) on delete restrict,
  status text not null check (status in ('proposed','assigned','cancelled','completed')),
  carrier_pay_cents bigint not null check (carrier_pay_cents > 0),
  assigned_by uuid references app.users(id) on delete set null,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dispatch_active_order_unique_idx on app.dispatch_assignments(order_id) where status in ('proposed','assigned');
create index dispatch_carrier_idx on app.dispatch_assignments(carrier_id, created_at desc);

create table app.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete restrict,
  direction text not null check (direction in ('customer_receipt','carrier_payment','refund')),
  provider text,
  external_payment_id text,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null check (status in ('pending','received','paid','failed','refunded','cancelled')),
  occurred_at timestamptz,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_external_unique_idx on app.payments(provider, external_payment_id) where provider is not null and external_payment_id is not null;
create index payments_order_idx on app.payments(order_id, created_at desc);

create table app.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  contact_id uuid references app.contacts(id) on delete set null,
  customer_id uuid references app.customers(id) on delete set null,
  lead_id uuid references app.leads(id) on delete set null,
  quote_id uuid references app.quotes(id) on delete set null,
  order_id uuid references app.orders(id) on delete set null,
  carrier_id uuid references app.carriers(id) on delete set null,
  status text not null default 'active' check (status in ('active','verified','expired','archived')),
  expires_at timestamptz,
  uploaded_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(contact_id,customer_id,lead_id,quote_id,order_id,carrier_id) >= 1)
);
create index documents_order_idx on app.documents(order_id, created_at desc) where order_id is not null;
create index documents_carrier_idx on app.documents(carrier_id, document_type, expires_at) where carrier_id is not null;

create table app.conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('website_chat','dialpad_sms','dialpad_phone','instagram','facebook','tiktok','email','internal')),
  provider text not null,
  external_conversation_id text,
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  contact_id uuid references app.contacts(id) on delete set null,
  customer_id uuid references app.customers(id) on delete set null,
  lead_id uuid references app.leads(id) on delete set null,
  quote_id uuid references app.quotes(id) on delete set null,
  order_id uuid references app.orders(id) on delete set null,
  carrier_id uuid references app.carriers(id) on delete set null,
  assigned_user_id uuid references app.users(id) on delete set null,
  tags text[] not null default '{}',
  ai_summary text,
  detected_intent text,
  sentiment text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  unread_count integer not null default 0 check (unread_count >= 0),
  public_access_token_hash text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conversations_provider_external_unique_idx on app.conversations(provider, external_conversation_id) where external_conversation_id is not null;
create index conversations_assignment_idx on app.conversations(status, assigned_user_id, last_activity_at desc);
create index conversations_contact_idx on app.conversations(contact_id, last_activity_at desc);

create table app.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app.conversations(id) on delete cascade,
  provider text not null,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound','internal')),
  sender_external_id text,
  sender_user_id uuid references app.users(id) on delete set null,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'unknown' check (status in ('received','queued','sent','delivered','failed','unknown')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index messages_provider_external_unique_idx on app.messages(provider, external_message_id) where external_message_id is not null;
create index messages_conversation_time_idx on app.messages(conversation_id, occurred_at);

create table app.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app.conversations(id) on delete cascade,
  provider text not null check (provider = 'dialpad'),
  external_call_id text not null,
  direction text not null check (direction in ('inbound','outbound','unknown')),
  from_number text,
  to_number text,
  state text not null,
  started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  transcript text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index calls_provider_external_unique_idx on app.calls(provider, external_call_id);
create index calls_conversation_idx on app.calls(conversation_id, started_at desc);
