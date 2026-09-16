export type ModuleDefinition = {
  key: string;
  label: string;
  group: 'Overview'|'Sales'|'Brokerage'|'Operations'|'Finance'|'Website'|'Platform';
  href: string;
  endpoint: string;
  permission: string;
  description: string;
};

export const modules: ModuleDefinition[] = [
  { key:'dashboard',label:'Dashboard',group:'Overview',href:'/',endpoint:'/v1/dashboard',permission:'lead.read',description:'Operational overview and attention queue.' },
  { key:'leads',label:'Leads',group:'Sales',href:'/leads',endpoint:'/v1/leads',permission:'lead.read',description:'Inbound opportunities, attribution and assignment.' },
  { key:'quotes',label:'Quotes',group:'Sales',href:'/quotes',endpoint:'/v1/quotes',permission:'quote.read',description:'Pricing, margin, delivery and acceptance.' },
  { key:'customers',label:'Customers',group:'Sales',href:'/customers',endpoint:'/v1/customers',permission:'lead.read',description:'Commercial customer profiles derived from contacts.' },
  { key:'orders',label:'Orders',group:'Brokerage',href:'/orders',endpoint:'/v1/orders',permission:'order.read',description:'Booked transport lifecycle and shipment economics.' },
  { key:'dispatch',label:'Dispatch',group:'Brokerage',href:'/dispatch',endpoint:'/v1/dispatch',permission:'dispatch.read',description:'Carrier assignment and operational shipment state.' },
  { key:'carriers',label:'Carriers',group:'Brokerage',href:'/carriers',endpoint:'/v1/carriers',permission:'carrier.read',description:'Carrier onboarding, compliance facts and eligibility.' },
  { key:'communications',label:'Communications',group:'Operations',href:'/communications',endpoint:'/v1/conversations',permission:'communication.read',description:'Unified Inbox across website, Dialpad and social channels.' },
  { key:'documents',label:'Documents',group:'Operations',href:'/documents',endpoint:'/v1/documents',permission:'document.read',description:'Private operational documents and compliance files.' },
  { key:'finance',label:'Finance',group:'Finance',href:'/finance',endpoint:'/v1/finance',permission:'finance.read',description:'Revenue, carrier cost, gross profit and payment exposure.' },
  { key:'reports',label:'Reports',group:'Finance',href:'/reports',endpoint:'/v1/reports/sales-funnel',permission:'lead.read',description:'Sales, brokerage economics and acquisition reporting.' },
  { key:'pages',label:'Pages',group:'Website',href:'/pages',endpoint:'/v1/cms/pages',permission:'cms.read',description:'Versioned website pages and publishing workflow.' },
  { key:'media',label:'Media',group:'Website',href:'/media',endpoint:'/v1/cms/media',permission:'cms.read',description:'Private CMS media library with signed delivery.' },
  { key:'navigation',label:'Navigation',group:'Website',href:'/navigation',endpoint:'/v1/cms/navigation',permission:'cms.read',description:'Public website navigation structure.' },
  { key:'forms',label:'Forms',group:'Website',href:'/forms',endpoint:'/v1/cms/forms',permission:'cms.read',description:'Website forms mapped to CRM ingestion.' },
  { key:'marketing',label:'Marketing',group:'Website',href:'/marketing',endpoint:'/v1/marketing/content',permission:'marketing.read',description:'Content distribution, campaign attribution, conversions and performance.' },
  { key:'automations',label:'Automations',group:'Platform',href:'/automations',endpoint:'/v1/automations',permission:'automation.read',description:'Event-driven workflows, waits, retries and approvals.' },
  { key:'ai-skills',label:'AI Skills',group:'Platform',href:'/ai-skills',endpoint:'/v1/ai-skills',permission:'ai_skill.read',description:'Permissioned AI resources with explicit tools and approvals.' },
  { key:'integrations',label:'Integrations',group:'Platform',href:'/integrations',endpoint:'/v1/integrations',permission:'integration.read',description:'Provider accounts, capabilities, health and authorization.' },
  { key:'users',label:'Users & Roles',group:'Platform',href:'/users',endpoint:'/v1/users',permission:'user.read',description:'Internal users, roles and granular permissions.' },
  { key:'audit',label:'Audit',group:'Platform',href:'/audit',endpoint:'/v1/audit',permission:'audit.read',description:'Immutable operational and administrative history.' },
  { key:'settings',label:'Company Settings',group:'Platform',href:'/settings',endpoint:'/v1/settings/company',permission:'settings.manage',description:'Single-company platform configuration.' },
];

export const groups = ['Overview','Sales','Brokerage','Operations','Finance','Website','Platform'] as const;
export function moduleByKey(key: string) { return modules.find(module => module.key === key) ?? null; }
