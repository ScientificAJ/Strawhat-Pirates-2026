import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import "./research.css";

export const metadata: Metadata = {
  title: "Nova Ember — Combustion research, made clear",
  description:
    "Ask questions, discover NASA combustion investigations, compare evidence, and explore source data for fire-safety research.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
