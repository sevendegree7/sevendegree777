import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "seven degree pos",
  description: "bakery and food truck cloud pos",
  // installed on the home screen, ios drops the safari chrome and stops
  // evicting the app's storage the way it does for a plain tab
  appleWebApp: {
    capable: true,
    title: "7 pos",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#292524",
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-100 text-stone-900">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
