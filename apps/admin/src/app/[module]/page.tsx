'use client';

import { useParams } from 'next/navigation';
import { AdminShell } from '../../modules/platform/admin-shell';
import { DataModulePage } from '../../modules/platform/data-module-page';

export default function ModulePage() {
  const params = useParams<{ module: string }>();
  return <AdminShell><DataModulePage moduleKey={params.module} /></AdminShell>;
}
