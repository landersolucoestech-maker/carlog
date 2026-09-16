alter table app.automation_executions
  add column approved_by uuid references app.users(id) on delete set null,
  add column approved_at timestamptz;

alter table app.ai_skill_executions
  add column approved_by uuid references app.users(id) on delete set null,
  add column approved_at timestamptz;
