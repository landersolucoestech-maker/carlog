'use client';

import { FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.carlogconnection.com';

function browserAttribution() {
  const params = new URLSearchParams(window.location.search);
  const visitorKey = 'carlog.visitor_id';
  const sessionKey = 'carlog.session_id';
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(visitorKey, visitorId); }
  let sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(sessionKey, sessionId); }
  return {
    visitorId,
    sessionId,
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    campaignId: params.get('utm_id'),
    adGroup: params.get('utm_adgroup'),
    adGroupId: params.get('utm_adgroup_id'),
    ad: params.get('utm_content'),
    adId: params.get('utm_ad_id'),
    keyword: params.get('utm_term'),
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
    ttclid: params.get('ttclid'),
    landingPage: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || null,
  };
}

export function QuoteRequestForm() {
  const [state, setState] = useState<'idle'|'submitting'|'success'|'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting'); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: String(form.get('firstName') ?? '').trim(),
      lastName: String(form.get('lastName') ?? '').trim(),
      email: String(form.get('email') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      origin: String(form.get('origin') ?? '').trim(),
      destination: String(form.get('destination') ?? '').trim(),
      vehicleDescription: String(form.get('vehicleDescription') ?? '').trim(),
      source: new URLSearchParams(window.location.search).get('utm_source') || 'website',
      attribution: browserAttribution(),
    };
    try {
      const response = await fetch(`${apiUrl}/v1/public/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('We could not submit your request.');
      event.currentTarget.reset();
      setState('success'); setMessage('Your transport request was received. A Car Log specialist will follow up.');
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'We could not submit your request.');
    }
  }

  return (
    <form className="quote-card" onSubmit={submit}>
      <h2>Get a transport quote</h2>
      <p>Tell us what you are shipping and where it needs to go.</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" required autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" /></div>
        <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
        <div className="field"><label htmlFor="origin">Pickup location</label><input id="origin" name="origin" required placeholder="City, State or ZIP" /></div>
        <div className="field"><label htmlFor="destination">Delivery location</label><input id="destination" name="destination" required placeholder="City, State or ZIP" /></div>
        <div className="field span-2"><label htmlFor="vehicleDescription">Vehicle</label><input id="vehicleDescription" name="vehicleDescription" required placeholder="Year, make and model" /></div>
        <div className="span-2"><button className="submit-button" disabled={state==='submitting'}>{state==='submitting'?'Submitting…':'Request my quote'}</button></div>
      </div>
      {message ? <p className="form-status" data-state={state}>{message}</p> : null}
    </form>
  );
}
