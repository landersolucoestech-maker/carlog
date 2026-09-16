export const carlogTheme = Object.freeze({
  colors: {
    background: '#f5f6f8', surface: '#ffffff', surfaceMuted: '#f9fafb', text: '#16181d', muted: '#69707d', border: '#e5e7eb',
    accent: '#ef6c24', accentHover: '#d85814', dark: '#111318', darkElevated: '#1a1d24', success: '#168557', warning: '#ae6d00', danger: '#c63b3b'
  },
  radius: { small: '10px', medium: '14px', large: '18px' },
  shadow: '0 10px 30px rgba(17, 19, 24, 0.08)'
});

export const adminNavigation = [
  { group: 'Overview', items: ['Dashboard'] },
  { group: 'Sales', items: ['Leads', 'Quotes', 'Customers'] },
  { group: 'Brokerage', items: ['Orders', 'Dispatch', 'Carriers'] },
  { group: 'Operations', items: ['Communications', 'Documents'] },
  { group: 'Finance', items: ['Finance', 'Reports'] },
  { group: 'Website', items: ['Pages', 'Media', 'Navigation', 'Forms', 'SEO', 'Marketing'] },
  { group: 'Platform', items: ['Automations', 'AI Skills', 'Integrations', 'Users & Roles', 'Security', 'Audit'] }
] as const;
