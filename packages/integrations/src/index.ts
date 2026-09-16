export type IntegrationProviderKey =
  | 'dialpad'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'website'
  | 'google_ads'
  | 'google_analytics_4'
  | 'google_search_console'
  | 'google_business_profile'
  | 'google_maps'
  | 'google_places'
  | 'youtube'
  | 'central_dispatch'
  | 'super_dispatch'
  | 'fmcsa'
  | 'nhtsa'
  | 'stripe'
  | 'authorize_net'
  | 'quickbooks';

export type IntegrationCapability =
  | 'telephony.calls'
  | 'telephony.sms'
  | 'messaging'
  | 'comments'
  | 'content.read'
  | 'content.publish'
  | 'advertising'
  | 'analytics'
  | 'leads'
  | 'webhooks'
  | 'listings'
  | 'offers'
  | 'fulfillment'
  | 'documents'
  | 'market_intelligence'
  | 'carrier_lookup'
  | 'carrier_compliance'
  | 'vehicle_decode'
  | 'payments'
  | 'accounting'
  | 'geocoding'
  | 'routing';

export type ConnectionStatus =
  | 'not_configured'
  | 'authorization_required'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'error';

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProviderKey;
  accountLabel: string;
  externalAccountId: string | null;
  status: ConnectionStatus;
  authorizedCapabilities: IntegrationCapability[];
  requestedCapabilities: IntegrationCapability[];
  secretRef: string | null;
  accessTokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderRequestContext {
  connectionId: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface ProviderHealth {
  ok: boolean;
  checkedAt: string;
  latencyMs: number | null;
  details: Record<string, unknown>;
}

export interface ProviderAdapter {
  readonly provider: IntegrationProviderKey;
  readonly capabilities: readonly IntegrationCapability[];
  health(context: ProviderRequestContext): Promise<ProviderHealth>;
}

export interface NormalizedProviderEvent<TPayload = Record<string, unknown>> {
  provider: IntegrationProviderKey;
  externalEventId: string;
  eventType: string;
  occurredAt: string | null;
  payload: TPayload;
  rawReference: string | null;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: IntegrationProviderKey,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const PROVIDER_CAPABILITIES: Readonly<Record<IntegrationProviderKey, readonly IntegrationCapability[]>> = {
  dialpad: ['telephony.calls', 'telephony.sms', 'webhooks'],
  instagram: ['messaging', 'comments', 'content.read', 'content.publish', 'advertising', 'analytics', 'leads', 'webhooks'],
  facebook: ['messaging', 'comments', 'content.read', 'content.publish', 'advertising', 'analytics', 'leads', 'webhooks'],
  tiktok: ['messaging', 'comments', 'content.read', 'content.publish', 'advertising', 'analytics', 'leads', 'webhooks'],
  website: ['messaging', 'content.read', 'content.publish', 'analytics', 'leads', 'webhooks'],
  google_ads: ['advertising', 'analytics', 'leads'],
  google_analytics_4: ['analytics'],
  google_search_console: ['analytics'],
  google_business_profile: ['content.read', 'content.publish', 'analytics'],
  google_maps: ['geocoding', 'routing'],
  google_places: ['geocoding'],
  youtube: ['content.read', 'content.publish', 'analytics'],
  central_dispatch: ['listings', 'offers', 'fulfillment', 'documents', 'market_intelligence', 'webhooks'],
  super_dispatch: ['listings', 'fulfillment', 'documents', 'webhooks'],
  fmcsa: ['carrier_lookup', 'carrier_compliance'],
  nhtsa: ['vehicle_decode'],
  stripe: ['payments', 'webhooks'],
  authorize_net: ['payments', 'webhooks'],
  quickbooks: ['accounting', 'webhooks'],
};

export function supportsCapability(provider: IntegrationProviderKey, capability: IntegrationCapability): boolean {
  return PROVIDER_CAPABILITIES[provider].includes(capability);
}

export interface HttpTransport {
  request<T>(input: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  }): Promise<{ status: number; headers: Record<string, string>; data: T }>;
}

export class FmcsaAdapter {
  readonly provider = 'fmcsa' as const;
  readonly capabilities = PROVIDER_CAPABILITIES.fmcsa;

  constructor(private readonly http: HttpTransport, private readonly webKey: string) {}

  async lookupByUsdot(usdot: string): Promise<unknown> {
    const clean = usdot.replace(/\D/g, '');
    if (!clean) throw new ProviderError('fmcsa', 'INVALID_USDOT', 'USDOT number is required', false);
    const response = await this.http.request<unknown>({
      method: 'GET',
      url: `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(clean)}?webKey=${encodeURIComponent(this.webKey)}`,
    });
    if (response.status >= 500) throw new ProviderError('fmcsa', 'UPSTREAM_ERROR', 'FMCSA request failed', true);
    if (response.status >= 400) throw new ProviderError('fmcsa', 'REQUEST_REJECTED', 'FMCSA request was rejected', false);
    return response.data;
  }
}

export class NhtsaAdapter {
  readonly provider = 'nhtsa' as const;
  readonly capabilities = PROVIDER_CAPABILITIES.nhtsa;

  constructor(private readonly http: HttpTransport) {}

  async decodeVin(vin: string, modelYear?: number): Promise<unknown> {
    const clean = vin.trim().toUpperCase();
    if (!clean) throw new ProviderError('nhtsa', 'INVALID_VIN', 'VIN is required', false);
    const year = modelYear ? `&modelyear=${encodeURIComponent(String(modelYear))}` : '';
    const response = await this.http.request<unknown>({
      method: 'GET',
      url: `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(clean)}?format=json${year}`,
    });
    if (response.status >= 500) throw new ProviderError('nhtsa', 'UPSTREAM_ERROR', 'NHTSA request failed', true);
    if (response.status >= 400) throw new ProviderError('nhtsa', 'REQUEST_REJECTED', 'NHTSA request was rejected', false);
    return response.data;
  }
}

export interface CentralDispatchConfig {
  token: string;
  listingsBaseUrl?: string;
  fulfillmentBaseUrl?: string;
}

export class CentralDispatchAdapter {
  readonly provider = 'central_dispatch' as const;
  readonly capabilities = PROVIDER_CAPABILITIES.central_dispatch;
  private readonly listingsBaseUrl: string;
  private readonly fulfillmentBaseUrl: string;

  constructor(private readonly http: HttpTransport, private readonly config: CentralDispatchConfig) {
    this.listingsBaseUrl = config.listingsBaseUrl ?? 'https://marketplace-api.centraldispatch.com';
    this.fulfillmentBaseUrl = config.fulfillmentBaseUrl ?? 'https://fulfillment-api.centraldispatch.com';
  }

  async createListing(payload: unknown, context: ProviderRequestContext): Promise<unknown> {
    return this.post(this.listingsBaseUrl, '/api/v2/listings', payload, context);
  }

  async createDispatch(payload: unknown, context: ProviderRequestContext): Promise<unknown> {
    return this.post(this.fulfillmentBaseUrl, '/api/fulfillments/create', payload, context);
  }

  private async post(baseUrl: string, path: string, payload: unknown, context: ProviderRequestContext): Promise<unknown> {
    const response = await this.http.request<unknown>({
      method: 'POST',
      url: `${baseUrl}${path}`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': context.correlationId,
        'Idempotency-Key': context.idempotencyKey,
      },
      body: payload,
      timeoutMs: 15000,
    });
    if (response.status === 409) {
      throw new ProviderError('central_dispatch', 'CONFLICT', 'Central Dispatch request conflicted', false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ProviderError('central_dispatch', 'UPSTREAM_RETRYABLE', 'Central Dispatch request failed', true);
    }
    if (response.status >= 400) {
      throw new ProviderError('central_dispatch', 'REQUEST_REJECTED', 'Central Dispatch request was rejected', false);
    }
    return response.data;
  }
}

export interface DialpadCallEvent {
  callId: string;
  state: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  externalNumber: string | null;
  internalNumber: string | null;
  eventTimestamp: string | null;
  startedAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  transcriptionText: string | null;
  raw: Record<string, unknown>;
}

export interface DialpadSmsEvent {
  messageId: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  fromNumber: string | null;
  toNumbers: string[];
  text: string | null;
  messageStatus: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

function readString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
}

function millisToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

export function normalizeDialpadCallEvent(payload: Record<string, unknown>): DialpadCallEvent {
  const direction = payload.direction === 'inbound' || payload.direction === 'outbound' ? payload.direction : 'unknown';
  const callId = readString(payload, 'call_id');
  if (!callId) throw new ProviderError('dialpad', 'MALFORMED_CALL_EVENT', 'Dialpad call event is missing call_id', false);
  return {
    callId,
    state: readString(payload, 'state') ?? 'unknown',
    direction,
    externalNumber: readString(payload, 'external_number'),
    internalNumber: readString(payload, 'internal_number'),
    eventTimestamp: millisToIso(payload.event_timestamp),
    startedAt: millisToIso(payload.date_started),
    connectedAt: millisToIso(payload.date_connected),
    endedAt: millisToIso(payload.date_ended),
    durationMs: typeof payload.duration === 'number' ? payload.duration : null,
    transcriptionText: readString(payload, 'transcription_text'),
    raw: payload,
  };
}

export function normalizeDialpadSmsEvent(payload: Record<string, unknown>): DialpadSmsEvent {
  const messageId = readString(payload, 'id');
  if (!messageId) throw new ProviderError('dialpad', 'MALFORMED_SMS_EVENT', 'Dialpad SMS event is missing id', false);
  const direction = payload.direction === 'inbound' || payload.direction === 'outbound' ? payload.direction : 'unknown';
  const toNumbers = Array.isArray(payload.to_number)
    ? payload.to_number.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    messageId,
    direction,
    fromNumber: readString(payload, 'from_number'),
    toNumbers,
    text: readString(payload, 'text'),
    messageStatus: readString(payload, 'message_status'),
    createdAt: millisToIso(payload.created_date),
    raw: payload,
  };
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export async function verifyDialpadWebhookJwt(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new ProviderError('dialpad', 'INVALID_WEBHOOK_JWT', 'Malformed Dialpad webhook token', false);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new ProviderError('dialpad', 'INVALID_WEBHOOK_JWT', 'Malformed Dialpad webhook token', false);
  }
  const header = JSON.parse(bytesToString(base64UrlToBytes(encodedHeader))) as Record<string, unknown>;
  if (header.alg !== 'HS256') throw new ProviderError('dialpad', 'INVALID_WEBHOOK_ALGORITHM', 'Dialpad webhook must use HS256', false);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new ProviderError('dialpad', 'INVALID_WEBHOOK_SIGNATURE', 'Dialpad webhook signature verification failed', false);
  const payload = JSON.parse(bytesToString(base64UrlToBytes(encodedPayload))) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProviderError('dialpad', 'INVALID_WEBHOOK_PAYLOAD', 'Dialpad webhook payload must be an object', false);
  }
  return payload as Record<string, unknown>;
}

export class DialpadAdapter {
  readonly provider = 'dialpad' as const;
  readonly capabilities = PROVIDER_CAPABILITIES.dialpad;

  constructor(private readonly http: HttpTransport, private readonly accessToken: string) {}

  async sendSms(input: { toNumbers: string[]; text: string; userId?: string; fromNumber?: string }, context: ProviderRequestContext): Promise<unknown> {
    if (input.toNumbers.length === 0) throw new ProviderError('dialpad', 'MISSING_RECIPIENT', 'At least one SMS recipient is required', false);
    const body: Record<string, unknown> = { to_numbers: input.toNumbers, text: input.text };
    if (input.userId) body.user_id = input.userId;
    if (input.fromNumber) body.from_number = input.fromNumber;
    const response = await this.http.request<unknown>({
      method: 'POST',
      url: 'https://dialpad.com/api/v2/sms',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': context.correlationId,
      },
      body,
      timeoutMs: 15000,
    });
    if (response.status === 429 || response.status >= 500) throw new ProviderError('dialpad', 'UPSTREAM_RETRYABLE', 'Dialpad SMS request failed', true);
    if (response.status >= 400) throw new ProviderError('dialpad', 'REQUEST_REJECTED', 'Dialpad SMS request was rejected', false);
    return response.data;
  }

  async initiateCall(input: { userId: string; phoneNumber: string; customData?: string }, context: ProviderRequestContext): Promise<unknown> {
    const body: Record<string, unknown> = { phone_number: input.phoneNumber };
    if (input.customData) body.custom_data = input.customData;
    const response = await this.http.request<unknown>({
      method: 'POST',
      url: `https://dialpad.com/api/v2/users/${encodeURIComponent(input.userId)}/initiate_call`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': context.correlationId,
      },
      body,
      timeoutMs: 15000,
    });
    if (response.status === 429 || response.status >= 500) throw new ProviderError('dialpad', 'UPSTREAM_RETRYABLE', 'Dialpad call request failed', true);
    if (response.status >= 400) throw new ProviderError('dialpad', 'REQUEST_REJECTED', 'Dialpad call request was rejected', false);
    return response.data;
  }
}
