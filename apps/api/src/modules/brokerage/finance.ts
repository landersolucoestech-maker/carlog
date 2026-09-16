import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertPaymentWithinOrderEconomics } from '@carlog/domain';
import { authorize } from '../../auth/authorize.js';
import { query, transaction } from '../../lib/database.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';
const uuid=z.string().uuid();

export async function registerFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/finance', async(request)=>{
    await authorize(request,'finance.read');
    const [summary]=await query<Record<string,string>>(`select
      (select coalesce(sum(customer_price_cents),0) from app.orders where status <> 'cancelled')::text as booked_revenue_cents,
      (select coalesce(sum(carrier_pay_cents),0) from app.orders where status <> 'cancelled')::text as carrier_cost_cents,
      (select coalesce(sum(customer_price_cents-carrier_pay_cents),0) from app.orders where status <> 'cancelled')::text as gross_profit_cents,
      ((select coalesce(sum(customer_price_cents),0) from app.orders where status <> 'cancelled') - (select coalesce(sum(amount_cents),0) from app.payments where direction='customer_receipt' and status='received'))::text as accounts_receivable_cents,
      ((select coalesce(sum(carrier_pay_cents),0) from app.orders where status <> 'cancelled') - (select coalesce(sum(amount_cents),0) from app.payments where direction='carrier_payment' and status='paid'))::text as carrier_payable_cents`);
    return Object.fromEntries(Object.entries(summary??{}).map(([key,value])=>[key,Number(value)]));
  });

  app.get('/v1/finance/orders/:orderId', async(request)=>{
    await authorize(request,'finance.read'); const orderId=uuid.parse((request.params as {orderId:string}).orderId);
    const rows=await query('select * from app.payments where order_id=$1 order by created_at',[orderId]); return {orderId,payments:rows};
  });

  app.post('/v1/finance/payments', async(request,reply)=>{
    const user=await authorize(request,'finance.manage');
    const body=z.object({orderId:uuid,direction:z.enum(['customer_receipt','carrier_payment']),amountCents:z.number().int().positive().max(100_000_000),provider:z.string().max(100).nullable().optional(),externalPaymentId:z.string().max(300).nullable().optional()}).parse(request.body);
    const cid=requestCorrelationId(request);
    const result=await transaction(async(client)=>{
      const order=await client.query<{id:string;customer_price_cents:string;carrier_pay_cents:string}>('select id,customer_price_cents,carrier_pay_cents from app.orders where id=$1 for update',[body.orderId]);
      if(!order.rows[0]) throw Object.assign(new Error('Order not found'),{statusCode:404});
      const direction=body.direction;
      const existing=await client.query<{total:string}>(`select coalesce(sum(amount_cents),0)::text as total from app.payments where order_id=$1 and direction=$2 and status in ('received','paid')`,[body.orderId,direction]);
      assertPaymentWithinOrderEconomics({type:direction==='customer_receipt'?'customer':'carrier',existingPaidCents:Number(existing.rows[0]?.total??0),newPaymentCents:body.amountCents,order:{customerPriceCents:Number(order.rows[0].customer_price_cents),carrierPayCents:Number(order.rows[0].carrier_pay_cents)}});
      const status=direction==='customer_receipt'?'received':'paid';
      const created=await client.query(`insert into app.payments(order_id,direction,provider,external_payment_id,amount_cents,status,occurred_at,created_by) values($1,$2,$3,$4,$5,$6,now(),$7) returning *`,[body.orderId,direction,body.provider??null,body.externalPaymentId??null,body.amountCents,status,user.id]);
      const id=(created.rows[0] as {id:string}).id;
      await recordAudit(client,{actorUserId:user.id,action:'payment.received',entityType:'payment',entityId:id,after:created.rows[0],correlationId:cid});
      await enqueueDomainEvent(client,{type:'payment.received',source:'finance',correlationId:cid,idempotencyKey:`payment.received:${id}`,actorUserId:user.id,payload:{paymentId:id,orderId:body.orderId,direction,amountCents:body.amountCents}});
      return created.rows[0];
    });
    return reply.code(201).send(result);
  });
}
