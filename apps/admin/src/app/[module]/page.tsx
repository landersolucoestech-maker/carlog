import { modules } from '../../modules/platform/module-registry';
import { ModuleView } from './module-view';

export function generateStaticParams() {
  return modules
    .filter(module => module.key !== 'dashboard')
    .map(module => ({ module: module.key }));
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <ModuleView moduleKey={module} />;
}
