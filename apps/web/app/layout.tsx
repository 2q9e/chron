import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/hanken-grotesk";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Chron — Make room for learning.",
  description:
    "Chron is being built as an academic workspace for planning, study materials, and research.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
