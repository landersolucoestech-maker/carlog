export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'follow_up' | 'won' | 'lost';
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type OrderStatus =
  | 'booked'
  | 'sourcing'
  | 'carrier_selected'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'settled'
  | 'cancelled';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  contactId: string;
  status: LeadStatus;
  source: string;
  assignedUserId: string | null;
  origin: string | null;
  destination: string | null;
  vehicleDescription: string | null;
  firstTouchAttributionId: string | null;
  lastTouchAttributionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  leadId: string;
  contactId: string;
  customerPriceCents: number;
  estimatedCarrierPayCents: number;
  status: QuoteStatus;
  origin: string | null;
  destination: string | null;
  vehicleDescription: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  sourceQuoteId: string;
  contactId: string;
  carrierId: string | null;
  origin: string | null;
  destination: string | null;
  vehicleDescription: string | null;
  customerPriceCents: number;
  carrierPayCents: number;
  status: OrderStatus;
  pickupStartAt: string | null;
  pickupEndAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierComplianceFacts {
  authorityStatus: 'active' | 'inactive' | 'unknown';
  insuranceStatus: 'verified' | 'expired' | 'unknown';
  internalApproval: 'approved' | 'review' | 'blocked';
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
}

export function isCarrierEligible(facts: CarrierComplianceFacts): boolean {
  return (
    facts.authorityStatus === 'active' &&
    facts.insuranceStatus === 'verified' &&
    facts.internalApproval === 'approved' &&
    facts.riskLevel !== 'high'
  );
}

export function quoteMarginCents(quote: Pick<Quote, 'customerPriceCents' | 'estimatedCarrierPayCents'>): number {
  return quote.customerPriceCents - quote.estimatedCarrierPayCents;
}

export function orderGrossProfitCents(order: Pick<Order, 'customerPriceCents' | 'carrierPayCents'>): number {
  return order.customerPriceCents - order.carrierPayCents;
}

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  booked: ['sourcing', 'carrier_selected', 'cancelled'],
  sourcing: ['carrier_selected', 'cancelled'],
  carrier_selected: ['pickup_scheduled', 'sourcing', 'cancelled'],
  pickup_scheduled: ['picked_up', 'sourcing', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: ['settled'],
  settled: [],
  cancelled: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}

export function assertPickupWindow(startAt: string | null, endAt: string | null): void {
  if (!startAt || !endAt) return;
  if (Date.parse(endAt) < Date.parse(startAt)) throw new Error('Pickup end cannot precede pickup start');
}

export function assertPaymentWithinOrderEconomics(input: {
  type: 'customer' | 'carrier';
  existingPaidCents: number;
  newPaymentCents: number;
  order: Pick<Order, 'customerPriceCents' | 'carrierPayCents'>;
}): void {
  if (input.newPaymentCents <= 0) throw new Error('Payment amount must be positive');
  const cap = input.type === 'customer' ? input.order.customerPriceCents : input.order.carrierPayCents;
  if (input.existingPaidCents + input.newPaymentCents > cap) {
    throw new Error('Payment exceeds order economics');
  }
}
