# Car Log Admin — Broker Management + CMS

This workspace adds a non-destructive administrative layer to the `carlog` repository.

The public root remains an iframe of the live `https://carlogconnection.com/` site. The repository does not currently contain the origin site's application source or a backend, so this admin is implemented as a functional static prototype with browser-local persistence.

## Product model

The broker workflow follows the investigated Brokerpad domain model:

`Lead → Quote → Order → Dispatch / Carrier → Finance`

Cross-cutting modules cover Customers, Communications, Documents, Reports, Audit, Integrations and Settings. The Website CMS lives in the same admin shell so brokerage and editorial operations share one navigation model.

## CMS scope

The CMS currently models Pages, navigation metadata and SEO fields. It deliberately does **not** claim to publish to `carlogconnection.com`, because no production content API or source repository is present here.

## Production requirements

Before using real brokerage or customer data, replace browser-local persistence with:

- authenticated users and role-based access control;
- tenant-scoped durable database storage;
- server-side audit logging;
- server-side secret management;
- carrier/load-board/payment/accounting provider APIs;
- real email/SMS/chat transports and webhooks;
- CMS publishing connector for the origin website;
- background jobs, retries, idempotency and observability.
