import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Car Log Connection | Auto Transport Brokerage',
  description: 'Reliable vehicle transport brokerage with dedicated shipment coordination and carrier management.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
