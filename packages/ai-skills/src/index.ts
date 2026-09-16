import type { PermissionKey, UserIdentity } from '@carlog/auth';
import { requirePermission } from '@carlog/auth';

export type AiSkillStatus = 'draft' | 'active' | 'disabled';
export type AiApprovalPolicy = 'manual' | 'supervised' | 'automatic';

export interface JsonSchema {
  type: 'object';
  required?: string[];
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; nullable?: boolean }>;
}

export interface AiSkillDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  version: number;
  status: AiSkillStatus;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  instructions: string;
  toolKeys: string[];
  requiredPermissions: PermissionKey[];
  approvalPolicy: AiApprovalPolicy;
  timeoutMs: number;
  maxAttempts: number;
  metadata: Record<string, unknown>;
}

export interface AiToolContext {
  user: UserIdentity;
  skill: AiSkillDefinition;
  executionId: string;
  correlationId: string;
}

export interface AiTool {
  key: string;
  requiredPermission: PermissionKey;
  execute(input: unknown, context: AiToolContext): Promise<unknown>;
}

export interface AiModelRequest {
  skill: AiSkillDefinition;
  input: Record<string, unknown>;
  allowedTools: string[];
  correlationId: string;
}

export interface AiToolCallRequest {
  toolKey: string;
  input: unknown;
}

export interface AiModelResult {
  output: Record<string, unknown>;
  requestedToolCalls?: AiToolCallRequest[];
}

export interface AiModelGateway {
  run(request: AiModelRequest): Promise<AiModelResult>;
}

export type AiExecutionStatus = 'pending_approval' | 'running' | 'completed' | 'failed';

export interface AiSkillExecution {
  id: string;
  skillId: string;
  skillVersion: number;
  userId: string;
  correlationId: string;
  status: AiExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  pendingToolCalls: AiToolCallRequest[];
  toolCalls: Array<{ toolKey: string; allowed: boolean; at: string }>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

function validateObject(schema: JsonSchema, value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (record[key] === undefined || record[key] === null) throw new Error(`${label}.${key} is required`);
  }
  for (const [key, definition] of Object.entries(schema.properties)) {
    const field = record[key];
    if (field === undefined || field === null) {
      if (field === null && definition.nullable) continue;
      continue;
    }
    const valid = definition.type === 'array'
      ? Array.isArray(field)
      : definition.type === 'object'
        ? typeof field === 'object' && !Array.isArray(field)
        : typeof field === definition.type;
    if (!valid) throw new Error(`${label}.${key} must be ${definition.type}`);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI skill timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class AiSkillRuntime {
  private readonly skills = new Map<string, AiSkillDefinition>();
  private readonly tools = new Map<string, AiTool>();
  readonly executions: AiSkillExecution[] = [];

  constructor(private readonly model: AiModelGateway) {}

  registerSkill(skill: AiSkillDefinition): void {
    this.skills.set(skill.key, structuredClone(skill));
  }

  registerTool(tool: AiTool): void {
    this.tools.set(tool.key, tool);
  }

  getSkill(key: string): AiSkillDefinition | null {
    const skill = this.skills.get(key);
    return skill ? structuredClone(skill) : null;
  }

  private validateRequestedTools(skill: AiSkillDefinition, user: UserIdentity, calls: AiToolCallRequest[], execution: AiSkillExecution): void {
    for (const call of calls) {
      const declared = skill.toolKeys.includes(call.toolKey);
      const tool = this.tools.get(call.toolKey);
      const allowed = declared && Boolean(tool) && user.permissions.includes(tool!.requiredPermission);
      execution.toolCalls.push({ toolKey: call.toolKey, allowed, at: new Date().toISOString() });
      if (!allowed || !tool) throw new Error(`Forbidden AI tool call: ${call.toolKey}`);
    }
  }

  private async executeTools(skill: AiSkillDefinition, user: UserIdentity, calls: AiToolCallRequest[], execution: AiSkillExecution): Promise<void> {
    for (const call of calls) {
      const tool = this.tools.get(call.toolKey);
      if (!tool || !skill.toolKeys.includes(call.toolKey) || !user.permissions.includes(tool.requiredPermission)) {
        throw new Error(`Forbidden AI tool call: ${call.toolKey}`);
      }
      await withTimeout(tool.execute(call.input, {
        user,
        skill,
        executionId: execution.id,
        correlationId: execution.correlationId,
      }), skill.timeoutMs);
    }
  }

  async execute(input: {
    skillKey: string;
    payload: unknown;
    user: UserIdentity;
    correlationId: string;
    approved?: boolean;
    executionId?: string;
    resume?: { output: Record<string, unknown>; toolCalls: AiToolCallRequest[] };
  }): Promise<AiSkillExecution> {
    const skill = this.skills.get(input.skillKey);
    if (!skill || skill.status !== 'active') throw new Error('AI skill is unavailable');
    requirePermission(input.user, 'ai_skill.execute');
    for (const permission of skill.requiredPermissions) requirePermission(input.user, permission);
    validateObject(skill.inputSchema, input.payload, 'input');

    const execution: AiSkillExecution = {
      id: input.executionId ?? crypto.randomUUID(),
      skillId: skill.id,
      skillVersion: skill.version,
      userId: input.user.id,
      correlationId: input.correlationId,
      status: 'running',
      input: structuredClone(input.payload),
      output: null,
      pendingToolCalls: [],
      toolCalls: [],
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.executions.push(execution);

    if (skill.approvalPolicy === 'manual' && input.approved !== true) {
      execution.status = 'pending_approval';
      return execution;
    }

    try {
      let output: Record<string, unknown>;
      let requestedToolCalls: AiToolCallRequest[];

      if (input.resume) {
        output = structuredClone(input.resume.output);
        requestedToolCalls = structuredClone(input.resume.toolCalls);
        validateObject(skill.outputSchema, output, 'output');
        this.validateRequestedTools(skill, input.user, requestedToolCalls, execution);
      } else {
        let lastError: unknown;
        let modelResult: AiModelResult | null = null;
        for (let attempt = 1; attempt <= Math.max(1, skill.maxAttempts); attempt += 1) {
          try {
            modelResult = await withTimeout(this.model.run({
              skill,
              input: execution.input,
              allowedTools: [...skill.toolKeys],
              correlationId: input.correlationId,
            }), skill.timeoutMs);
            break;
          } catch (error) {
            lastError = error;
            if (attempt >= Math.max(1, skill.maxAttempts)) throw error;
          }
        }
        if (!modelResult) throw lastError instanceof Error ? lastError : new Error('AI model did not return a result');
        validateObject(skill.outputSchema, modelResult.output, 'output');
        output = structuredClone(modelResult.output);
        requestedToolCalls = structuredClone(modelResult.requestedToolCalls ?? []);
        this.validateRequestedTools(skill, input.user, requestedToolCalls, execution);
      }

      execution.output = output;
      if (skill.approvalPolicy === 'supervised' && requestedToolCalls.length > 0 && input.approved !== true) {
        execution.pendingToolCalls = requestedToolCalls;
        execution.status = 'pending_approval';
        return execution;
      }

      await this.executeTools(skill, input.user, requestedToolCalls, execution);
      execution.pendingToolCalls = [];
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown AI skill failure';
      execution.completedAt = new Date().toISOString();
      return execution;
    }
  }
}

export const INITIAL_SKILL_KEYS = [
  'lead.qualify',
  'lead.score',
  'lead.enrich',
  'lead.next_action',
  'lead.duplicate.detect',
  'communication.intent.detect',
  'communication.contact.resolve',
  'communication.context.resolve',
  'communication.reply.generate',
  'communication.reply.translate',
  'communication.conversation.summarize',
  'communication.sentiment.analyze',
  'communication.priority.classify',
  'communication.escalation.detect',
  'communication.spam.detect',
  'quote.assistant',
  'quote.followup',
  'sales.next_action',
  'sales.conversation.analyze',
  'sales.coach',
  'carrier.search',
  'carrier.verify',
  'carrier.compliance.analyze',
  'carrier.risk.analyze',
  'carrier.document.check',
  'carrier.monitor',
  'dispatch.assistant',
  'dispatch.carrier_match',
  'dispatch.load_monitor',
  'dispatch.negotiation_assistant',
  'pickup.coordinator',
  'delivery.coordinator',
  'delay.detect',
  'exception.analyze',
  'document.extract',
  'document.classify',
  'document.validate',
  'bol.extract',
  'coi.extract',
  'w9.extract',
  'marketing.content.generate',
  'marketing.content.repurpose',
  'marketing.social.schedule',
  'marketing.social.publish',
  'marketing.comments.classify',
  'marketing.comments.respond',
  'marketing.campaign.analyze',
  'marketing.creative.analyze',
  'marketing.roas.analyze',
  'marketing.seo.generate',
  'marketing.youtube.metadata',
  'operations.daily_briefing',
  'operations.anomaly.detect',
  'performance.summarize',
  'workflow.generate',
] as const;

export class HttpAiModelGateway implements AiModelGateway {
  constructor(private readonly endpoint: string, private readonly token: string | null = null) {}

  async run(request: AiModelRequest): Promise<AiModelResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'X-Correlation-Id': request.correlationId,
      },
      body: JSON.stringify({
        skill: {
          key: request.skill.key,
          version: request.skill.version,
          instructions: request.skill.instructions,
          inputSchema: request.skill.inputSchema,
          outputSchema: request.skill.outputSchema,
        },
        input: request.input,
        allowedTools: request.allowedTools,
      }),
    });
    if (!response.ok) throw new Error(`AI model gateway request failed with status ${response.status}`);
    const data = await response.json() as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI model gateway returned an invalid response');
    const record = data as Record<string, unknown>;
    if (!record.output || typeof record.output !== 'object' || Array.isArray(record.output)) throw new Error('AI model gateway response is missing output');
    const calls = Array.isArray(record.requestedToolCalls)
      ? record.requestedToolCalls.filter((call): call is { toolKey: string; input: unknown } => {
          return Boolean(call && typeof call === 'object' && !Array.isArray(call) && typeof (call as Record<string, unknown>).toolKey === 'string');
        }).map((call) => ({ toolKey: call.toolKey, input: call.input }))
      : undefined;
    return { output: record.output as Record<string, unknown>, ...(calls ? { requestedToolCalls: calls } : {}) };
  }
}
