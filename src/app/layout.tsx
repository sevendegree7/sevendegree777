import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Fraunces,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
} from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/ui/preferences";

import "./globals.css";

// the four faces from the brand book. all self hosted by next/font, which
// matters more here than anywhere else: a truck with no internet still has to
// render in the right type.

// display - headlines and the mark
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

// the italic accent line, used for the tagline and little else
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic", "normal"],
  display: "swap",
});

// body
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// arabic body, same family so a language switch does not change the texture
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// labels, ticket numbers and money. figures line up in a column, which is the
// whole reason a till wants a mono face.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Seven Degrees POS",
  description: "Cairo's cartographer of taste. Till, kitchen and stock.",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  // installed on the home screen, ios drops the safari chrome and stops
  // evicting the app's storage the way it does for a plain tab
  appleWebApp: {
    capable: true,
    title: "7°",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // cream and navy, so the browser chrome matches the theme instead of
  // sitting on top of it in the wrong colour
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1b2c" },
  ],
  // a till is a fixed layout. pinch zoom on a busy screen only loses taps.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // the boot script writes data-theme, lang and dir onto this element before
    // react ever runs, so the server markup and the first client render
    // disagree on purpose
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${cormorant.variable} ${plexSans.variable} ${plexArabic.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-ink">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
