import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/hanken-grotesk";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Chron — Academic calendar",
  description: "Plan study time, deadlines, and personal commitments in Chron.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
