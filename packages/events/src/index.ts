export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  occurredAt: string;
  actorId: string | null;
  correlationId: string;
  causationId: string | null;
  payloadVersion: number;
  payload: TPayload;
  source: string;
  idempotencyKey: string;
}

export interface EventHandlerContext {
  attempt: number;
}

export type EventHandler<TPayload = Record<string, unknown>> = (
  event: DomainEvent<TPayload>,
  context: EventHandlerContext,
) => Promise<void> | void;

export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): EventSubscription;
}

export interface EventBusOptions {
  maxAttempts?: number;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly seen = new Set<string>();
  private readonly maxAttempts: number;

  constructor(options: EventBusOptions = {}) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): EventSubscription {
    const set = this.handlers.get(type) ?? new Set<EventHandler<unknown>>();
    set.add(handler as EventHandler<unknown>);
    this.handlers.set(type, set);
    return {
      unsubscribe: () => {
        set.delete(handler as EventHandler<unknown>);
        if (set.size === 0) this.handlers.delete(type);
      },
    };
  }

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    if (this.seen.has(event.idempotencyKey)) return;
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    for (const handler of handlers) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        try {
          await handler(event as DomainEvent<unknown>, { attempt });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError !== undefined) throw lastError;
    }
    this.seen.add(event.idempotencyKey);
  }
}

export function createDomainEvent<TPayload>(input: {
  id: string;
  type: string;
  actorId?: string | null;
  correlationId: string;
  causationId?: string | null;
  payloadVersion?: number;
  payload: TPayload;
  source: string;
  idempotencyKey: string;
  occurredAt?: string;
}): DomainEvent<TPayload> {
  return {
    id: input.id,
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    actorId: input.actorId ?? null,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    payloadVersion: input.payloadVersion ?? 1,
    payload: input.payload,
    source: input.source,
    idempotencyKey: input.idempotencyKey,
  };
}

export const DOMAIN_EVENT_TYPES = [
  'lead.created','lead.updated','lead.assigned',
  'quote.created','quote.updated','quote.sent','quote.accepted','quote.expired',
  'order.created','order.updated','order.dispatched','order.completed','order.cancelled',
  'carrier.created','carrier.updated','carrier.assigned','carrier.verified','carrier.compliance_changed',
  'pickup.scheduled','pickup.confirmed','vehicle.picked_up',
  'delivery.scheduled','delivery.confirmed','vehicle.delivered',
  'payment.created','payment.received','payment.failed','payment.refunded',
  'conversation.created','message.received','message.sent',
  'call.started','call.completed','call.missed',
  'social.comment.received','social.lead.created','campaign.conversion_created',
  'cms.page.published'
] as const;
export type DomainEventType = typeof DOMAIN_EVENT_TYPES[number];
