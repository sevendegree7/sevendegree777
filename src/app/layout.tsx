import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { ServiceWorker } from "@/components/service-worker";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/ui/preferences";

import "./globals.css";

// brand faces live in src/app/fonts. next/font/google is intentionally not
// used: next 16 turbopack breaks when google returns a kit url with &, and a
// truck with no internet must still render in the right type.

const fraunces = localFont({
  variable: "--font-fraunces",
  display: "swap",
  src: [
    {
      path: "./fonts/fraunces-normal-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/fraunces-normal-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/fraunces-normal-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    {
      path: "./fonts/cormorant-normal-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/cormorant-normal-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/cormorant-italic-400.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/cormorant-italic-500.woff2",
      weight: "500",
      style: "italic",
    },
  ],
});

const plexSans = localFont({
  variable: "--font-plex-sans",
  display: "swap",
  src: [
    {
      path: "./fonts/plex-sans-normal-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/plex-sans-normal-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/plex-sans-normal-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

const plexArabic = localFont({
  variable: "--font-plex-arabic",
  display: "swap",
  src: [
    {
      path: "./fonts/plex-arabic-normal-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/plex-arabic-normal-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/plex-arabic-normal-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  display: "swap",
  src: [
    {
      path: "./fonts/plex-mono-normal-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/plex-mono-normal-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
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
        {/* stays a plain tag in the head on purpose. next/script with
            beforeInteractive puts this at the top of the body instead, and the
            theme has to be decided before the first paint or the till flashes
            cream then snaps to navy. react only warns about a script it
            re-renders on the client, which happens when something else has
            already crashed hydration. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-ink">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
