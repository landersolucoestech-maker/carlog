'use client';

import { useParams } from 'next/navigation';
import { AdminShell } from '../../modules/platform/admin-shell';
import { DataModulePage } from '../../modules/platform/data-module-page';
import { QuotesView } from '../../modules/quotes/quotes-view';
import { DispatchView } from '../../modules/dispatch/dispatch-view';
import { InboxView } from '../../modules/communication/inbox-view';

export default function ModulePage() {
  const params = useParams<{ module: string }>();
  const key = params.module;
  const content = key === 'quotes' ? <QuotesView /> : key === 'dispatch' ? <DispatchView /> : key === 'communications' ? <InboxView /> : <DataModulePage moduleKey={key} />;
  return <AdminShell>{content}</AdminShell>;
}
