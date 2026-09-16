export type CommunicationChannel =
  | 'website_chat'
  | 'dialpad_sms'
  | 'dialpad_phone'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'email'
  | 'internal';

export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type MessageDirection = 'inbound' | 'outbound' | 'internal';

export interface ConversationContext {
  contactId: string | null;
  customerId: string | null;
  leadId: string | null;
  quoteId: string | null;
  orderId: string | null;
  carrierId: string | null;
}

export interface Conversation {
  id: string;
  channel: CommunicationChannel;
  provider: string;
  externalConversationId: string | null;
  status: ConversationStatus;
  context: ConversationContext;
  assignedUserId: string | null;
  participantIds: string[];
  tags: string[];
  aiSummary: string | null;
  detectedIntent: string | null;
  sentiment: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  unreadCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  url: string;
  name: string | null;
  mimeType: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  provider: string;
  externalMessageId: string | null;
  direction: MessageDirection;
  senderExternalId: string | null;
  senderUserId: string | null;
  body: string | null;
  attachments: MessageAttachment[];
  status: 'received' | 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown';
  occurredAt: string;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  conversationId: string;
  provider: 'dialpad';
  externalCallId: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  fromNumber: string | null;
  toNumber: string | null;
  state: string;
  startedAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteVisitorContext {
  anonymousVisitorId: string;
  sessionId: string;
  authenticatedUserId: string | null;
  currentPage: string;
  referrer: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  campaignId: string | null;
  gclid: string | null;
  fbclid: string | null;
  ttclid: string | null;
}

export interface ContactCandidate {
  contactId: string;
  email: string | null;
  phone: string | null;
  externalIds: Record<string, string>;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return digits;
}

export function resolveContact(input: {
  email?: string | null;
  phone?: string | null;
  provider?: string;
  externalId?: string | null;
  candidates: ContactCandidate[];
}): ContactCandidate | null {
  const email = input.email?.trim().toLowerCase() ?? null;
  const phone = normalizePhone(input.phone);
  if (input.provider && input.externalId) {
    const byExternal = input.candidates.find((candidate) => candidate.externalIds[input.provider!] === input.externalId);
    if (byExternal) return byExternal;
  }
  if (email) {
    const byEmail = input.candidates.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (phone) {
    const byPhone = input.candidates.find((candidate) => normalizePhone(candidate.phone) === phone);
    if (byPhone) return byPhone;
  }
  return null;
}

export function deriveWebsiteAttribution(url: string, referrer: string | null): WebsiteVisitorContext {
  const parsed = new URL(url, 'https://carlog.invalid');
  const params = parsed.searchParams;
  const sessionId = params.get('session_id') ?? crypto.randomUUID();
  const anonymousVisitorId = params.get('visitor_id') ?? crypto.randomUUID();
  return {
    anonymousVisitorId,
    sessionId,
    authenticatedUserId: null,
    currentPage: `${parsed.pathname}${parsed.search}`,
    referrer,
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    campaignId: params.get('utm_id'),
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
    ttclid: params.get('ttclid'),
  };
}
