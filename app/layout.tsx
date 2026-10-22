import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { StoreProvider } from "@/components/providers/StoreProvider";
import BackToTop from "@/components/layout/BackToTop";
import SiteFooter from "@/components/layout/SiteFooter";
import PwaManager from "@/components/pwa/PwaManager";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://belglow.com"),
  title: { default: "BelGlow | Belizean Beauty Marketplace", template: "%s | BelGlow" },
  description: "Shop beauty and self-care products from independent Belizean sellers on BelGlow.",
  applicationName: "BelGlow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BelGlow" },
  icons: {
    icon: [{ url: "/pwa-icon/192", type: "image/png", sizes: "192x192" }, { url: "/pwa-icon/512", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/pwa-icon/180", type: "image/png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  openGraph: { title: "BelGlow Marketplace", description: "Discover beauty and self-care products from independent Belizean sellers.", type: "website", locale: "en_BZ" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ef4b74",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${playfair.variable}`}
    >
      <body><StoreProvider>{children}<SiteFooter /><PwaManager /><BackToTop /></StoreProvider></body>
    </html>
  );
}
