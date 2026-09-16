'use client';

import { DashboardView } from '../modules/dashboard/dashboard-view';
import { AdminShell } from '../modules/platform/admin-shell';

export default function DashboardPage() {
  return <AdminShell><DashboardView /></AdminShell>;
}
