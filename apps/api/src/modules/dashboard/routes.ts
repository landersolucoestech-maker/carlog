import type { FastifyInstance } from 'fastify';
import { authorize } from '../../auth/authorize.js';
import { query } from '../../lib/database.js';

export async function registerDashboardRoutes(app:FastifyInstance):Promise<void>{
  app.get('/v1/dashboard',async request=>{
    await authorize(request,'lead.read');
    const [summary]=await query<Record<string,string>>(`select
      (select count(*) from app.leads where status not in ('won','lost'))::text open_leads,
      (select count(*) from app.quotes where status in ('draft','sent','viewed'))::text active_quotes,
      (select count(*) from app.orders where status not in ('delivered','settled','cancelled'))::text active_orders,
      (select count(*) from app.orders where status in ('booked','sourcing') and carrier_id is null)::text dispatch_attention,
      (select count(*) from app.carriers where authority_status<>'active' or insurance_status<>'verified' or internal_approval<>'approved' or risk_level='high')::text carrier_alerts,
      (select count(*) from app.conversations where status in ('open','pending'))::text open_conversations,
      (select count(*) from app.conversations where unread_count>0)::text unread_conversations,
      (select coalesce(sum(customer_price_cents),0) from app.orders where status<>'cancelled')::text booked_revenue_cents,
      (select coalesce(sum(customer_price_cents-carrier_pay_cents),0) from app.orders where status<>'cancelled')::text gross_profit_cents,
      ((select coalesce(sum(customer_price_cents),0) from app.orders where status<>'cancelled')-(select coalesce(sum(amount_cents),0) from app.payments where direction='customer_receipt' and status='received'))::text accounts_receivable_cents`);
    const recentActivity=await query(`select a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.display_name actor_name from app.audit_events a left join app.users u on u.id=a.actor_user_id order by a.created_at desc limit 20`);
    const attention=await query(`select 'order' kind,id::text entity_id,status,label from (select o.id,o.status,concat(coalesce(o.origin,'Unknown'),' → ',coalesce(o.destination,'Unknown')) label from app.orders o where (o.status in ('booked','sourcing') and o.carrier_id is null) union all select c.id,'carrier_alert',c.legal_name from app.carriers c where c.authority_status<>'active' or c.insurance_status<>'verified' or c.internal_approval<>'approved' or c.risk_level='high') q order by label limit 50`);
    return {summary:Object.fromEntries(Object.entries(summary??{}).map(([key,value])=>[key,Number(value)])),recentActivity,attention};
  });

  app.get('/v1/reports/sales-funnel',async request=>{await authorize(request,'lead.read');return query(`select status,count(*)::int count from app.leads group by status order by status`)});
  app.get('/v1/reports/brokerage-economics',async request=>{await authorize(request,'finance.read');return query(`select date_trunc('month',created_at) month,count(*)::int orders,sum(customer_price_cents)::bigint revenue_cents,sum(carrier_pay_cents)::bigint carrier_cost_cents,sum(customer_price_cents-carrier_pay_cents)::bigint gross_profit_cents from app.orders where status<>'cancelled' group by 1 order by 1 desc limit 24`)});
  app.get('/v1/reports/lead-sources',async request=>{await authorize(request,'lead.read');return query(`select source,count(*)::int leads,count(*) filter(where status='won')::int won from app.leads group by source order by leads desc`)});
}
