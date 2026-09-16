import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isCarrierEligible, type OrderStatus } from '@carlog/domain';
import { authorize } from '../../auth/authorize.js';
import { transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';
const uuid=z.string().uuid();

export async function registerDispatchRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/dispatch/:orderId/assign', async(request)=>{
    const user=await authorize(request,'dispatch.manage'); const orderId=uuid.parse((request.params as {orderId:string}).orderId);
    const body=z.object({carrierId:uuid,carrierPayCents:z.number().int().positive().max(100_000_000)}).parse(request.body); const cid=requestCorrelationId(request);
    return transaction(async(client)=>{
      const order=await client.query<{status:OrderStatus;customer_price_cents:string;carrier_id:string|null}>('select status,customer_price_cents,carrier_id from app.orders where id=$1 for update',[orderId]);
      if(!order.rows[0]) throw Object.assign(new Error('Order not found'),{statusCode:404});
      if(['picked_up','in_transit','delivered','settled','cancelled'].includes(order.rows[0].status)) throw Object.assign(new Error('Carrier assignment is locked after pickup or terminal status'),{statusCode:409});
      if(body.carrierPayCents>Number(order.rows[0].customer_price_cents)) throw Object.assign(new Error('Carrier pay cannot exceed customer price'),{statusCode:409});
      const carrier=await client.query<{authority_status:'active'|'inactive'|'unknown';insurance_status:'verified'|'expired'|'unknown';internal_approval:'approved'|'review'|'blocked';risk_level:'low'|'medium'|'high'|'unknown'}>('select authority_status,insurance_status,internal_approval,risk_level from app.carriers where id=$1',[body.carrierId]);
      if(!carrier.rows[0]) throw Object.assign(new Error('Carrier not found'),{statusCode:404});
      if(!isCarrierEligible({authorityStatus:carrier.rows[0].authority_status,insuranceStatus:carrier.rows[0].insurance_status,internalApproval:carrier.rows[0].internal_approval,riskLevel:carrier.rows[0].risk_level})) throw Object.assign(new Error('Carrier is not eligible for dispatch'),{statusCode:409});
      await client.query("update app.dispatch_assignments set status='cancelled',updated_at=now() where order_id=$1 and status in ('proposed','assigned')",[orderId]);
      const assignment=await client.query<{id:string}>(`insert into app.dispatch_assignments(order_id,carrier_id,status,carrier_pay_cents,assigned_by,assigned_at) values($1,$2,'assigned',$3,$4,now()) returning id`,[orderId,body.carrierId,body.carrierPayCents,user.id]);
      await client.query("update app.orders set carrier_id=$2,carrier_pay_cents=$3,status='carrier_selected',updated_at=now() where id=$1",[orderId,body.carrierId,body.carrierPayCents]);
      await client.query('insert into app.order_status_events(order_id,from_status,to_status,actor_user_id,source,metadata) values($1,$2,$3,$4,$5,$6::jsonb)',[orderId,order.rows[0].status,'carrier_selected',user.id,'dispatch',JSON.stringify({carrierId:body.carrierId,assignmentId:assignment.rows[0]!.id})]);
      await recordAudit(client,{actorUserId:user.id,action:'carrier.assigned',entityType:'order',entityId:orderId,before:{carrierId:order.rows[0].carrier_id,status:order.rows[0].status},after:{carrierId:body.carrierId,status:'carrier_selected',carrierPayCents:body.carrierPayCents},correlationId:cid});
      await enqueueDomainEvent(client,{type:'carrier.assigned',source:'dispatch',correlationId:cid,idempotencyKey:`carrier.assigned:${orderId}:${assignment.rows[0]!.id}`,actorUserId:user.id,payload:{orderId,carrierId:body.carrierId,assignmentId:assignment.rows[0]!.id}});
      await enqueueDomainEvent(client,{type:'order.dispatched',source:'dispatch',correlationId:cid,causationId:assignment.rows[0]!.id,idempotencyKey:`order.dispatched:${orderId}:${assignment.rows[0]!.id}`,actorUserId:user.id,payload:{orderId,carrierId:body.carrierId}});
      return {orderId,carrierId:body.carrierId,assignmentId:assignment.rows[0]!.id,status:'carrier_selected'};
    });
  });

  app.post('/v1/dispatch/:orderId/unassign', async(request)=>{
    const user=await authorize(request,'dispatch.manage');const orderId=uuid.parse((request.params as{orderId:string}).orderId);const cid=requestCorrelationId(request);
    return transaction(async(client)=>{const order=await client.query<{status:OrderStatus;carrier_id:string|null}>('select status,carrier_id from app.orders where id=$1 for update',[orderId]);const row=order.rows[0];if(!row)throw Object.assign(new Error('Order not found'),{statusCode:404});if(['picked_up','in_transit','delivered','settled','cancelled'].includes(row.status))throw Object.assign(new Error('Carrier assignment is locked after pickup or terminal status'),{statusCode:409});await client.query("update app.dispatch_assignments set status='cancelled',updated_at=now() where order_id=$1 and status in ('proposed','assigned')",[orderId]);await client.query("update app.orders set carrier_id=null,carrier_pay_cents=0,status='sourcing',updated_at=now() where id=$1",[orderId]);await client.query('insert into app.order_status_events(order_id,from_status,to_status,actor_user_id,source,metadata) values($1,$2,\'sourcing\',$3,\'dispatch\',$4::jsonb)',[orderId,row.status,user.id,JSON.stringify({previousCarrierId:row.carrier_id})]);await recordAudit(client,{actorUserId:user.id,action:'carrier.unassigned',entityType:'order',entityId:orderId,before:{carrierId:row.carrier_id,status:row.status},after:{carrierId:null,status:'sourcing'},correlationId:cid});return{orderId,status:'sourcing',carrierId:null}});
  });
}
