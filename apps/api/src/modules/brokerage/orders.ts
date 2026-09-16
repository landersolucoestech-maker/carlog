import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertOrderTransition, type OrderStatus } from '@carlog/domain';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';
const uuid=z.string().uuid(); const orderStatus=z.enum(['booked','sourcing','carrier_selected','pickup_scheduled','picked_up','in_transit','delivered','settled','cancelled']);

export async function registerOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/orders', async (request)=>{
    await authorize(request,'order.read');
    return query(`select o.*,c.first_name,c.last_name,cr.legal_name as carrier_name from app.orders o join app.contacts c on c.id=o.contact_id left join app.carriers cr on cr.id=o.carrier_id order by o.updated_at desc limit 500`);
  });

  app.patch('/v1/orders/:id/details', async(request)=>{
    const user=await authorize(request,'order.update'); const id=uuid.parse((request.params as{id:string}).id);
    const body=z.object({origin:z.string().min(2).max(500).optional(),destination:z.string().min(2).max(500).optional(),vehicleDescription:z.string().min(2).max(300).optional(),pickupStartAt:z.string().datetime().nullable().optional(),pickupEndAt:z.string().datetime().nullable().optional()}).parse(request.body); const cid=requestCorrelationId(request);
    return transaction(async(client)=>{const before=await client.query<{status:OrderStatus;origin:string|null;destination:string|null;vehicle_description:string|null;pickup_start_at:string|null;pickup_end_at:string|null}>('select status,origin,destination,vehicle_description,pickup_start_at,pickup_end_at from app.orders where id=$1 for update',[id]);const row=before.rows[0];if(!row)throw Object.assign(new Error('Order not found'),{statusCode:404});if(['picked_up','in_transit','delivered','settled','cancelled'].includes(row.status))throw Object.assign(new Error('Historical order details are locked after pickup or terminal status'),{statusCode:409});const pickupStart=Object.prototype.hasOwnProperty.call(body,'pickupStartAt')?body.pickupStartAt??null:row.pickup_start_at;const pickupEnd=Object.prototype.hasOwnProperty.call(body,'pickupEndAt')?body.pickupEndAt??null:row.pickup_end_at;if(pickupStart&&pickupEnd&&Date.parse(pickupEnd)<Date.parse(pickupStart))throw Object.assign(new Error('Pickup end cannot precede pickup start'),{statusCode:409});const updated=await client.query(`update app.orders set origin=coalesce($2,origin),destination=coalesce($3,destination),vehicle_description=coalesce($4,vehicle_description),pickup_start_at=case when $5::boolean then $6::timestamptz else pickup_start_at end,pickup_end_at=case when $7::boolean then $8::timestamptz else pickup_end_at end,updated_at=now() where id=$1 returning *`,[id,body.origin??null,body.destination??null,body.vehicleDescription??null,Object.prototype.hasOwnProperty.call(body,'pickupStartAt'),body.pickupStartAt??null,Object.prototype.hasOwnProperty.call(body,'pickupEndAt'),body.pickupEndAt??null]);await recordAudit(client,{actorUserId:user.id,action:'order.details.updated',entityType:'order',entityId:id,before:row,after:updated.rows[0],correlationId:cid});await enqueueDomainEvent(client,{type:'order.updated',source:'api',correlationId:cid,idempotencyKey:`order.details:${id}:${cid}`,actorUserId:user.id,payload:{orderId:id}});return updated.rows[0]});
  });

  app.post('/v1/orders/:id/status', async(request)=>{
    const user=await authorize(request,'dispatch.manage'); const id=uuid.parse((request.params as {id:string}).id);
    const body=z.object({status:orderStatus}).parse(request.body); const cid=requestCorrelationId(request);
    return transaction(async(client)=>{
      const current=await client.query<{status:OrderStatus;carrier_id:string|null}>('select status,carrier_id from app.orders where id=$1 for update',[id]);
      if(!current.rows[0]) throw Object.assign(new Error('Order not found'),{statusCode:404});
      assertOrderTransition(current.rows[0].status,body.status);
      if(['carrier_selected','pickup_scheduled','picked_up','in_transit','delivered','settled'].includes(body.status)&&!current.rows[0].carrier_id) throw Object.assign(new Error('An assigned eligible carrier is required for this status'),{statusCode:409});
      const timestamps:Record<string,string>={picked_up:'picked_up_at',delivered:'delivered_at',settled:'settled_at',cancelled:'cancelled_at'};
      const field=timestamps[body.status];
      const sql=field?`update app.orders set status=$2,${field}=coalesce(${field},now()),updated_at=now() where id=$1 returning *`:`update app.orders set status=$2,updated_at=now() where id=$1 returning *`;
      const updated=await client.query(sql,[id,body.status]);
      await client.query('insert into app.order_status_events(order_id,from_status,to_status,actor_user_id,source) values($1,$2,$3,$4,$5)',[id,current.rows[0].status,body.status,user.id,'dispatch']);
      await recordAudit(client,{actorUserId:user.id,action:'order.status.changed',entityType:'order',entityId:id,before:{status:current.rows[0].status},after:{status:body.status},correlationId:cid});
      await enqueueDomainEvent(client,{type:body.status==='delivered'?'vehicle.delivered':'order.updated',source:'dispatch',correlationId:cid,idempotencyKey:`order.status:${id}:${body.status}`,actorUserId:user.id,payload:{orderId:id,from:current.rows[0].status,to:body.status}});
      return updated.rows[0];
    });
  });
}
