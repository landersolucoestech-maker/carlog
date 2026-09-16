import type { PoolClient } from 'pg';
import type { IntegrationCapability,IntegrationProviderKey } from '@carlog/integrations';

export async function enqueueIntegrationAction(client:PoolClient,input:{connectionId?:string|null;provider:IntegrationProviderKey;capability:IntegrationCapability;operation:string;payload:Record<string,unknown>;idempotencyKey:string;correlationId:string;availableAt?:string}):Promise<string>{
  const result=await client.query<{id:string}>(`insert into app.integration_actions(connection_id,provider,capability,operation,payload,idempotency_key,correlation_id,status,available_at) values($1,$2,$3,$4,$5::jsonb,$6,$7,'pending',coalesce($8::timestamptz,now())) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id`,[input.connectionId??null,input.provider,input.capability,input.operation,JSON.stringify(input.payload),input.idempotencyKey,input.correlationId,input.availableAt??null]);
  return result.rows[0]!.id;
}
