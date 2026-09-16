'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { SignIn } from '../auth/sign-in';
import { groups, modules } from './module-registry';

const previewMode = process.env.NEXT_PUBLIC_PREVIEW_MODE === '1';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, user, loading, signOut } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="admin-loading">Loading Car Log Admin OS…</div>;
  if ((!session && !previewMode) || !user) return <SignIn />;

  const allowed = modules.filter(module => user.permissions.includes(module.permission));
  return <div className="admin-shell">
    <aside className="sidebar">
      <Link className="sidebar-brand" href="/"><span className="sidebar-mark">CL</span><span>Car Log Admin</span></Link>
      {groups.map(group => {
        const items = allowed.filter(item => item.group === group);
        if (!items.length) return null;
        return <div className="nav-group" key={group}>
          <div className="nav-group-title">{group}</div>
          {items.map(item => <Link className="nav-link" data-active={pathname===item.href?'true':undefined} href={item.href} key={item.key}>{item.label}</Link>)}
        </div>;
      })}
    </aside>
    <div className="admin-main">
      <header className="topbar">
        <div className="topbar-title"><strong>Car Log Connection</strong><span>{previewMode ? 'GitHub Pages Preview · Read-only' : 'Broker Management · CRM · CMS'}</span></div>
        <div className="topbar-actions">
          <div className="topbar-user"><strong>{user.displayName}</strong><span>{user.roles.join(', ') || 'No role assigned'}</span></div>
          {!previewMode ? <button className="icon-button" onClick={() => void signOut()}>Sign out</button> : null}
        </div>
      </header>
      {children}
    </div>
  </div>;
}
