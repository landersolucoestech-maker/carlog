alter table app.conversations
  add column context jsonb not null default '{}'::jsonb;

create index conversations_context_visitor_idx
  on app.conversations ((context ->> 'visitorId'))
  where context ? 'visitorId';

create index conversations_context_session_idx
  on app.conversations ((context ->> 'sessionId'))
  where context ? 'sessionId';
