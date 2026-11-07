import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://blog-five-kappa-73.vercel.app"),
  title: {
    default: "Fieldnotes — Ideas worth keeping",
    template: "%s · Fieldnotes",
  },
  description:
    "A quiet publication for essays, poems, stories, letters and birthday specials.",
  openGraph: {
    type: "website",
    siteName: "Fieldnotes",
    title: "Fieldnotes — Ideas worth keeping",
    description:
      "A quiet publication for essays, poems, stories, letters and birthday specials.",
    images: ["/social-card.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fieldnotes — Ideas worth keeping",
    description:
      "A quiet publication for essays, poems, stories, letters and birthday specials.",
    images: ["/social-card.svg"],
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  other: {
    "theme-color": "#173d2d",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Fieldnotes",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
