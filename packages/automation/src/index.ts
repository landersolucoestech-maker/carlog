import type { DomainEvent, EventBus, EventSubscription } from '@carlog/events';

export type AutomationStatus = 'draft' | 'published' | 'disabled';
export type AutomationApprovalPolicy = 'none' | 'manual';

export interface AutomationCondition {
  path: string;
  operator: 'equals' | 'not_equals' | 'exists' | 'contains' | 'greater_than' | 'less_than';
  value?: unknown;
}

export interface AutomationAction {
  id: string;
  type: string;
  input: Record<string, unknown>;
  approvalPolicy?: AutomationApprovalPolicy;
  retry?: { maxAttempts: number; delayMs: number };
  timeoutMs?: number;
}

export interface AutomationBranch {
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface AutomationDefinition {
  id: string;
  key: string;
  name: string;
  version: number;
  status: AutomationStatus;
  trigger: { type: 'event'; eventType: string };
  conditions: AutomationCondition[];
  thenActions: AutomationAction[];
  elseActions: AutomationAction[];
  branches?: AutomationBranch[];
  createdAt: string;
  updatedAt: string;
}

export type AutomationExecutionStatus =
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AutomationExecutionLog {
  at: string;
  level: 'info' | 'error';
  message: string;
  actionId?: string;
  attempt?: number;
}

export interface AutomationExecution {
  id: string;
  definitionId: string;
  definitionVersion: number;
  triggerEventId: string;
  correlationId: string;
  status: AutomationExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  currentActionId: string | null;
  logs: AutomationExecutionLog[];
  error: string | null;
}

export interface AutomationActionContext {
  event: DomainEvent<unknown>;
  execution: AutomationExecution;
  action: AutomationAction;
}

export type AutomationActionHandler = (context: AutomationActionContext) => Promise<void>;

interface PendingApprovalContext {
  event: DomainEvent<unknown>;
  actions: AutomationAction[];
  index: number;
}

function getPath(input: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, input);
}

export function evaluateCondition(condition: AutomationCondition, event: DomainEvent<unknown>): boolean {
  const actual = getPath({ event, payload: event.payload }, condition.path);
  switch (condition.operator) {
    case 'equals': return Object.is(actual, condition.value);
    case 'not_equals': return !Object.is(actual, condition.value);
    case 'exists': return actual !== null && actual !== undefined;
    case 'contains': return Array.isArray(actual)
      ? actual.includes(condition.value)
      : typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value);
    case 'greater_than': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'less_than': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
  }
}

export function evaluateConditions(conditions: AutomationCondition[], event: DomainEvent<unknown>): boolean {
  return conditions.every((condition) => evaluateCondition(condition, event));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Automation action timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AutomationEngine {
  private readonly definitions = new Map<string, AutomationDefinition>();
  private readonly handlers = new Map<string, AutomationActionHandler>();
  private readonly subscriptions: EventSubscription[] = [];
  private readonly pendingApprovals = new Map<string, PendingApprovalContext>();
  readonly executions: AutomationExecution[] = [];

  constructor(private readonly eventBus: EventBus) {}

  registerAction(type: string, handler: AutomationActionHandler): void {
    this.handlers.set(type, handler);
  }

  upsertDefinition(definition: AutomationDefinition): void {
    this.definitions.set(definition.id, structuredClone(definition));
  }

  start(): void {
    this.stop();
    const eventTypes = new Set(
      [...this.definitions.values()]
        .filter((definition) => definition.status === 'published')
        .map((definition) => definition.trigger.eventType),
    );
    for (const eventType of eventTypes) {
      this.subscriptions.push(this.eventBus.subscribe(eventType, async (event) => { await this.handleEvent(event); }));
    }
  }

  stop(): void {
    for (const subscription of this.subscriptions.splice(0)) subscription.unsubscribe();
  }

  async handleEvent(event: DomainEvent<unknown>): Promise<AutomationExecution[]> {
    const matches = [...this.definitions.values()].filter(
      (definition) => definition.status === 'published' && definition.trigger.eventType === event.type,
    );
    const results: AutomationExecution[] = [];
    for (const definition of matches) {
      const execution = await this.runDefinition(definition, event);
      results.push(execution);
    }
    return results;
  }

  private selectActions(definition: AutomationDefinition, event: DomainEvent<unknown>): AutomationAction[] {
    const matchedBranch = definition.branches?.find((branch) => evaluateConditions(branch.conditions, event));
    if (matchedBranch) return matchedBranch.actions;
    return evaluateConditions(definition.conditions, event) ? definition.thenActions : definition.elseActions;
  }

  private async executeActions(input: {
    execution: AutomationExecution;
    event: DomainEvent<unknown>;
    actions: AutomationAction[];
    startIndex: number;
    approvedActionId?: string;
  }): Promise<AutomationExecution> {
    const { execution, event, actions } = input;
    try {
      for (let index = input.startIndex; index < actions.length; index += 1) {
        const action = actions[index]!;
        execution.currentActionId = action.id;
        if (action.approvalPolicy === 'manual' && input.approvedActionId !== action.id) {
          execution.status = 'waiting_approval';
          execution.logs.push({ at: new Date().toISOString(), level: 'info', actionId: action.id, message: 'Manual approval required' });
          this.pendingApprovals.set(execution.id, { event, actions, index });
          return execution;
        }

        const handler = this.handlers.get(action.type);
        if (!handler) throw new Error(`No automation action handler registered for ${action.type}`);
        const maxAttempts = Math.max(1, action.retry?.maxAttempts ?? 1);
        let completed = false;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            execution.logs.push({ at: new Date().toISOString(), level: 'info', actionId: action.id, attempt, message: 'Action started' });
            const work = handler({ event, execution, action });
            await (action.timeoutMs ? withTimeout(work, action.timeoutMs) : work);
            execution.logs.push({ at: new Date().toISOString(), level: 'info', actionId: action.id, attempt, message: 'Action completed' });
            completed = true;
            break;
          } catch (error) {
            lastError = error;
            execution.logs.push({ at: new Date().toISOString(), level: 'error', actionId: action.id, attempt, message: error instanceof Error ? error.message : 'Unknown action failure' });
            if (attempt < maxAttempts && action.retry?.delayMs) await sleep(action.retry.delayMs);
          }
        }
        if (!completed) throw lastError instanceof Error ? lastError : new Error('Automation action failed');
      }
      execution.status = 'completed';
      execution.currentActionId = null;
      execution.completedAt = new Date().toISOString();
      this.pendingApprovals.delete(execution.id);
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown automation failure';
      execution.completedAt = new Date().toISOString();
      this.pendingApprovals.delete(execution.id);
      return execution;
    }
  }

  private async runDefinition(definition: AutomationDefinition, event: DomainEvent<unknown>): Promise<AutomationExecution> {
    const execution: AutomationExecution = {
      id: crypto.randomUUID(),
      definitionId: definition.id,
      definitionVersion: definition.version,
      triggerEventId: event.id,
      correlationId: event.correlationId,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      currentActionId: null,
      logs: [],
      error: null,
    };
    this.executions.push(execution);
    const actions = this.selectActions(definition, event);
    if (actions.length === 0) {
      execution.status = 'skipped';
      execution.completedAt = new Date().toISOString();
      execution.logs.push({ at: execution.completedAt, level: 'info', message: 'No actions selected' });
      return execution;
    }
    return this.executeActions({ execution, event, actions, startIndex: 0 });
  }

  async resumeApproved(executionId: string): Promise<AutomationExecution> {
    const execution = this.executions.find((item) => item.id === executionId);
    if (!execution) throw new Error('Automation execution not found');
    if (execution.status !== 'waiting_approval' || !execution.currentActionId) throw new Error('Automation execution is not waiting for approval');
    const definition = this.definitions.get(execution.definitionId);
    if (!definition || definition.version !== execution.definitionVersion) throw new Error('Automation definition version is unavailable');
    const pending = this.pendingApprovals.get(executionId);
    if (!pending) throw new Error('Automation approval context is unavailable');
    const approvedActionId = execution.currentActionId;
    execution.status = 'running';
    execution.logs.push({ at: new Date().toISOString(), level: 'info', actionId: approvedActionId, message: 'Manual approval recorded' });
    return this.executeActions({ ...pending, execution, startIndex: pending.index, approvedActionId });
  }
}
