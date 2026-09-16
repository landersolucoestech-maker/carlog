import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';
const uuid=z.string().uuid(); const cents=z.number().int().nonnegative().max(100_000_000);

export async function registerQuotesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/quotes', async (request) => {
    await authorize(request, 'quote.read');
    return query(`
      select q.*, c.first_name,c.last_name,c.email,c.phone,l.origin,l.destination,l.vehicle_description
      from app.quotes q join app.contacts c on c.id=q.contact_id join app.leads l on l.id=q.lead_id
      order by q.created_at desc limit 500
    `);
  });

  app.post('/v1/quotes', async (request, reply) => {
    const user = await authorize(request, 'quote.create');
    const body = z.object({leadId:uuid,customerPriceCents:cents,estimatedCarrierPayCents:cents,expiresAt:z.string().datetime().nullable().optional()})
      .refine((v)=>v.customerPriceCents>=v.estimatedCarrierPayCents,{message:'Customer price cannot be lower than estimated carrier pay'}).parse(request.body);
    const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{
      const lead=await client.query<{id:string;contact_id:string;status:string;origin:string|null;destination:string|null;vehicle_description:string|null}>('select id,contact_id,status,origin,destination,vehicle_description from app.leads where id=$1 for update',[body.leadId]);
      if(!lead.rows[0]) throw Object.assign(new Error('Lead not found'),{statusCode:404});
      if(['won','lost'].includes(lead.rows[0].status)) throw Object.assign(new Error('Closed leads cannot receive new quotes'),{statusCode:409});
      const created=await client.query(`
        insert into app.quotes(lead_id,contact_id,origin,destination,vehicle_description,customer_price_cents,estimated_carrier_pay_cents,expires_at,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *
      `,[body.leadId,lead.rows[0].contact_id,lead.rows[0].origin,lead.rows[0].destination,lead.rows[0].vehicle_description,body.customerPriceCents,body.estimatedCarrierPayCents,body.expiresAt??null,user.id]);
      await client.query("update app.leads set status='quoted',updated_at=now() where id=$1",[body.leadId]);
      const id=(created.rows[0] as {id:string}).id;
      await recordAudit(client,{actorUserId:user.id,action:'quote.created',entityType:'quote',entityId:id,after:created.rows[0],correlationId:cid});
      await enqueueDomainEvent(client,{type:'quote.created',source:'api',correlationId:cid,idempotencyKey:`quote.created:${id}`,actorUserId:user.id,payload:{quoteId:id,leadId:body.leadId}});
      return created.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.post('/v1/quotes/:id/send', async (request) => {
    const user=await authorize(request,'quote.send');
    const id=uuid.parse((request.params as {id:string}).id); const cid=requestCorrelationId(request);
    return transaction(async(client)=>{
      const before=await client.query<{status:string}>('select status from app.quotes where id=$1 for update',[id]);
      if(!before.rows[0]) throw Object.assign(new Error('Quote not found'),{statusCode:404});
      if(before.rows[0].status!=='draft') throw Object.assign(new Error('Only draft quotes can be sent'),{statusCode:409});
      const updated=await client.query("update app.quotes set status='sent',updated_at=now() where id=$1 returning *",[id]);
      await recordAudit(client,{actorUserId:user.id,action:'quote.sent',entityType:'quote',entityId:id,before:before.rows[0],after:updated.rows[0],correlationId:cid});
      await enqueueDomainEvent(client,{type:'quote.sent',source:'api',correlationId:cid,idempotencyKey:`quote.sent:${id}`,actorUserId:user.id,payload:{quoteId:id}});
      return updated.rows[0];
    });
  });

  app.post('/v1/quotes/:id/accept', async (request) => {
    const user=await authorize(request,'quote.accept');
    const id=uuid.parse((request.params as {id:string}).id); const cid=requestCorrelationId(request);
    return transaction(async(client)=>{
      const quote=await client.query<{id:string;lead_id:string;contact_id:string;status:string;customer_price_cents:string;origin:string|null;destination:string|null;vehicle_description:string|null}>(`select id,lead_id,contact_id,status,customer_price_cents,origin,destination,vehicle_description from app.quotes where id=$1 for update`,[id]);
      const row=quote.rows[0]; if(!row) throw Object.assign(new Error('Quote not found'),{statusCode:404});
      const existingOrder=await client.query<{id:string}>('select id from app.orders where source_quote_id=$1',[id]);
      if(row.status==='accepted'&&existingOrder.rows[0]) return {quoteId:id,orderId:existingOrder.rows[0].id,reused:true};
      if(!['sent','viewed'].includes(row.status)) throw Object.assign(new Error('Only sent or viewed quotes can be accepted'),{statusCode:409});
      await client.query("update app.quotes set status='accepted',accepted_at=now(),updated_at=now() where id=$1",[id]);
      await client.query("update app.leads set status='won',updated_at=now() where id=$1",[row.lead_id]);
      const customer=await client.query<{id:string}>(`
        insert into app.customers(contact_id,status,source) values($1,'active','quote_acceptance')
        on conflict (contact_id) do update set status='active',updated_at=now() returning id
      `,[row.contact_id]);
      const created=await client.query<{id:string}>(`insert into app.orders(source_quote_id,contact_id,customer_id,origin,destination,vehicle_description,status,customer_price_cents) values($1,$2,$3,$4,$5,$6,'booked',$7) returning id`,[id,row.contact_id,customer.rows[0]!.id,row.origin,row.destination,row.vehicle_description,row.customer_price_cents]);
      const orderId=created.rows[0]!.id;
      await client.query("insert into app.order_status_events(order_id,from_status,to_status,actor_user_id,source) values($1,null,'booked',$2,'quote_acceptance')",[orderId,user.id]);
      await recordAudit(client,{actorUserId:user.id,action:'quote.accepted',entityType:'quote',entityId:id,after:{status:'accepted',orderId},correlationId:cid});
      await enqueueDomainEvent(client,{type:'quote.accepted',source:'api',correlationId:cid,idempotencyKey:`quote.accepted:${id}`,actorUserId:user.id,payload:{quoteId:id,leadId:row.lead_id,orderId}});
      await enqueueDomainEvent(client,{type:'order.created',source:'api',correlationId:cid,causationId:id,idempotencyKey:`order.created:${orderId}`,actorUserId:user.id,payload:{orderId,quoteId:id}});
      return {quoteId:id,orderId,reused:false};
    });
  });
}
