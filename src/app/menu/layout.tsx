import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./menu.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-menu-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-menu-body",
});

export const metadata: Metadata = {
  title: "seven degree · menu",
  description: "live menu — what's available right now on the truck",
};

export default function MenuLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${display.variable} ${body.variable} menu-root min-h-screen`}
    >
      {children}
    </div>
  );
}
