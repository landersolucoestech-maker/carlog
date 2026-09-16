import type { FastifyInstance } from 'fastify';
import { normalizeDialpadCallEvent, normalizeDialpadSmsEvent, verifyDialpadWebhookJwt } from '@carlog/integrations';
import { normalizePhone } from '@carlog/communication';
import { query, transaction } from '../../lib/database.js';
import { sha256Json } from '../../lib/hash.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';

function tokenFromBody(body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>; const value = record.jwt ?? record.token;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw Object.assign(new Error('Dialpad webhook JWT is required'), { statusCode: 400 });
}
function replayWindowValid(occurredAt: string | null): boolean | null {
  if (!occurredAt) return null; const time = Date.parse(occurredAt); if (!Number.isFinite(time)) return false; const age = Date.now() - time; return age >= -10 * 60_000 && age <= 7 * 24 * 60 * 60_000;
}
async function resolveContact(client: import('pg').PoolClient, phone: string | null): Promise<string | null> {
  const normalized = normalizePhone(phone); if (!normalized) return null;
  const found = await client.query<{id:string}>(`select id from app.contacts where normalized_phone=$1 order by created_at limit 1`, [normalized]); if (found.rows[0]) return found.rows[0].id;
  const created = await client.query<{id:string}>(`insert into app.contacts(first_name,last_name,phone,normalized_phone,source) values('Dialpad','Contact',$1,$2,'dialpad') returning id`, [phone, normalized]); return created.rows[0]!.id;
}
async function conversation(client: import('pg').PoolClient, input:{channel:'dialpad_phone'|'dialpad_sms';externalId:string;contactId:string|null;context:Record<string,unknown>}):Promise<string>{
  const row=await client.query<{id:string}>(`insert into app.conversations(channel,provider,external_conversation_id,status,contact_id,context,last_activity_at) values($1,'dialpad',$2,'open',$3,$4::jsonb,now()) on conflict(provider,external_conversation_id) where external_conversation_id is not null do update set contact_id=coalesce(app.conversations.contact_id,excluded.contact_id),context=app.conversations.context||excluded.context,last_activity_at=now(),updated_at=now() returning id`,[input.channel,input.externalId,input.contactId,JSON.stringify(input.context)]);return row.rows[0]!.id;
}

export async function registerDialpadWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/webhooks/dialpad/calls', async (request, reply) => {
    const secret=process.env.DIALPAD_CALL_WEBHOOK_SECRET; if(!secret) throw Object.assign(new Error('Dialpad call webhook is not configured'),{statusCode:503});
    const payload=await verifyDialpadWebhookJwt(tokenFromBody(request.body),secret); const event=normalizeDialpadCallEvent(payload); const payloadHash=await sha256Json(payload); const externalEventId=`call:${event.callId}:${event.state}:${event.eventTimestamp??payloadHash.slice(0,16)}`; const validWindow=replayWindowValid(event.eventTimestamp);
    const accepted=await transaction(async(client)=>{const inserted=await client.query<{id:string}>(`insert into app.webhook_events(provider,external_event_id,event_type,payload_hash,raw_payload,signature_valid,replay_window_valid,status,occurred_at,attempts) values('dialpad',$1,'call',$2,$3::jsonb,true,$4,'processing',$5,1) on conflict(provider,external_event_id) do nothing returning id`,[externalEventId,payloadHash,JSON.stringify(payload),validWindow,event.eventTimestamp]);return inserted.rows[0]?.id??null;});
    if(!accepted)return reply.code(200).send({duplicate:true});
    try{
      await transaction(async(client)=>{const contactId=await resolveContact(client,event.externalNumber);const conversationId=await conversation(client,{channel:'dialpad_phone',externalId:`call:${event.callId}`,contactId,context:{externalNumber:event.externalNumber,internalNumber:event.internalNumber}});const fromNumber=event.direction==='inbound'?event.externalNumber:event.internalNumber;const toNumber=event.direction==='inbound'?event.internalNumber:event.externalNumber;await client.query(`insert into app.calls(conversation_id,provider,external_call_id,direction,from_number,to_number,state,started_at,connected_at,ended_at,transcript) values($1,'dialpad',$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(provider,external_call_id) do update set state=excluded.state,started_at=coalesce(app.calls.started_at,excluded.started_at),connected_at=coalesce(app.calls.connected_at,excluded.connected_at),ended_at=coalesce(excluded.ended_at,app.calls.ended_at),transcript=coalesce(excluded.transcript,app.calls.transcript),updated_at=now()`,[conversationId,event.callId,event.direction,fromNumber,toNumber,event.state,event.startedAt,event.connectedAt,event.endedAt,event.transcriptionText]);const terminal=['hangup','voicemail','missed'].includes(event.state);const type=event.state==='missed'?'call.missed':terminal?'call.completed':'call.started';await enqueueDomainEvent(client,{type,source:'dialpad',correlationId:crypto.randomUUID(),idempotencyKey:`dialpad:${externalEventId}`,payload:{conversationId,callId:event.callId,state:event.state,contactId}});await client.query(`update app.webhook_events set status='processed',processed_at=now() where id=$1`,[accepted]);});
    }catch(error){await query(`update app.webhook_events set status='failed',error_code='PROCESSING_FAILED',error_message=$2 where id=$1`,[accepted,error instanceof Error?error.message:'Unknown Dialpad call processing failure']);throw error;}
    return reply.code(200).send({processed:true});
  });

  app.post('/v1/webhooks/dialpad/sms', async (request, reply) => {
    const secret=process.env.DIALPAD_SMS_WEBHOOK_SECRET; if(!secret) throw Object.assign(new Error('Dialpad SMS webhook is not configured'),{statusCode:503});
    const payload=await verifyDialpadWebhookJwt(tokenFromBody(request.body),secret); const event=normalizeDialpadSmsEvent(payload); const payloadHash=await sha256Json(payload); const externalEventId=`sms:${event.messageId}:${event.messageStatus??'event'}:${payloadHash.slice(0,16)}`; const validWindow=replayWindowValid(event.createdAt);
    const accepted=await transaction(async(client)=>{const inserted=await client.query<{id:string}>(`insert into app.webhook_events(provider,external_event_id,event_type,payload_hash,raw_payload,signature_valid,replay_window_valid,status,occurred_at,attempts) values('dialpad',$1,'sms',$2,$3::jsonb,true,$4,'processing',$5,1) on conflict(provider,external_event_id) do nothing returning id`,[externalEventId,payloadHash,JSON.stringify(payload),validWindow,event.createdAt]);return inserted.rows[0]?.id??null;});
    if(!accepted)return reply.code(200).send({duplicate:true});
    try{
      await transaction(async(client)=>{const externalPhone=event.direction==='inbound'?event.fromNumber:event.toNumbers[0]??null;const normalized=normalizePhone(externalPhone);const contactId=await resolveContact(client,externalPhone);const conversationId=await conversation(client,{channel:'dialpad_sms',externalId:`sms:${normalized??event.messageId}`,contactId,context:{externalPhone}});const direction=event.direction==='inbound'?'inbound':'outbound';const status=event.direction==='inbound'?'received':event.messageStatus==='delivered'?'delivered':event.messageStatus==='failed'||event.messageStatus==='undelivered'?'failed':'sent';await client.query(`insert into app.messages(conversation_id,provider,external_message_id,direction,body,status,occurred_at) values($1,'dialpad',$2,$3,$4,$5,coalesce($6::timestamptz,now())) on conflict(provider,external_message_id) where external_message_id is not null do update set body=coalesce(excluded.body,app.messages.body),status=excluded.status,occurred_at=least(app.messages.occurred_at,excluded.occurred_at)`,[conversationId,event.messageId,direction,event.text,status,event.createdAt]);await client.query(`update app.conversations set unread_count=unread_count+case when $2='inbound' then 1 else 0 end,last_activity_at=now(),updated_at=now() where id=$1`,[conversationId,direction]);const type=direction==='inbound'?'message.received':'message.sent';await enqueueDomainEvent(client,{type,source:'dialpad',correlationId:crypto.randomUUID(),idempotencyKey:`dialpad:${externalEventId}`,payload:{conversationId,messageId:event.messageId,status,contactId}});await client.query(`update app.webhook_events set status='processed',processed_at=now() where id=$1`,[accepted]);});
    }catch(error){await query(`update app.webhook_events set status='failed',error_code='PROCESSING_FAILED',error_message=$2 where id=$1`,[accepted,error instanceof Error?error.message:'Unknown Dialpad SMS processing failure']);throw error;}
    return reply.code(200).send({processed:true});
  });
}
