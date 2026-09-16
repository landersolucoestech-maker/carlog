-- Keep updated_at consistent on mutable entities.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users','roles','company_settings','contacts','customers','leads','quotes','carriers','orders',
    'dispatch_assignments','payments','documents','conversations','calls','integration_connections','tasks',
    'automation_definitions','ai_skill_definitions','cms_pages','cms_media','cms_navigation_items','cms_forms','social_content','social_content_variants','marketing_campaigns'
  ]
  loop
    execute format('create trigger %I_set_updated_at before update on app.%I for each row execute function app.set_updated_at()', table_name, table_name);
  end loop;
end $$;

insert into app.cms_forms(key,name,status,definition)
values (
  'quote_request',
  'Quote Request',
  'active',
  '{"fields":["firstName","lastName","email","phone","origin","destination","vehicleYear","vehicle"],"producer":"POST /v1/public/leads"}'::jsonb
)
on conflict (key) do nothing;

insert into app.permissions(key, description) values
  ('lead.read','View leads'),('lead.create','Create leads'),('lead.update','Update leads'),('lead.assign','Assign leads'),
  ('quote.read','View quotes'),('quote.create','Create quotes'),('quote.update','Update quotes'),('quote.send','Send quotes'),('quote.accept','Accept quotes'),
  ('order.read','View orders'),('order.create','Create orders'),('order.update','Update orders'),('order.cancel','Cancel orders'),
  ('dispatch.read','View dispatch'),('dispatch.manage','Manage dispatch'),
  ('carrier.read','View carriers'),('carrier.create','Create carriers'),('carrier.update','Update carriers'),('carrier.verify','Verify carriers'),('carrier.block','Block carriers'),
  ('finance.read','View finance'),('finance.manage','Manage payments and settlements'),('finance.refund','Issue refunds'),
  ('communication.read','View communications'),('communication.send','Send communications'),('communication.assign','Assign conversations'),
  ('document.read','View documents'),('document.manage','Manage documents'),
  ('cms.read','View CMS'),('cms.edit','Edit CMS'),('cms.publish','Publish CMS content'),
  ('marketing.read','View marketing'),('marketing.manage','Manage marketing'),('marketing.publish','Publish social content'),
  ('integration.read','View integrations'),('integration.manage','Manage integrations'),('integration.credentials.manage','Manage integration credentials'),
  ('automation.read','View automations'),('automation.manage','Manage automations'),('automation.publish','Publish automations'),
  ('ai_skill.read','View AI skills'),('ai_skill.execute','Execute AI skills'),('ai_skill.manage','Manage AI skills'),
  ('user.read','View users'),('user.manage','Manage users'),('role.manage','Manage roles and permissions'),
  ('audit.read','View audit history'),('settings.manage','Manage company settings')
on conflict (key) do nothing;

insert into app.roles(key, name, description, system) values
  ('owner','Owner','Full platform access',true),
  ('administrator','Administrator','Administrative platform access',true),
  ('sales_manager','Sales Manager','Sales team management',true),
  ('sales_agent','Sales Agent','Lead and quote execution',true),
  ('dispatcher','Dispatcher','Order and dispatch execution',true),
  ('carrier_manager','Carrier Manager','Carrier onboarding and compliance',true),
  ('finance','Finance','Finance operations',true),
  ('marketing','Marketing / CMS','Website, CMS and marketing operations',true),
  ('read_only','Read Only','Read-only operational access',true)
on conflict (key) do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r cross join app.permissions p where r.key = 'owner'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r cross join app.permissions p where r.key = 'administrator' and p.key <> 'finance.refund'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in (
  'lead.read','lead.create','lead.update','lead.assign','quote.read','quote.create','quote.update','quote.send','quote.accept',
  'order.read','communication.read','communication.send','communication.assign','document.read','document.manage','ai_skill.read','ai_skill.execute','audit.read'
)
where r.key in ('sales_manager','sales_agent')
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in (
  'order.read','order.update','dispatch.read','dispatch.manage','carrier.read','communication.read','communication.send','document.read','document.manage','audit.read'
)
where r.key = 'dispatcher'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in (
  'carrier.read','carrier.create','carrier.update','carrier.verify','carrier.block','dispatch.read','document.read','document.manage','audit.read','integration.read'
)
where r.key = 'carrier_manager'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in ('order.read','finance.read','finance.manage','finance.refund','audit.read')
where r.key = 'finance'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in (
  'cms.read','cms.edit','cms.publish','marketing.read','marketing.manage','marketing.publish',
  'communication.read','integration.read','ai_skill.read','ai_skill.execute','audit.read'
)
where r.key = 'marketing'
on conflict do nothing;

insert into app.role_permissions(role_id, permission_id)
select r.id, p.id from app.roles r join app.permissions p on p.key in (
  'lead.read','quote.read','order.read','dispatch.read','carrier.read','finance.read','communication.read','document.read','cms.read','marketing.read','integration.read','automation.read','ai_skill.read','user.read','audit.read'
)
where r.key = 'read_only'
on conflict do nothing;

insert into app.automation_definitions(key,name,version,status,definition)
values (
  'quote-follow-up','Quote follow-up',1,'draft',
  '{"id":"seed-quote-follow-up-v1","key":"quote-follow-up","name":"Quote follow-up","version":1,"status":"draft","trigger":{"type":"event","eventType":"quote.sent"},"conditions":[],"thenActions":[{"id":"wait-24h","type":"wait","input":{"seconds":86400}},{"id":"create-follow-up-task","type":"create.task","input":{"title":"Follow up on sent quote","priority":"normal"}}],"elseActions":[],"createdAt":"2026-09-16T00:00:00.000Z","updatedAt":"2026-09-16T00:00:00.000Z"}'::jsonb
)
on conflict (key,version) do nothing;

insert into app.ai_skill_definitions(
  key,name,description,category,version,status,input_schema,output_schema,instructions,required_permissions,approval_policy,timeout_ms,max_attempts,metadata
) values
(
  'communication.intent.detect','Communication Intent Detection','Classifies the operational intent of an inbound conversation message.','communication',1,'draft',
  '{"type":"object","required":["text"],"properties":{"text":{"type":"string"}}}'::jsonb,
  '{"type":"object","required":["intent"],"properties":{"intent":{"type":"string"},"confidence":{"type":"number"}}}'::jsonb,
  'Classify the customer intent using only the provided message. Return a concise operational intent key and confidence. Do not perform any action.',
  array['communication.read'],'automatic',15000,2,'{"external_model_gateway_required":true}'::jsonb
),
(
  'communication.conversation.summarize','Conversation Summary','Produces a concise operational summary of a conversation for internal users.','communication',1,'draft',
  '{"type":"object","required":["transcript"],"properties":{"transcript":{"type":"string"}}}'::jsonb,
  '{"type":"object","required":["summary"],"properties":{"summary":{"type":"string"},"nextAction":{"type":"string"}}}'::jsonb,
  'Summarize factual conversation context, unresolved questions, commitments, and the next operational action. Do not invent shipment facts.',
  array['communication.read'],'automatic',20000,2,'{"external_model_gateway_required":true}'::jsonb
),
(
  'lead.qualify','Lead Qualification','Evaluates whether a lead has enough factual information to proceed to quoting.','crm',1,'draft',
  '{"type":"object","required":["lead"],"properties":{"lead":{"type":"object"}}}'::jsonb,
  '{"type":"object","required":["qualified"],"properties":{"qualified":{"type":"boolean"},"reason":{"type":"string"},"missingFields":{"type":"array"}}}'::jsonb,
  'Assess qualification from the provided lead only. Missing route, vehicle, or contact information must be called out instead of inferred.',
  array['lead.read'],'supervised',20000,2,'{"external_model_gateway_required":true}'::jsonb
),
(
  'carrier.compliance.analyze','Carrier Compliance Analysis','Explains factual carrier compliance data and flags items requiring human review.','carrier',1,'draft',
  '{"type":"object","required":["facts"],"properties":{"facts":{"type":"object"}}}'::jsonb,
  '{"type":"object","required":["summary"],"properties":{"summary":{"type":"string"},"reviewRequired":{"type":"boolean"},"reasons":{"type":"array"}}}'::jsonb,
  'Analyze only factual provider data supplied in the input. Do not declare a carrier safe or unsafe. Distinguish provider facts from configurable business rules and human decisions.',
  array['carrier.read'],'supervised',20000,2,'{"external_model_gateway_required":true}'::jsonb
),
(
  'marketing.content.generate','Marketing Content Generation','Creates a channel-neutral draft from approved source material.','marketing',1,'draft',
  '{"type":"object","required":["source"],"properties":{"source":{"type":"string"},"objective":{"type":"string"}}}'::jsonb,
  '{"type":"object","required":["draft"],"properties":{"draft":{"type":"string"},"notes":{"type":"string"}}}'::jsonb,
  'Create an English-language draft grounded in the supplied source material. Do not publish. Publishing is a separate permissioned and approval-controlled action.',
  array['marketing.manage'],'manual',30000,2,'{"external_model_gateway_required":true}'::jsonb
)
on conflict (key,version) do nothing;

grant all on all tables in schema app to service_role;
grant usage, select on all sequences in schema app to service_role;
grant execute on all functions in schema app to service_role;
alter default privileges in schema app grant all on tables to service_role;
alter default privileges in schema app grant usage, select on sequences to service_role;
alter default privileges in schema app grant execute on functions to service_role;
