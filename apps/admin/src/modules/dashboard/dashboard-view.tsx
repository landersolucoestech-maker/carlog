'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';

type Dashboard = {
  summary: Record<string, number>;
  recentActivity: Array<Record<string, unknown>>;
  attention: Array<Record<string, unknown>>;
};

const labels: Record<string,string> = {
  open_leads: 'Open Leads', active_quotes: 'Active Quotes', active_orders: 'Active Orders', dispatch_attention: 'Dispatch Attention',
  carrier_alerts: 'Carrier Alerts', open_conversations: 'Open Conversations', unread_conversations: 'Unread Conversations',
  booked_revenue_cents: 'Booked Revenue', gross_profit_cents: 'Gross Profit', accounts_receivable_cents: 'Accounts Receivable',
};
const money = new Set(['booked_revenue_cents','gross_profit_cents','accounts_receivable_cents']);

export function DashboardView() {
  const [data,setData]=useState<Dashboard|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  async function load(){setLoading(true);setError('');try{setData(await apiRequest<Dashboard>('/v1/dashboard'))}catch(reason){setError(reason instanceof Error?reason.message:'Dashboard failed')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  return <main className="page">
    <div className="page-header"><div><h1>Dashboard</h1><p>Live operational status across sales, brokerage, carriers, communication and finance.</p></div><button className="icon-button" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
    {error?<div className="error-state">{error}</div>:null}
    {data?<>
      <section className="kpi-grid">{Object.entries(data.summary).slice(0,10).map(([key,value])=><article className="kpi" key={key}><span>{labels[key]??key.replaceAll('_',' ')}</span><strong>{money.has(key)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100):new Intl.NumberFormat('en-US').format(value)}</strong></article>)}</section>
      <div className="two-column">
        <section className="panel"><div className="panel-head"><h2>Recent Activity</h2><span>{data.recentActivity.length} events</span></div>{data.recentActivity.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>Time</th></tr></thead><tbody>{data.recentActivity.map((row,index)=><tr key={String(row.id??index)}><td>{String(row.action??'—')}</td><td>{String(row.entity_type??'—')} · {String(row.entity_id??'—')}</td><td>{String(row.actor_name??'System')}</td><td>{row.created_at?new Date(String(row.created_at)).toLocaleString('en-US'):'—'}</td></tr>)}</tbody></table></div>:<div className="empty-state">No audit activity yet.</div>}</section>
        <section className="panel"><div className="panel-head"><h2>Needs Attention</h2><span>{data.attention.length} items</span></div>{data.attention.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Item</th><th>Status</th></tr></thead><tbody>{data.attention.map((row,index)=><tr key={String(row.entity_id??index)}><td>{String(row.kind??'—')}</td><td>{String(row.label??row.entity_id??'—')}</td><td><span className="badge" data-tone="warn">{String(row.status??'attention')}</span></td></tr>)}</tbody></table></div>:<div className="empty-state">Nothing needs attention right now.</div>}</section>
      </div>
    </>:loading?<div className="empty-state">Loading operational data…</div>:null}
  </main>;
}
