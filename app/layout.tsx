import type { Metadata, Viewport } from "next";
import { Caveat, Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// next/font self-hosts and subsets these at build time, so there is no
// render-blocking request to a font CDN and no flash of unstyled text. It
// replaces four @fontsource packages that shipped every weight and glyph.
const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-mono" });
const hand = Caveat({ subsets: ["latin"], weight: ["500"], display: "swap", variable: "--font-hand" });

const title = "AdPilot · Content Intelligence Agent";
const description = "Research → write → verify → self-revise → human approval. Team Gamma, AI FDE Fellowship.";

// Without metadataBase, Next resolves og:image against localhost, so a shared
// link would point at the reader's own machine. Vercel sets VERCEL_URL; set
// NEXT_PUBLIC_SITE_URL anywhere else.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "AdPilot",
    images: [{ url: "/og.jpg", width: 1600, height: 1000, alt: "The AdPilot content intelligence agent workspace" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applied before first paint so the chosen theme does not flash. Falls back to
// light when nothing is stored or storage is unavailable.
const themeInit = `try{var t=localStorage.getItem('adpilot.theme');document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
