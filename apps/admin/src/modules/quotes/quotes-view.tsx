'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';

type Lead = { id:string; first_name?:string; last_name?:string; origin?:string|null; destination?:string|null; vehicle_description?:string|null; status:string };
type Quote = { id:string; lead_id:string; status:string; first_name?:string; last_name?:string; origin?:string|null; destination?:string|null; vehicle_description?:string|null; customer_price_cents:number|string; estimated_carrier_pay_cents:number|string; expires_at?:string|null };
const usd=(value:number|string)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)/100);

export function QuotesView(){
  const {user}=useAuth(); const [quotes,setQuotes]=useState<Quote[]>([]); const [leads,setLeads]=useState<Lead[]>([]); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function load(){setError('');try{const [q,l]=await Promise.all([apiRequest<Quote[]>('/v1/quotes'),apiRequest<Lead[]>('/v1/leads')]);setQuotes(q);setLeads(l.filter(item=>!['won','lost'].includes(item.status)))}catch(reason){setError(reason instanceof Error?reason.message:'Failed to load quotes')}}
  useEffect(()=>{void load()},[]);
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);try{await apiRequest('/v1/quotes',{method:'POST',body:JSON.stringify({leadId:String(form.get('leadId')),customerPriceCents:Math.round(Number(form.get('customerPrice'))*100),estimatedCarrierPayCents:Math.round(Number(form.get('carrierPay'))*100),expiresAt:String(form.get('expiresAt')||'')?new Date(String(form.get('expiresAt'))).toISOString():null})});event.currentTarget.reset();await load()}catch(reason){setError(reason instanceof Error?reason.message:'Quote creation failed')}finally{setBusy(false)}}
  async function action(id:string,type:'send'|'accept'){setBusy(true);setError('');try{await apiRequest(`/v1/quotes/${id}/${type}`,{method:'POST'});await load()}catch(reason){setError(reason instanceof Error?reason.message:'Quote action failed')}finally{setBusy(false)}}
  const canCreate=user?.permissions.includes('quote.create'); const canSend=user?.permissions.includes('quote.send'); const canAccept=user?.permissions.includes('quote.accept');
  return <main className="page">
    <div className="page-header"><div><h1>Quotes</h1><p>Create pricing from qualified leads, send quotes and atomically convert accepted quotes into customer orders.</p></div><button className="icon-button" onClick={()=>void load()}>Refresh</button></div>
    {error?<div className="error-state">{error}</div>:null}
    {canCreate?<form className="panel" onSubmit={create} style={{marginBottom:18}}><div className="panel-head"><h2>Create Quote</h2><span>Customer price must cover estimated carrier pay.</span></div><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:10,padding:16}}>
      <select name="leadId" required style={{padding:10,border:'1px solid var(--carlog-border)',borderRadius:9}} defaultValue=""><option value="" disabled>Select lead</option>{leads.map(lead=><option key={lead.id} value={lead.id}>{lead.first_name} {lead.last_name} · {lead.origin??'Unknown'} → {lead.destination??'Unknown'} · {lead.vehicle_description??'Vehicle'}</option>)}</select>
      <input name="customerPrice" type="number" min="0" step="0.01" required placeholder="Customer price" style={{padding:10,border:'1px solid var(--carlog-border)',borderRadius:9}} />
      <input name="carrierPay" type="number" min="0" step="0.01" required placeholder="Carrier estimate" style={{padding:10,border:'1px solid var(--carlog-border)',borderRadius:9}} />
      <input name="expiresAt" type="datetime-local" style={{padding:10,border:'1px solid var(--carlog-border)',borderRadius:9}} />
      <button className="icon-button" disabled={busy}>Create</button>
    </div></form>:null}
    <section className="panel"><div className="panel-head"><h2>Quote Pipeline</h2><span>{quotes.length} quotes</span></div>{quotes.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Route</th><th>Vehicle</th><th>Price</th><th>Carrier Estimate</th><th>Margin</th><th>Status</th><th>Actions</th></tr></thead><tbody>{quotes.map(quote=>{const margin=Number(quote.customer_price_cents)-Number(quote.estimated_carrier_pay_cents);return <tr key={quote.id}><td>{quote.first_name} {quote.last_name}</td><td>{quote.origin??'—'} → {quote.destination??'—'}</td><td>{quote.vehicle_description??'—'}</td><td>{usd(quote.customer_price_cents)}</td><td>{usd(quote.estimated_carrier_pay_cents)}</td><td>{usd(margin)}</td><td><span className="badge">{quote.status}</span></td><td>{canSend&&quote.status==='draft'?<button className="icon-button" disabled={busy} onClick={()=>void action(quote.id,'send')}>Send</button>:null} {canAccept&&['sent','viewed'].includes(quote.status)?<button className="icon-button" disabled={busy} onClick={()=>void action(quote.id,'accept')}>Accept</button>:null}</td></tr>})}</tbody></table></div>:<div className="empty-state">No quotes yet.</div>}</section>
  </main>;
}
