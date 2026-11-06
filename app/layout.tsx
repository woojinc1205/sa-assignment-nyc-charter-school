import type { Metadata, Viewport } from "next";
import "@/styles/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find a Charter School Near You",
  description: "Map of every charter school campus across New York City's five boroughs. Filter by borough and grade level.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#005E9E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Akkurat LL is licensed; Inter is the design system's stand-in (PRD 6.6). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" />
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
