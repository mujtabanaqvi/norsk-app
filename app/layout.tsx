import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Norskprøven Muntlig B1/B2 Simulator Backend',
  description: 'Backend API for Norwegian oral exam practice (HK-dir B1/B2)',
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
