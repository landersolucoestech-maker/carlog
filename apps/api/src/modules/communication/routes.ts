import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { IntegrationCapability, IntegrationProviderKey } from '@carlog/integrations';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { enqueueIntegrationAction } from '../../lib/integration-actions.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';

const uuid = z.string().uuid();
const updateSchema = z.object({ status: z.enum(['open','pending','resolved','closed']).optional(), assignedUserId: uuid.nullable().optional(), priority: z.enum(['low','normal','high','urgent']).optional(), tags: z.array(z.string().min(1).max(80)).max(30).optional() });
const sendSchema = z.object({ body: z.string().trim().min(1).max(10000), idempotencyKey: z.string().min(8).max(200) });

function delivery(channel: string): { provider: IntegrationProviderKey; capability: IntegrationCapability; operation: string } | null {
  if (channel === 'dialpad_sms') return { provider: 'dialpad', capability: 'telephony.sms', operation: 'send_sms' };
  if (channel === 'instagram') return { provider: 'instagram', capability: 'messaging', operation: 'send_message' };
  if (channel === 'facebook') return { provider: 'facebook', capability: 'messaging', operation: 'send_message' };
  if (channel === 'tiktok') return { provider: 'tiktok', capability: 'messaging', operation: 'send_message' };
  return null;
}

export async function registerCommunicationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/conversations', async (request) => {
    await authorize(request, 'communication.read');
    return query(`select c.*,ct.first_name,ct.last_name,ct.email,ct.phone,u.display_name as assigned_user_name from app.conversations c left join app.contacts ct on ct.id=c.contact_id left join app.users u on u.id=c.assigned_user_id order by c.last_activity_at desc limit 500`);
  });

  app.get('/v1/conversations/:id/timeline', async (request) => {
    await authorize(request, 'communication.read'); const id = uuid.parse((request.params as {id:string}).id);
    const [messages,calls] = await Promise.all([query(`select * from app.messages where conversation_id=$1 order by occurred_at,id`, [id]),query(`select * from app.calls where conversation_id=$1 order by coalesce(started_at,created_at),id`, [id])]);
    return { conversationId: id, messages, calls };
  });

  app.patch('/v1/conversations/:id', async (request) => {
    const user = await authorize(request, 'communication.assign'); const id = uuid.parse((request.params as {id:string}).id); const body = updateSchema.parse(request.body); const correlationId = requestCorrelationId(request);
    return transaction(async (client) => {
      const before = await client.query(`select * from app.conversations where id=$1 for update`, [id]); if (!before.rows[0]) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
      const updated = await client.query(`update app.conversations set status=coalesce($2,status),assigned_user_id=case when $3::boolean then $4::uuid else assigned_user_id end,priority=coalesce($5,priority),tags=case when $6::boolean then $7::text[] else tags end,updated_at=now() where id=$1 returning *`, [id, body.status ?? null, Object.prototype.hasOwnProperty.call(body,'assignedUserId'), body.assignedUserId ?? null, body.priority ?? null, Object.prototype.hasOwnProperty.call(body,'tags'), body.tags ?? []]);
      await recordAudit(client, { actorUserId: user.id, action: 'conversation.updated', entityType: 'conversation', entityId: id, before: before.rows[0], after: updated.rows[0], correlationId }); return updated.rows[0];
    });
  });

  app.post('/v1/conversations/:id/messages', async (request, reply) => {
    const user = await authorize(request, 'communication.send'); const id = uuid.parse((request.params as {id:string}).id); const body = sendSchema.parse(request.body); const correlationId = requestCorrelationId(request);
    const result = await transaction(async (client) => {
      const conversation = await client.query<{channel:string;provider:string;contact_id:string|null}>(`select channel,provider,contact_id from app.conversations where id=$1 for update`, [id]); const row = conversation.rows[0]; if (!row) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
      const target = delivery(row.channel);
      if (target) {
        const connection = await client.query<{id:string}>(`select ic.id from app.integration_connections ic join app.integration_capabilities cp on cp.connection_id=ic.id and cp.capability=$2 and cp.authorized=true where ic.provider=$1 and ic.status='connected' order by ic.updated_at desc limit 1`, [target.provider, target.capability]);
        if (!connection.rows[0]) throw Object.assign(new Error(`${target.provider} is not connected for ${target.capability}`), { statusCode: 409 });
      }
      const message = await client.query<{id:string}>(`insert into app.messages(conversation_id,provider,direction,sender_user_id,body,status,occurred_at) values($1,$2,'outbound',$3,$4,$5,now()) returning id`, [id, row.provider, user.id, body.body, target ? 'queued' : 'sent']); const messageId = message.rows[0]!.id;
      if (target) await enqueueIntegrationAction(client, { provider: target.provider, capability: target.capability, operation: target.operation, payload: { conversationId: id, messageId, body: body.body, contactId: row.contact_id }, idempotencyKey: body.idempotencyKey, correlationId });
      await client.query(`update app.conversations set last_activity_at=now(),updated_at=now() where id=$1`, [id]);
      await enqueueDomainEvent(client, { type: 'message.sent', source: 'communication', correlationId, idempotencyKey: `message.sent:${messageId}`, actorUserId: user.id, payload: { conversationId: id, messageId, queued: Boolean(target) } });
      await recordAudit(client, { actorUserId: user.id, action: 'message.created', entityType: 'message', entityId: messageId, correlationId, metadata: { conversationId: id, channel: row.channel } });
      return { messageId, status: target ? 'queued' : 'sent' };
    });
    return reply.code(201).send(result);
  });
}
