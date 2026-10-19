import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Snakkly · Norskprøven Muntlig',
    template: '%s · Snakkly',
  },
  description: 'Øv til muntlig Norskprøven (HK-dir B1/B2) med AI-sensor og direkte tilbakemelding.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
