/**
 * Root application layout for Spiral (`src/app/layout.tsx`).
 *
 * Feature overview & use cases:
 * - Configures PWA metadata, theme color (`#12091F`), viewport settings, and font
 *   stylesheets (`Sora` for headings/body and `JetBrains Mono` for labels/timers).
 * - Mounts `ServiceWorkerRegistrar` to enable offline-capable shell metadata without
 *   interfering with server-enforced session endpoints.
 */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { APP_META } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_META.name,
  description: APP_META.promise,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_META.name,
  },
};

export const viewport: Viewport = {
  themeColor: "#12091F",
  width: "device-width",
  initialScale: 1,
};

export interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Renders the root HTML shell for every screen in Spiral.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Devanagari:wght@400;500&family=Noto+Sans+Tamil:wght@400;500&family=Sora:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
