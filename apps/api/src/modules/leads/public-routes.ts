import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizePhone } from '@carlog/communication';
import { transaction } from '../../lib/database.js';
import { beginIdempotentRequest } from '../../lib/idempotency.js';
import { sha256Json } from '../../lib/hash.js';
import { enqueueDomainEvent } from '../../lib/domain-events.js';
import { requestCorrelationId } from '../../lib/request-context.js';

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(''),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  origin: z.string().trim().min(2).max(500),
  destination: z.string().trim().min(2).max(500),
  vehicleDescription: z.string().trim().min(2).max(300),
  source: z.string().trim().min(1).max(100).default('website'),
  attribution: z.object({
    visitorId: z.string().max(200).nullable().optional(), sessionId: z.string().max(200).nullable().optional(), medium: z.string().max(200).nullable().optional(),
    campaign: z.string().max(300).nullable().optional(), campaignId: z.string().max(300).nullable().optional(), adGroup: z.string().max(300).nullable().optional(),
    adGroupId: z.string().max(300).nullable().optional(), ad: z.string().max(300).nullable().optional(), adId: z.string().max(300).nullable().optional(),
    keyword: z.string().max(300).nullable().optional(), gclid: z.string().max(500).nullable().optional(), fbclid: z.string().max(500).nullable().optional(),
    ttclid: z.string().max(500).nullable().optional(), landingPage: z.string().max(2000).nullable().optional(), referrer: z.string().max(2000).nullable().optional(),
  }).default({}),
});

function idempotencyKey(headers: Record<string, unknown>): string {
  const value = headers['idempotency-key'];
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) throw Object.assign(new Error('Idempotency-Key header is required'), { statusCode: 400 });
  return value;
}

export async function registerPublicLeadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/public/leads', async (request, reply) => {
    const body = bodySchema.parse(request.body); const key = idempotencyKey(request.headers as Record<string, unknown>); const correlationId = requestCorrelationId(request); const requestHash = await sha256Json(body);
    const result = await transaction(async (client) => {
      const idem = await beginIdempotentRequest<{ leadId: string; contactId: string }>(client, { key, route: '/v1/public/leads', requestHash }); if (idem.reused) return idem.response;
      const normalizedPhone = normalizePhone(body.phone);
      const existing = await client.query<{ id: string }>(`select id from app.contacts where ($1::text is not null and lower(email)=lower($1)) or ($2::text is not null and normalized_phone=$2) order by created_at limit 1 for update`, [body.email ?? null, normalizedPhone]);
      let contactId = existing.rows[0]?.id;
      if (contactId) {
        await client.query(`update app.contacts set first_name=$2,last_name=$3,email=coalesce($4,email),phone=coalesce($5,phone),normalized_phone=coalesce($6,normalized_phone),source=coalesce(source,$7),updated_at=now() where id=$1`, [contactId, body.firstName, body.lastName, body.email ?? null, body.phone ?? null, normalizedPhone, body.source]);
      } else {
        const contact = await client.query<{ id: string }>(`insert into app.contacts(first_name,last_name,email,phone,normalized_phone,source) values($1,$2,$3,$4,$5,$6) returning id`, [body.firstName, body.lastName, body.email ?? null, body.phone ?? null, normalizedPhone, body.source]); contactId = contact.rows[0]!.id;
      }
      const touch = await client.query<{ id: string }>(`insert into app.attribution_touches(contact_id,visitor_id,session_id,source,medium,campaign,campaign_id,ad_group,ad_group_id,ad,ad_id,keyword,gclid,fbclid,ttclid,landing_page,referrer) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`, [contactId, body.attribution.visitorId ?? null, body.attribution.sessionId ?? null, body.source, body.attribution.medium ?? null, body.attribution.campaign ?? null, body.attribution.campaignId ?? null, body.attribution.adGroup ?? null, body.attribution.adGroupId ?? null, body.attribution.ad ?? null, body.attribution.adId ?? null, body.attribution.keyword ?? null, body.attribution.gclid ?? null, body.attribution.fbclid ?? null, body.attribution.ttclid ?? null, body.attribution.landingPage ?? null, body.attribution.referrer ?? null]);
      const lead = await client.query<{ id: string }>(`insert into app.leads(contact_id,status,source,origin,destination,vehicle_description,first_touch_attribution_id,last_touch_attribution_id) values($1,'new',$2,$3,$4,$5,$6,$6) returning id`, [contactId, body.source, body.origin, body.destination, body.vehicleDescription, touch.rows[0]!.id]);
      const response = { leadId: lead.rows[0]!.id, contactId };
      await enqueueDomainEvent(client, { type: 'lead.created', source: 'website', correlationId, idempotencyKey: `lead.created:${lead.rows[0]!.id}`, payload: { leadId: lead.rows[0]!.id, contactId, source: body.source } }); await idem.complete(response); return response;
    });
    return reply.code(201).send(result);
  });
}
