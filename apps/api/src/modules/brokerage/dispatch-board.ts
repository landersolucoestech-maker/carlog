import type { FastifyInstance } from 'fastify';
import { authorize } from '../../auth/authorize.js';
import { query } from '../../lib/database.js';

export async function registerDispatchBoardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/dispatch', async (request) => {
    await authorize(request, 'dispatch.read');
    return query(`
      select
        o.id,
        o.status,
        o.origin,
        o.destination,
        o.vehicle_description,
        o.customer_price_cents,
        o.carrier_pay_cents,
        o.pickup_start_at,
        o.pickup_end_at,
        o.carrier_id,
        c.first_name,
        c.last_name,
        cr.legal_name as carrier_name,
        cr.authority_status,
        cr.insurance_status,
        cr.internal_approval,
        cr.risk_level,
        da.id as assignment_id,
        da.status as assignment_status
      from app.orders o
      join app.contacts c on c.id=o.contact_id
      left join app.carriers cr on cr.id=o.carrier_id
      left join lateral (
        select id,status from app.dispatch_assignments d
        where d.order_id=o.id and d.status in ('proposed','assigned')
        order by d.created_at desc limit 1
      ) da on true
      where o.status not in ('settled','cancelled')
      order by case o.status
        when 'booked' then 1 when 'sourcing' then 2 when 'carrier_selected' then 3
        when 'pickup_scheduled' then 4 when 'picked_up' then 5 when 'in_transit' then 6 when 'delivered' then 7 else 8 end,
        o.updated_at desc
      limit 500
    `);
  });
}
