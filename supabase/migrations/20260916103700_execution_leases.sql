alter table app.automation_executions
  add column locked_at timestamptz,
  add column locked_by text;

alter table app.ai_skill_executions
  add column locked_at timestamptz,
  add column locked_by text;

create index automation_execution_lease_idx on app.automation_executions(status,locked_at) where status in ('running','waiting');
create index ai_execution_lease_idx on app.ai_skill_executions(status,locked_at) where status='running';
