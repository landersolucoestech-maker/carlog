import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../auth/authorize.js';
import { query,transaction } from '../../lib/database.js';
import { recordAudit } from '../../lib/audit.js';
import { requestCorrelationId } from '../../lib/request-context.js';

export async function registerSettingsRoutes(app:FastifyInstance):Promise<void>{
  app.get('/v1/settings/company',async request=>{await authorize(request,'settings.manage');return (await query(`select * from app.company_settings where id=1`))[0]??null});
  app.put('/v1/settings/company',async request=>{const user=await authorize(request,'settings.manage');const body=z.object({name:z.string().min(1).max(200),websiteUrl:z.string().url().max(2000),timezone:z.string().min(1).max(100),currency:z.string().regex(/^[A-Z]{3}$/),supportEmail:z.string().email().nullable().optional(),supportPhone:z.string().max(50).nullable().optional()}).parse(request.body);const cid=requestCorrelationId(request);return transaction(async client=>{const before=await client.query(`select * from app.company_settings where id=1 for update`);const saved=await client.query(`update app.company_settings set name=$1,website_url=$2,timezone=$3,currency=$4,support_email=$5,support_phone=$6,updated_at=now() where id=1 returning *`,[body.name,body.websiteUrl,body.timezone,body.currency,body.supportEmail??null,body.supportPhone??null]);await recordAudit(client,{actorUserId:user.id,action:'company.settings.updated',entityType:'company_settings',entityId:'1',before:before.rows[0],after:saved.rows[0],correlationId:cid});return saved.rows[0]})});
  app.get('/v1/audit',async request=>{await authorize(request,'audit.read');const q=request.query as Record<string,unknown>;const entityType=typeof q.entityType==='string'?q.entityType:null;const actorUserId=typeof q.actorUserId==='string'?q.actorUserId:null;return query(`select a.*,u.email as actor_email,u.display_name as actor_name from app.audit_events a left join app.users u on u.id=a.actor_user_id where ($1::text is null or a.entity_type=$1) and ($2::uuid is null or a.actor_user_id=$2) order by a.created_at desc limit 1000`,[entityType,actorUserId])});
}
