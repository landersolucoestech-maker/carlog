'use client';

import { supabase } from './supabase';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.carlogconnection.com';

export type ApiErrorPayload = { error?: string; correlationId?: string };

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Authentication is required');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', crypto.randomUUID());
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try { payload = await response.json() as ApiErrorPayload; } catch {}
    const error = new Error(payload.error || `Request failed with status ${response.status}`);
    Object.assign(error, { status: response.status, correlationId: payload.correlationId });
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
