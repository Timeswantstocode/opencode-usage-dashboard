import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TooltipLayer } from '@/components/ui/TooltipLayer';
import './globals.css';

export const metadata: Metadata = {
  title: 'opencode. — Usage Dashboard',
  description: 'Local usage, token and cost dashboard for OpenCode sessions.',
};

/**
 * Runs in <head> before the first paint: apply the saved theme, or follow the
 * OS preference on a first visit. `stone` is the server-rendered default.
 */
const THEME_SCRIPT = `(function(){try{var saved=localStorage.getItem('ocd-theme');var theme=saved==='paper'||saved==='stone'?saved:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'paper':'stone');document.documentElement.setAttribute('data-theme',theme)}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="stone" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}<TooltipLayer /></body>
    </html>
  );
}
