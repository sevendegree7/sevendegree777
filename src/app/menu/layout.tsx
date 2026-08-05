import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./menu.css";

// the brand faces are already loaded by the root layout, so this page adds no
// fonts of its own - a guest on truck wifi should not download a second set

export const metadata: Metadata = {
  title: "Seven Degrees · Menu",
  description: "Cairo's cartographer of taste. What is on the counter today.",
};

export default function MenuLayout({ children }: { children: ReactNode }) {
  return <div className="menu-root min-h-screen">{children}</div>;
}
