import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Norskprøven Muntlig B1/B2 Control Plane',
  description: 'Backend control plane for Norwegian oral exam practice with LiveKit',
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

