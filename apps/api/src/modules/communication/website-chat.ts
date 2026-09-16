import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizePhone } from '@carlog/communication';
import { transaction } from '../../lib/database.js';
import { sha256Text, sha256Json } from '../../lib/hash.js';
import { beginIdempotentRequest } from '../../lib/idempotency.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { requestCorrelationId } from '../../lib/request-context.js';

const createSchema = z.object({
  visitorId: z.string().min(1).max(200), sessionId: z.string().min(1).max(200), currentPage: z.string().min(1).max(2000),
  referrer: z.string().max(2000).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().max(40).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(), lastName: z.string().max(100).nullable().optional(), initialMessage: z.string().trim().max(10000).nullable().optional(),
  attribution: z.record(z.string(), z.unknown()).default({}),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(10000), clientMessageId: z.string().min(4).max(200) });

export async function registerWebsiteChatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/public/chat/conversations', async (request, reply) => {
    const body = createSchema.parse(request.body); const correlationId = requestCorrelationId(request);
    const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`; const tokenHash = await sha256Text(rawToken); const normalizedPhone = normalizePhone(body.phone);
    const result = await transaction(async (client) => {
      const contact = await client.query<{id:string}>(`select id from app.contacts where ($1::text is not null and lower(email)=lower($1)) or ($2::text is not null and normalized_phone=$2) order by created_at limit 1`, [body.email ?? null, normalizedPhone]);
      let contactId = contact.rows[0]?.id ?? null;
      if (!contactId && (body.email || body.phone)) {
        const created = await client.query<{id:string}>(`insert into app.contacts(first_name,last_name,email,phone,normalized_phone,source) values($1,$2,$3,$4,$5,'website_chat') returning id`, [body.firstName ?? 'Website', body.lastName ?? 'Visitor', body.email ?? null, body.phone ?? null, normalizedPhone]); contactId = created.rows[0]!.id;
      }
      const context = { visitorId: body.visitorId, sessionId: body.sessionId, currentPage: body.currentPage, referrer: body.referrer ?? null, attribution: body.attribution };
      const conversation = await client.query<{id:string}>(`insert into app.conversations(channel,provider,status,contact_id,public_access_token_hash,context,last_activity_at) values('website_chat','website','open',$1,$2,$3::jsonb,now()) returning id`, [contactId, tokenHash, JSON.stringify(context)]);
      const conversationId = conversation.rows[0]!.id;
      if (body.initialMessage) await client.query(`insert into app.messages(conversation_id,provider,direction,body,status,occurred_at) values($1,'website','inbound',$2,'received',now())`, [conversationId, body.initialMessage]);
      await enqueueDomainEvent(client, { type: 'conversation.created', source: 'website_chat', correlationId, idempotencyKey: `conversation.created:${conversationId}`, payload: { conversationId, contactId } });
      if (body.initialMessage) await enqueueDomainEvent(client, { type: 'message.received', source: 'website_chat', correlationId, idempotencyKey: `message.received:${conversationId}:initial`, payload: { conversationId, contactId } });
      return { conversationId, accessToken: rawToken };
    });
    return reply.code(201).send(result);
  });

  app.post('/v1/public/chat/conversations/:id/messages', async (request, reply) => {
    const id = z.string().uuid().parse((request.params as {id:string}).id); const body = messageSchema.parse(request.body); const token = request.headers['x-chat-token'];
    if (typeof token !== 'string') throw Object.assign(new Error('Chat token is required'), { statusCode: 401 });
    const tokenHash = await sha256Text(token); const requestHash = await sha256Json(body); const correlationId = requestCorrelationId(request);
    const result = await transaction(async (client) => {
      const conversation = await client.query<{public_access_token_hash:string|null}>(`select public_access_token_hash from app.conversations where id=$1 and channel='website_chat' for update`, [id]);
      if (!conversation.rows[0] || conversation.rows[0].public_access_token_hash !== tokenHash) throw Object.assign(new Error('Invalid chat token'), { statusCode: 401 });
      const idem = await beginIdempotentRequest<{messageId:string}>(client, { key: body.clientMessageId, route: `/v1/public/chat/conversations/${id}/messages`, requestHash }); if (idem.reused) return idem.response;
      const message = await client.query<{id:string}>(`insert into app.messages(conversation_id,provider,external_message_id,direction,body,status,occurred_at) values($1,'website',$2,'inbound',$3,'received',now()) returning id`, [id, body.clientMessageId, body.body]);
      await client.query(`update app.conversations set unread_count=unread_count+1,last_activity_at=now(),updated_at=now() where id=$1`, [id]);
      await enqueueDomainEvent(client, { type: 'message.received', source: 'website_chat', correlationId, idempotencyKey: `message.received:${message.rows[0]!.id}`, payload: { conversationId: id, messageId: message.rows[0]!.id } });
      const response = { messageId: message.rows[0]!.id }; await idem.complete(response); return response;
    });
    return reply.code(201).send(result);
  });
}
