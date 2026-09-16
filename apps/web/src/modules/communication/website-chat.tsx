'use client';

import { FormEvent, useMemo, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.carlogconnection.com';
type Bubble = { id: string; body: string; mine: boolean };

function identity() {
  const visitorKey = 'carlog.visitor_id';
  const sessionKey = 'carlog.session_id';
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(visitorKey, visitorId); }
  let sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(sessionKey, sessionId); }
  return { visitorId, sessionId };
}

function attribution() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign'), campaignId: params.get('utm_id'),
    gclid: params.get('gclid'), fbclid: params.get('fbclid'), ttclid: params.get('ttclid'), landingPage: `${window.location.pathname}${window.location.search}`,
  };
}

export function WebsiteChat() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([{ id: 'welcome', body: 'Hi. Tell us where the vehicle is, where it is going, and what you are shipping.', mine: false }]);
  const canSend = useMemo(() => !sending, [sending]);

  async function ensureConversation(initialMessage?: string) {
    if (conversationId && token) return { conversationId, token };
    const { visitorId, sessionId } = identity();
    const response = await fetch(`${apiUrl}/v1/public/chat/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, sessionId, currentPage: `${window.location.pathname}${window.location.search}`, referrer: document.referrer || null, initialMessage: initialMessage ?? null, attribution: attribution() }),
    });
    if (!response.ok) throw new Error('Chat is temporarily unavailable.');
    const data = await response.json() as { conversationId: string; accessToken: string };
    setConversationId(data.conversationId); setToken(data.accessToken);
    return { conversationId: data.conversationId, token: data.accessToken };
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const body = String(form.get('message') ?? '').trim(); if (!body) return;
    event.currentTarget.reset(); setSending(true); setBubbles(current => [...current, { id: crypto.randomUUID(), body, mine: true }]);
    try {
      if (!conversationId || !token) {
        await ensureConversation(body);
      } else {
        const response = await fetch(`${apiUrl}/v1/public/chat/conversations/${conversationId}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chat-Token': token },
          body: JSON.stringify({ body, clientMessageId: crypto.randomUUID() }),
        });
        if (!response.ok) throw new Error('Message delivery failed.');
      }
    } catch {
      setBubbles(current => [...current, { id: crypto.randomUUID(), body: 'We could not deliver that message. Please try again or request a quote above.', mine: false }]);
    } finally { setSending(false); }
  }

  return <>
    {open ? <section className="chat-panel" aria-label="Car Log website chat">
      <div className="chat-head"><strong>Car Log Support</strong><span>Website chat · connected to the Car Log inbox</span></div>
      <div className="chat-body">{bubbles.map(item => <div key={item.id} className={`chat-bubble${item.mine?' chat-bubble--user':''}`}>{item.body}</div>)}</div>
      <form className="chat-compose" onSubmit={send}><input name="message" aria-label="Message" placeholder="Type your message…" autoComplete="off" /><button disabled={!canSend}>{sending?'…':'Send'}</button></form>
    </section> : null}
    <button className="chat-launcher" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open?'Close':'Chat with us'}</button>
  </>;
}
