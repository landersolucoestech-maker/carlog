import { pool } from './database.js';
import { processOneDomainEvent } from './domain-events.js';
import { processOneIntegrationAction } from './integration-actions.js';
import { processOneAutomation } from './automations.js';
import { processOneAiSkill } from './ai-skills.js';
import { runMaintenanceIfDue } from './maintenance.js';

const pollIntervalMs = Math.max(100, Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000));
let stopping = false;

async function processAvailableWork(): Promise<boolean> {
  let processed = false;
  processed = (await runMaintenanceIfDue()) || processed;
  processed = (await processOneDomainEvent()) || processed;
  processed = (await processOneAutomation()) || processed;
  processed = (await processOneAiSkill()) || processed;
  processed = (await processOneIntegrationAction()) || processed;
  return processed;
}

async function run(): Promise<void> {
  console.info(JSON.stringify({ level: 'info', service: 'carlog-worker', message: 'Worker started' }));
  while (!stopping) {
    try {
      const processed = await processAvailableWork();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'carlog-worker',
        message: 'Worker loop failed',
        error: error instanceof Error ? error.message : 'Unknown worker error',
      }));
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({ level: 'info', service: 'carlog-worker', message: 'Worker stopping', signal }));
  await pool.end();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await run();
