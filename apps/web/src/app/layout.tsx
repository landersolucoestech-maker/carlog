import './globals.css';

export const metadata = {
  title: 'Car Log',
  description: 'Auto transport brokerage and vehicle shipping services.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
