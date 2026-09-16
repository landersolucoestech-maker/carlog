import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';
import type { PermissionKey, UserIdentity } from '@carlog/auth';
import { query, transaction } from '../lib/database.js';

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');
const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
type UserRow = { id:string; email:string; display_name:string; status:string; role_keys:string[]|null; permission_keys:string[]|null };

export async function authenticate(request: FastifyRequest): Promise<UserIdentity> {
  const header=request.headers.authorization;
  if(!header?.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'),{statusCode:401});
  const {data,error}=await authClient.auth.getUser(header.slice(7));
  if(error||!data.user) throw Object.assign(new Error('Unauthorized'),{statusCode:401});
  await transaction(async(client)=>{
    const email=data.user.email??'';
    const metadataName=data.user.user_metadata&&typeof data.user.user_metadata.full_name==='string'?data.user.user_metadata.full_name.trim():'';
    const displayName=metadataName||email.split('@')[0]||'Car Log User';
    await client.query(`insert into app.users(id,email,display_name,status) values($1,$2,$3,'active') on conflict(id) do update set email=excluded.email,updated_at=now()`,[data.user.id,email,displayName]);
    const bootstrapOwnerEmail=process.env.CARLOG_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    if(bootstrapOwnerEmail&&email.toLowerCase()===bootstrapOwnerEmail) await client.query(`insert into app.user_roles(user_id,role_id) select $1,id from app.roles where key='owner' on conflict(user_id,role_id) do nothing`,[data.user.id]);
  });
  const rows=await query<UserRow>(`select u.id,u.email,u.display_name,u.status,coalesce(array_agg(distinct r.key) filter(where r.key is not null),'{}') role_keys,coalesce(array_agg(distinct p.key) filter(where p.key is not null),'{}') permission_keys from app.users u left join app.user_roles ur on ur.user_id=u.id left join app.roles r on r.id=ur.role_id left join app.role_permissions rp on rp.role_id=r.id left join app.permissions p on p.id=rp.permission_id where u.id=$1 group by u.id`,[data.user.id]);
  const row=rows[0]; if(!row||row.status!=='active') throw Object.assign(new Error('User access is disabled'),{statusCode:403});
  return {id:row.id,email:row.email,displayName:row.display_name,active:true,roleKeys:row.role_keys??[],permissions:(row.permission_keys??[]) as PermissionKey[]};
}
