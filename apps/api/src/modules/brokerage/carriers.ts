import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { enqueueIntegrationAction } from '../../lib/integration-actions.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';
const uuid=z.string().uuid();

export async function registerCarriersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/carriers', async(request)=>{await authorize(request,'carrier.read'); return query('select * from app.carriers order by updated_at desc limit 500');});

  app.post('/v1/carriers', async(request,reply)=>{
    const user=await authorize(request,'carrier.create');
    const body=z.object({legalName:z.string().min(1).max(300),dbaName:z.string().max(300).nullable().optional(),usdotNumber:z.string().max(30).nullable().optional(),mcNumber:z.string().max(30).nullable().optional(),email:z.string().email().nullable().optional(),phone:z.string().max(50).nullable().optional()}).parse(request.body);
    const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{
      const row=await client.query(`insert into app.carriers(legal_name,dba_name,usdot_number,mc_number,email,phone) values($1,$2,$3,$4,$5,$6) returning *`,[body.legalName,body.dbaName??null,body.usdotNumber??null,body.mcNumber??null,body.email??null,body.phone??null]);
      const id=(row.rows[0] as {id:string}).id;
      await recordAudit(client,{actorUserId:user.id,action:'carrier.created',entityType:'carrier',entityId:id,after:row.rows[0],correlationId:cid});
      await enqueueDomainEvent(client,{type:'carrier.created',source:'api',correlationId:cid,idempotencyKey:`carrier.created:${id}`,actorUserId:user.id,payload:{carrierId:id}});
      return row.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.post('/v1/vehicle-intelligence/decode-vin', async(request,reply)=>{
    const user=await authorize(request,'lead.update');const body=z.object({vin:z.string().trim().min(11).max(17),modelYear:z.number().int().min(1980).max(2100).optional()}).parse(request.body);const cid=requestCorrelationId(request);
    const actionId=await transaction(async(client)=>{const id=await enqueueIntegrationAction(client,{provider:'nhtsa',capability:'vehicle_decode',operation:'decode_vin',payload:{vin:body.vin,...(body.modelYear?{modelYear:body.modelYear}:{})},idempotencyKey:`nhtsa:vin:${body.vin.toUpperCase()}:${body.modelYear??'unknown'}`,correlationId:cid});await recordAudit(client,{actorUserId:user.id,action:'vehicle.decode.requested',entityType:'vin',entityId:body.vin.toUpperCase(),after:{provider:'nhtsa',actionId},correlationId:cid});return id;});return reply.code(202).send({actionId,status:'queued'});
  });

  app.post('/v1/carriers/:id/verify', async(request,reply)=>{
    const user=await authorize(request,'carrier.verify'); const id=uuid.parse((request.params as {id:string}).id); const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{
      const carrier=await client.query<{usdot_number:string|null}>('select usdot_number from app.carriers where id=$1',[id]);
      if(!carrier.rows[0]) throw Object.assign(new Error('Carrier not found'),{statusCode:404});
      if(!carrier.rows[0].usdot_number) throw Object.assign(new Error('USDOT number is required for FMCSA verification'),{statusCode:409});
      const actionId=await enqueueIntegrationAction(client,{provider:'fmcsa',capability:'carrier_compliance',operation:'carrier_lookup',payload:{carrierId:id,usdot:carrier.rows[0].usdot_number},idempotencyKey:`fmcsa:${id}:${new Date().toISOString().slice(0,10)}`,correlationId:cid});
      await recordAudit(client,{actorUserId:user.id,action:'carrier.verification.requested',entityType:'carrier',entityId:id,after:{provider:'fmcsa',actionId},correlationId:cid});
      return {carrierId:id,actionId,status:'queued'};
    });
    return reply.code(202).send(result);
  });

  app.post('/v1/orders/:orderId/central-dispatch/listing', async(request,reply)=>{
    const user=await authorize(request,'dispatch.manage');const orderId=uuid.parse((request.params as{orderId:string}).orderId);const body=z.object({payload:z.record(z.string(),z.unknown())}).parse(request.body);const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{const order=await client.query('select id,status from app.orders where id=$1',[orderId]);if(!order.rows[0])throw Object.assign(new Error('Order not found'),{statusCode:404});const actionId=await enqueueIntegrationAction(client,{provider:'central_dispatch',capability:'listings',operation:'create_listing',payload:{orderId,...body.payload},idempotencyKey:`central-dispatch:listing:${orderId}`,correlationId:cid});await recordAudit(client,{actorUserId:user.id,action:'central_dispatch.listing.queued',entityType:'order',entityId:orderId,after:{actionId},correlationId:cid});return{orderId,actionId,status:'queued'}});return reply.code(202).send(result);
  });

  app.post('/v1/orders/:orderId/central-dispatch/fulfillment', async(request,reply)=>{
    const user=await authorize(request,'dispatch.manage');const orderId=uuid.parse((request.params as{orderId:string}).orderId);const body=z.object({payload:z.record(z.string(),z.unknown())}).parse(request.body);const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{const order=await client.query<{carrier_id:string|null}>('select carrier_id from app.orders where id=$1',[orderId]);if(!order.rows[0])throw Object.assign(new Error('Order not found'),{statusCode:404});if(!order.rows[0].carrier_id)throw Object.assign(new Error('Carrier assignment is required before fulfillment'),{statusCode:409});const actionId=await enqueueIntegrationAction(client,{provider:'central_dispatch',capability:'fulfillment',operation:'create_dispatch',payload:{orderId,carrierId:order.rows[0].carrier_id,...body.payload},idempotencyKey:`central-dispatch:fulfillment:${orderId}:${order.rows[0].carrier_id}`,correlationId:cid});await recordAudit(client,{actorUserId:user.id,action:'central_dispatch.fulfillment.queued',entityType:'order',entityId:orderId,after:{actionId,carrierId:order.rows[0].carrier_id},correlationId:cid});return{orderId,actionId,status:'queued'}});return reply.code(202).send(result);
  });
}
