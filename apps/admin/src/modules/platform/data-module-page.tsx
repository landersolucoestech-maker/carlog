'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';
import { moduleByKey } from './module-registry';

function humanize(value: string) {
  return value.replaceAll('_',' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US').format(value);
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) { const date = new Date(text); if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-US'); }
  return text;
}
function normalize(data: unknown): Record<string,unknown>[] {
  if (Array.isArray(data)) return data.filter((item): item is Record<string,unknown> => Boolean(item && typeof item==='object' && !Array.isArray(item)));
  if (data && typeof data==='object') return [data as Record<string,unknown>];
  return [];
}

export function DataModulePage({ moduleKey }: { moduleKey: string }) {
  const module = moduleByKey(moduleKey);
  const { user } = useAuth();
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!module) return;
    setLoading(true); setError('');
    try { setData(await apiRequest<unknown>(module.endpoint)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [module?.key]);
  const rows = useMemo(() => normalize(data), [data]);
  const columns = useMemo(() => {
    const preferred = ['id','status','name','title','email','phone','first_name','last_name','origin','destination','vehicle_description','provider','channel','legal_name','authority_status','insurance_status','internal_approval','risk_level','created_at','updated_at'];
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return [...preferred.filter(key => keys.includes(key)), ...keys.filter(key => !preferred.includes(key))].slice(0, 12);
  }, [rows]);

  if (!module) return <main className="page"><div className="error-state">Unknown module.</div></main>;
  if (!user?.permissions.includes(module.permission)) return <main className="page"><div className="error-state">You do not have permission to access this module.</div></main>;

  return <main className="page">
    <div className="page-header"><div><h1>{module.label}</h1><p>{module.description}</p></div><button className="icon-button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    {error ? <div className="error-state">{error}</div> : null}
    {!error ? <section className="panel">
      <div className="panel-head"><h2>{module.label}</h2><span>{loading ? 'Loading…' : `${rows.length} record${rows.length===1?'':'s'}`}</span></div>
      {loading ? <div className="empty-state">Loading current data…</div> : rows.length === 0 ? <div className="empty-state">No records yet.</div> : <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map(column => <th key={column}>{humanize(column)}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={String(row.id ?? index)}>{columns.map(column => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div>}
    </section> : null}
  </main>;
}
