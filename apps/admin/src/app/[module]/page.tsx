'use client';

import { useParams } from 'next/navigation';
import { AdminShell } from '../../modules/platform/admin-shell';
import { DataModulePage } from '../../modules/platform/data-module-page';
import { QuotesView } from '../../modules/quotes/quotes-view';
import { DispatchView } from '../../modules/dispatch/dispatch-view';
import { InboxView } from '../../modules/communication/inbox-view';
import { IntegrationsView } from '../../modules/integrations/integrations-view';
import { AutomationView } from '../../modules/automation/automation-view';
import { AiSkillsView } from '../../modules/ai/ai-skills-view';
import { PagesView } from '../../modules/cms/pages-view';
import { MarketingView } from '../../modules/marketing/marketing-view';

export default function ModulePage() {
  const params = useParams<{ module: string }>();
  const key = params.module;
  const specialized: Record<string, React.ReactNode> = {
    quotes: <QuotesView />,
    dispatch: <DispatchView />,
    communications: <InboxView />,
    integrations: <IntegrationsView />,
    automations: <AutomationView />,
    'ai-skills': <AiSkillsView />,
    pages: <PagesView />,
    marketing: <MarketingView />,
  };
  return <AdminShell>{specialized[key] ?? <DataModulePage moduleKey={key} />}</AdminShell>;
}
