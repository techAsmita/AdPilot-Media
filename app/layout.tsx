import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/caveat/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdPilot · Content Intelligence Agent",
  description: "Research → write → verify → self-revise → human approval. Team Gamma, AI FDE Fellowship.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Always open in light mode; dark mode is a per-visit toggle.
const themeInit = `document.documentElement.dataset.theme='light';try{localStorage.removeItem('adpilot.theme')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
