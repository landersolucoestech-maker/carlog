# Car Log Platform Architecture

## Product boundary

Car Log is a single-company operating system for Car Log Connection. It is not a multi-company or tenant-partitioned SaaS product. Authentication identifies an internal user; authorization is enforced through roles and granular permissions. There is no company switcher and no company-scoped partition key in operational entities.

This repository does not embed or depend on an external public-site URL. Website-originated leads, chat, attribution and CMS integrations are exposed through platform APIs and provider boundaries so a separately managed website can integrate explicitly without coupling its presentation layer to this repository.

## Repository layout

- `apps/admin` — authenticated broker operating system and CMS user experience.
- `apps/api` — Fastify HTTP API, authentication, authorization, transactions and module routes.
- `apps/worker` — durable background processing for domain events, integrations, automations and AI skill executions.
- `packages/domain` — provider-agnostic brokerage rules and invariants.
- `packages/events` — domain event contracts and event primitives.
- `packages/integrations` — provider capability model and external provider adapters.
- `packages/automation` — workflow definitions and execution rules.
- `packages/ai-skills` — permissioned AI skill contracts and runtime policies.
- `packages/communication` — unified conversation, message, call and website visitor context.
- `packages/auth` — roles, permissions and authorization contracts.
- `packages/ui` — shared Car Log design system for the operating system.
- `supabase/migrations` — PostgreSQL schema migrations.
- `infrastructure/docker` — production containers for the operating-system services.
- `infrastructure/nginx` — reverse-proxy template for Admin and API endpoints.
- `infrastructure/hostinger` — Hostinger VPS deployment and migration scripts for the operating system.

## Runtime topology

Production deployment is performed only from the `dev` branch by GitHub Actions. Validation must pass before deployment. The deployment job connects to the Hostinger VPS, updates the existing `dev` checkout with a fast-forward-only pull, applies migrations, builds and starts the Car Log OS Docker Compose services, renders the Nginx configuration from production environment values, validates Nginx and performs health checks.

Production endpoints are configuration:

- `ADMIN_URL` → `apps/admin` on the admin container.
- `API_URL` → `apps/api` on the API container.
- `apps/worker` runs without a public HTTP endpoint.

No public marketing hostname is hardcoded in this repository. GitHub Pages is used only for a read-only Admin OS preview while production VPS access is unavailable.

No alternative production deployment platform is part of the canonical runtime.

## Authorization

Supabase Auth provides user identity. Car Log maintains the internal user profile, roles and permissions. Sensitive operations must be authorized by the API and audited. Bootstrap ownership is controlled by `CARLOG_BOOTSTRAP_OWNER_EMAIL`; metadata supplied by the client is never an authorization source.

## Brokerage ownership

- Leads own prospect lifecycle.
- Quotes own quoted customer economics until acceptance.
- Quote acceptance atomically creates an Order and marks the Lead as won.
- Orders own contracted customer price and carrier pay.
- Dispatch owns active carrier assignment and operational status transitions.
- Carriers own identity, approval and compliance history.
- Finance owns customer payments, carrier payments and derived receivable/payable state.
- Communications owns conversations, messages and calls across supported channels.
- Documents owns private files associated with operational entities.
- CMS owns versioned content and publication state exposed to authorized integrations.

## Integration Platform

Provider-specific code is isolated behind capabilities and adapters. Connection configuration belongs to Settings > Integrations; operational use belongs to the functional module. A configured record must not be reported as connected until provider authorization or a validated connection state exists.

Dialpad is the canonical telephony and SMS provider. Website-originated chat is a supported communication channel through platform endpoints. Social, advertising, transportation, compliance, finance and Google products are modeled as separate provider capabilities instead of leaking provider semantics into the domain.

## Domain events and idempotency

External webhooks and internal domain changes are normalized before downstream processing. Durable records carry external event identifiers or idempotency keys so duplicate delivery does not duplicate leads, messages, payments, dispatch effects or automation executions. Background claims use database locking and persisted leases where work can outlive the claim transaction.

## Automation Engine

Automations use event or schedule triggers, conditions, branching, actions, waits, retries, approval gates, versioned definitions and persisted execution history. External side effects are queued as integration actions. Approval state is persisted so a process restart cannot bypass human review.

## AI Skill Runtime

AI skills are versioned resources with input/output contracts, allowed tools, required permissions, approval policy, retry policy and timeout. Skills never receive unrestricted database or financial access. Each execution is persisted and audited; tools are allowlisted explicitly.

## Communication model

The Unified Inbox normalizes website-originated chat, Dialpad SMS, Dialpad calls and supported social channels into conversations. A conversation may be linked to a contact, customer, lead, quote, order or carrier. Website context can preserve visitor/session identity, current page, referrer and campaign identifiers such as UTM parameters, GCLID, FBCLID and TTCLID when a separately managed website explicitly integrates those endpoints.

## Security rules

- Secrets are supplied at runtime and are never committed.
- Provider webhook signatures are verified when supported.
- External payloads are validated and normalized before persistence.
- Critical write operations are server-side and permission checked.
- Operational tables are not exposed as unrestricted browser CRUD.
- Audit records identify the acting user, action, entity and correlation context.
- Production deployment is accepted only from `dev` with a clean, synchronized checkout.
- Production endpoint hostnames must come from configuration and may not use the deprecated public hostname.
