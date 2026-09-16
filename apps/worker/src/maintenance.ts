import { transaction } from './database.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RECHECK_DAYS = 7;

let nextMaintenanceAt = 0;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runMaintenanceIfDue(now = new Date()): Promise<boolean> {
  const intervalMs = positiveNumber(process.env.MAINTENANCE_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  if (now.getTime() < nextMaintenanceAt) return false;
  nextMaintenanceAt = now.getTime() + intervalMs;

  if (!process.env.FMCSA_WEB_KEY) return false;

  const recheckDays = Math.max(1, Math.floor(positiveNumber(process.env.CARRIER_COMPLIANCE_RECHECK_DAYS, DEFAULT_RECHECK_DAYS)));
  const dayKey = now.toISOString().slice(0, 10);

  const queued = await transaction(async client => {
    const carriers = await client.query<{ id: string; usdot_number: string }>(
      `select id, usdot_number
       from app.carriers
       where usdot_number is not null
         and (compliance_last_checked_at is null or compliance_last_checked_at < now() - make_interval(days => $1))
       order by compliance_last_checked_at nulls first, updated_at
       limit 100`,
      [recheckDays],
    );

    let count = 0;
    for (const carrier of carriers.rows) {
      const result = await client.query(
        `insert into app.integration_actions(
           connection_id, provider, capability, operation, payload,
           idempotency_key, correlation_id, status, available_at
         ) values(
           null, 'fmcsa', 'carrier_compliance', 'carrier_lookup', $1::jsonb,
           $2, gen_random_uuid()::text, 'pending', now()
         )
         on conflict(idempotency_key) do nothing`,
        [
          JSON.stringify({ carrierId: carrier.id, usdot: carrier.usdot_number, reason: 'scheduled_recheck' }),
          `fmcsa:scheduled:${carrier.id}:${dayKey}`,
        ],
      );
      count += result.rowCount ?? 0;
    }
    return count;
  });

  if (queued > 0) {
    console.info(JSON.stringify({
      level: 'info',
      service: 'carlog-worker',
      message: 'Scheduled carrier compliance rechecks',
      queued,
      recheckDays,
    }));
  }
  return queued > 0;
}
