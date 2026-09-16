'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from './auth-provider';

export function SignIn() {
  const { signIn, loading } = useAuth();
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError('');
    try { await signIn(email, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed'); }
  }

  return <main className="auth-page">
    <section className="auth-brand">
      <small>Car Log Admin OS</small>
      <h1>One operating system for the brokerage.</h1>
      <p>CRM, quotes, orders, dispatch, carriers, communications, finance, website content, automations, integrations and AI skills in one operational surface.</p>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <h2>Sign in</h2>
        <p>Use your Car Log account to access the platform.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button disabled={loading}>{loading ? 'Signing in…' : 'Continue'}</button>
          {error ? <div className="auth-error">{error}</div> : null}
        </form>
      </div>
    </section>
  </main>;
}
