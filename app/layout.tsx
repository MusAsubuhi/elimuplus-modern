import './globals.css';
import type { Metadata } from 'next';

const DESC = 'Start. Start small. Start to finish. The Elimu+ Portal for participants, trainers, partner organisations and the founding team.';
export const metadata: Metadata = {
  metadataBase: new URL('https://portal.elimuplus.com'),
  title: { default: 'Elimu+ Portal', template: '%s \u00B7 Elimu+ Portal' },
  description: DESC,
  applicationName: 'Elimu+ Portal',
  icons: { icon: '/images/favicon.png', apple: '/images/favicon.png' },
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website', siteName: 'Elimu+ Portal', locale: 'en_KE', title: 'Elimu+ Portal', description: DESC,
    url: '/portal', images: [{ url: '/portal/og?p=/portal', width: 1200, height: 630, alt: 'Elimu+ Portal' }],
  },
  twitter: { card: 'summary_large_image', title: 'Elimu+ Portal', description: DESC, images: ['/portal/og?p=/portal'] },
};

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
