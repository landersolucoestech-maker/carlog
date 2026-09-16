import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../modules/auth/auth-provider';

export const metadata: Metadata = {
  title: 'Car Log Admin OS',
  description: 'Car Log Connection broker management, CRM, CMS and operations platform.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
