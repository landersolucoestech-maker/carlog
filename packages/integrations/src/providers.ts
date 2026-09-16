import {
  ProviderError,
  type HttpTransport,
  type ProviderRequestContext,
} from './index.js';

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function assertHttpSuccess(provider: 'google_analytics_4' | 'tiktok' | 'stripe', status: number, message: string): void {
  if (status < 400) return;
  throw new ProviderError(provider, retryableStatus(status) ? 'UPSTREAM_RETRYABLE' : 'REQUEST_REJECTED', message, retryableStatus(status));
}

export interface Ga4MeasurementConfig {
  measurementId: string;
  apiSecret: string;
  endpoint?: string;
}

export interface Ga4Event {
  name: string;
  params?: Record<string, string | number | boolean>;
}

export class Ga4MeasurementProtocolAdapter {
  private readonly endpoint: string;

  constructor(private readonly http: HttpTransport, private readonly config: Ga4MeasurementConfig) {
    this.endpoint = config.endpoint ?? 'https://www.google-analytics.com/mp/collect';
  }

  async sendEvents(input: {
    clientId: string;
    userId?: string;
    timestampMicros?: number;
    events: Ga4Event[];
  }): Promise<unknown> {
    if (!input.clientId.trim()) throw new ProviderError('google_analytics_4', 'INVALID_CLIENT_ID', 'GA4 client_id is required', false);
    if (input.events.length === 0 || input.events.length > 25) {
      throw new ProviderError('google_analytics_4', 'INVALID_EVENTS', 'GA4 requires between 1 and 25 events per request', false);
    }
    const body: Record<string, unknown> = { client_id: input.clientId, events: input.events };
    if (input.userId) body.user_id = input.userId;
    if (input.timestampMicros) body.timestamp_micros = input.timestampMicros;
    const query = new URLSearchParams({ measurement_id: this.config.measurementId, api_secret: this.config.apiSecret });
    const response = await this.http.request<unknown>({
      method: 'POST',
      url: `${this.endpoint}?${query.toString()}`,
      headers: { 'Content-Type': 'application/json' },
      body,
      timeoutMs: 15000,
    });
    assertHttpSuccess('google_analytics_4', response.status, 'GA4 Measurement Protocol request failed');
    return response.data;
  }
}

export class TikTokContentPostingAdapter {
  private readonly baseUrl = 'https://open.tiktokapis.com';

  constructor(private readonly http: HttpTransport, private readonly accessToken: string) {}

  private async post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      method: 'POST',
      url: `${this.baseUrl}${path}`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: payload,
      timeoutMs: 20000,
    });
    assertHttpSuccess('tiktok', response.status, 'TikTok Content Posting request failed');
    const error = response.data && typeof response.data === 'object' ? response.data.error : null;
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const code = typeof (error as Record<string, unknown>).code === 'string' ? String((error as Record<string, unknown>).code) : 'unknown';
      if (code !== 'ok') {
        throw new ProviderError('tiktok', `TIKTOK_${code.toUpperCase()}`, 'TikTok rejected the content publishing request', code.includes('rate'));
      }
    }
    return response.data;
  }

  async queryCreatorInfo(): Promise<Record<string, unknown>> {
    return this.post('/v2/post/publish/creator_info/query/', {});
  }

  async directPostVideo(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.queryCreatorInfo();
    return this.post('/v2/post/publish/video/init/', payload);
  }

  async directPostPhotos(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.queryCreatorInfo();
    return this.post('/v2/post/publish/content/init/', payload);
  }
}

export class StripePaymentAdapter {
  constructor(private readonly http: HttpTransport, private readonly secretKey: string) {}

  async createPaymentIntent(input: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }, context: ProviderRequestContext): Promise<unknown> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ProviderError('stripe', 'INVALID_AMOUNT', 'Stripe PaymentIntent amount must be a positive integer', false);
    }
    if (!/^[a-zA-Z]{3}$/.test(input.currency)) {
      throw new ProviderError('stripe', 'INVALID_CURRENCY', 'Stripe currency must be a three-letter ISO code', false);
    }
    const form = new URLSearchParams({ amount: String(input.amountCents), currency: input.currency.toLowerCase() });
    for (const [key, value] of Object.entries(input.metadata ?? {})) form.set(`metadata[${key}]`, value);
    const response = await this.http.request<unknown>({
      method: 'POST',
      url: 'https://api.stripe.com/v1/payment_intents',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': context.idempotencyKey,
      },
      body: form.toString(),
      timeoutMs: 15000,
    });
    assertHttpSuccess('stripe', response.status, 'Stripe PaymentIntent request failed');
    return response.data;
  }
}
