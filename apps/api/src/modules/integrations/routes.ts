import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROVIDER_CAPABILITIES, type IntegrationCapability, type IntegrationProviderKey } from '@carlog/integrations';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueIntegrationAction } from '../../lib/integration-actions.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';

const providers = Object.keys(PROVIDER_CAPABILITIES) as [IntegrationProviderKey, ...IntegrationProviderKey[]];
const providerSchema = z.enum(providers);
const capabilitySchema = z.string().min(1).max(120);
const uuid = z.string().uuid();

export async function registerIntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/integrations', async (request) => {
    await authorize(request, 'integration.read');
    return query(`select ic.*,coalesce(jsonb_agg(jsonb_build_object('capability',cp.capability,'authorized',cp.authorized)) filter(where cp.capability is not null),'[]'::jsonb) as capabilities from app.integration_connections ic left join app.integration_capabilities cp on cp.connection_id=ic.id group by ic.id order by ic.provider,ic.account_label`);
  });

  app.put('/v1/integrations/:provider', async (request) => {
    const user = await authorize(request, 'integration.manage'); const provider = providerSchema.parse((request.params as {provider:string}).provider);
    const body = z.object({ accountLabel: z.string().trim().min(1).max(200).default('Primary'), externalAccountId: z.string().max(300).nullable().optional(), secretRef: z.string().regex(/^env:[A-Z0-9_]+$/).nullable().optional(), requestedCapabilities: z.array(capabilitySchema).max(50), metadata: z.record(z.string(), z.unknown()).default({}) }).parse(request.body);
    const requested = [...new Set(body.requestedCapabilities)] as IntegrationCapability[]; const supported = PROVIDER_CAPABILITIES[provider];
    for (const capability of requested) if (!supported.includes(capability)) throw Object.assign(new Error(`${provider} does not support ${capability}`), { statusCode: 400 });
    if (Object.prototype.hasOwnProperty.call(body, 'secretRef')) await authorize(request, 'integration.credentials.manage');
    const correlationId = requestCorrelationId(request);
    return transaction(async (client) => {
      const existing = await client.query(`select * from app.integration_connections where provider=$1 and account_label=$2 for update`, [provider, body.accountLabel]);
      const status = body.secretRef || existing.rows[0]?.secret_ref ? 'authorization_required' : 'not_configured';
      const saved = await client.query<{id:string}>(`insert into app.integration_connections(provider,account_label,external_account_id,status,secret_ref,metadata) values($1,$2,$3,$4,$5,$6::jsonb) on conflict(provider,account_label) do update set external_account_id=excluded.external_account_id,status=case when app.integration_connections.status='connected' then app.integration_connections.status else excluded.status end,secret_ref=case when $7::boolean then excluded.secret_ref else app.integration_connections.secret_ref end,metadata=excluded.metadata,updated_at=now() returning *`, [provider, body.accountLabel, body.externalAccountId ?? null, status, body.secretRef ?? null, JSON.stringify(body.metadata), Object.prototype.hasOwnProperty.call(body,'secretRef')]);
      const id = saved.rows[0]!.id;
      await client.query('delete from app.integration_capabilities where connection_id=$1', [id]);
      for (const capability of requested) await client.query(`insert into app.integration_capabilities(connection_id,capability,authorized,configured_at) values($1,$2,false,now())`, [id, capability]);
      await recordAudit(client, { actorUserId: user.id, action: 'integration.settings.updated', entityType: 'integration_connection', entityId: id, before: existing.rows[0] ?? null, after: saved.rows[0], correlationId, metadata: { provider, requestedCapabilities: requested } });
      return saved.rows[0];
    });
  });

  app.post('/v1/integrations/:id/health', async (request, reply) => {
    const user = await authorize(request, 'integration.manage'); const id = uuid.parse((request.params as {id:string}).id); const correlationId = requestCorrelationId(request);
    const result = await transaction(async (client) => {
      const rows = await client.query<{provider:IntegrationProviderKey}>(`select provider from app.integration_connections where id=$1`, [id]); if (!rows.rows[0]) throw Object.assign(new Error('Integration connection not found'), { statusCode: 404 });
      const actionId = await enqueueIntegrationAction(client, { provider: rows.rows[0].provider, capability: (PROVIDER_CAPABILITIES[rows.rows[0].provider][0] ?? 'webhooks') as IntegrationCapability, operation: 'health_check', payload: { connectionId: id }, idempotencyKey: `integration:health:${id}:${Math.floor(Date.now()/60000)}`, correlationId });
      await recordAudit(client, { actorUserId: user.id, action: 'integration.health.requested', entityType: 'integration_connection', entityId: id, correlationId, metadata: { actionId } }); return { actionId, status: 'queued' };
    });
    return reply.code(202).send(result);
  });

  app.post('/v1/integrations/:id/disconnect', async (request) => {
    const user = await authorize(request, 'integration.manage'); const id = uuid.parse((request.params as {id:string}).id); const correlationId = requestCorrelationId(request);
    return transaction(async (client) => { const before = await client.query(`select * from app.integration_connections where id=$1 for update`, [id]); if (!before.rows[0]) throw Object.assign(new Error('Integration connection not found'), { statusCode: 404 }); const saved = await client.query(`update app.integration_connections set status='disconnected',authorization_status=null,updated_at=now() where id=$1 returning *`, [id]); await client.query(`update app.integration_capabilities set authorized=false where connection_id=$1`, [id]); await recordAudit(client, { actorUserId: user.id, action: 'integration.disconnected', entityType: 'integration_connection', entityId: id, before: before.rows[0], after: saved.rows[0], correlationId }); return saved.rows[0]; });
  });
}
