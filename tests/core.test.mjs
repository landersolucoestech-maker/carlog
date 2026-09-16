import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertOrderTransition,
  assertPaymentWithinOrderEconomics,
  assertPickupWindow,
  canTransitionOrder,
  isCarrierEligible,
  orderGrossProfitCents,
  quoteMarginCents,
} from '../.build/core/packages/domain/src/index.js';
import {
  deriveWebsiteAttribution,
  normalizePhone,
  resolveContact,
} from '../.build/core/packages/communication/src/index.js';
import {
  normalizeDialpadSmsEvent,
  supportsCapability,
} from '../.build/core/packages/integrations/src/index.js';

test('order lifecycle only allows canonical forward transitions and explicit pre-pickup rollback', () => {
  assert.equal(canTransitionOrder('booked', 'sourcing'), true);
  assert.equal(canTransitionOrder('sourcing', 'carrier_selected'), true);
  assert.equal(canTransitionOrder('carrier_selected', 'sourcing'), true);
  assert.equal(canTransitionOrder('pickup_scheduled', 'picked_up'), true);
  assert.equal(canTransitionOrder('picked_up', 'in_transit'), true);
  assert.equal(canTransitionOrder('in_transit', 'delivered'), true);
  assert.equal(canTransitionOrder('delivered', 'settled'), true);
  assert.equal(canTransitionOrder('in_transit', 'sourcing'), false);
  assert.equal(canTransitionOrder('settled', 'delivered'), false);
  assert.equal(canTransitionOrder('cancelled', 'booked'), false);
  assert.throws(() => assertOrderTransition('picked_up', 'sourcing'), /Invalid order transition/);
});

test('carrier eligibility requires active authority, verified insurance, approval and non-high risk', () => {
  assert.equal(isCarrierEligible({
    authorityStatus: 'active',
    insuranceStatus: 'verified',
    internalApproval: 'approved',
    riskLevel: 'low',
  }), true);
  assert.equal(isCarrierEligible({
    authorityStatus: 'active',
    insuranceStatus: 'verified',
    internalApproval: 'approved',
    riskLevel: 'high',
  }), false);
  assert.equal(isCarrierEligible({
    authorityStatus: 'inactive',
    insuranceStatus: 'verified',
    internalApproval: 'approved',
    riskLevel: 'low',
  }), false);
});

test('order and quote economics remain derived from canonical amounts', () => {
  assert.equal(quoteMarginCents({ customerPriceCents: 150000, estimatedCarrierPayCents: 110000 }), 40000);
  assert.equal(orderGrossProfitCents({ customerPriceCents: 150000, carrierPayCents: 112500 }), 37500);
  assert.doesNotThrow(() => assertPaymentWithinOrderEconomics({
    type: 'customer',
    existingPaidCents: 50000,
    newPaymentCents: 100000,
    order: { customerPriceCents: 150000, carrierPayCents: 112500 },
  }));
  assert.throws(() => assertPaymentWithinOrderEconomics({
    type: 'carrier',
    existingPaidCents: 100000,
    newPaymentCents: 20000,
    order: { customerPriceCents: 150000, carrierPayCents: 112500 },
  }), /Payment exceeds order economics/);
});

test('pickup window cannot end before it starts', () => {
  assert.doesNotThrow(() => assertPickupWindow('2026-09-16T10:00:00.000Z', '2026-09-16T12:00:00.000Z'));
  assert.throws(() => assertPickupWindow('2026-09-16T12:00:00.000Z', '2026-09-16T10:00:00.000Z'), /Pickup end cannot precede pickup start/);
});

test('communication normalizes US and international phone numbers deterministically', () => {
  assert.equal(normalizePhone('(305) 555-1212'), '+13055551212');
  assert.equal(normalizePhone('+55 (33) 99999-9999'), '+5533999999999');
  assert.equal(normalizePhone(''), null);
});

test('contact resolution prefers provider identity before email and phone', () => {
  const candidates = [
    { contactId: 'external', email: 'other@example.com', phone: '+13055550000', externalIds: { instagram: 'ig-42' } },
    { contactId: 'email', email: 'lead@example.com', phone: '+13055551111', externalIds: {} },
    { contactId: 'phone', email: null, phone: '+13055552222', externalIds: {} },
  ];
  assert.equal(resolveContact({ provider: 'instagram', externalId: 'ig-42', email: 'lead@example.com', phone: '+13055552222', candidates })?.contactId, 'external');
  assert.equal(resolveContact({ email: 'LEAD@example.com', candidates })?.contactId, 'email');
  assert.equal(resolveContact({ phone: '(305) 555-2222', candidates })?.contactId, 'phone');
});

test('website attribution preserves campaign and click identifiers', () => {
  const context = deriveWebsiteAttribution(
    'https://carlogconnection.com/quote?visitor_id=v-1&session_id=s-1&utm_source=google&utm_medium=cpc&utm_campaign=miami-boston&utm_id=cmp-7&gclid=g-1&fbclid=f-1&ttclid=t-1',
    'https://google.com/',
  );
  assert.equal(context.anonymousVisitorId, 'v-1');
  assert.equal(context.sessionId, 's-1');
  assert.equal(context.source, 'google');
  assert.equal(context.medium, 'cpc');
  assert.equal(context.campaign, 'miami-boston');
  assert.equal(context.campaignId, 'cmp-7');
  assert.equal(context.gclid, 'g-1');
  assert.equal(context.fbclid, 'f-1');
  assert.equal(context.ttclid, 't-1');
});

test('integration capability model keeps Dialpad focused on calls, SMS and webhooks', () => {
  assert.equal(supportsCapability('dialpad', 'telephony.calls'), true);
  assert.equal(supportsCapability('dialpad', 'telephony.sms'), true);
  assert.equal(supportsCapability('dialpad', 'webhooks'), true);
  assert.equal(supportsCapability('dialpad', 'advertising'), false);
  assert.equal(supportsCapability('fmcsa', 'carrier_compliance'), true);
  assert.equal(supportsCapability('nhtsa', 'vehicle_decode'), true);
});

test('Dialpad SMS normalization rejects missing provider IDs and keeps external identity', () => {
  const normalized = normalizeDialpadSmsEvent({
    id: 'msg-123',
    direction: 'inbound',
    from_number: '+13055550000',
    to_number: ['+13055559999'],
    text: 'Need a quote',
    message_status: 'received',
    created_date: 1_800_000_000_000,
  });
  assert.equal(normalized.messageId, 'msg-123');
  assert.equal(normalized.direction, 'inbound');
  assert.deepEqual(normalized.toNumbers, ['+13055559999']);
  assert.equal(normalized.text, 'Need a quote');
  assert.throws(() => normalizeDialpadSmsEvent({ direction: 'inbound' }), /missing id/);
});
