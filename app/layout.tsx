import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { StoreProvider } from "@/components/providers/StoreProvider";
import BackToTop from "@/components/layout/BackToTop";
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
  title: "BelGlow | Belizean Beauty, Naturally You",
  description: "Gentle, effective skincare essentials for your natural glow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${playfair.variable}`}
    >
      <body><StoreProvider>{children}<BackToTop /></StoreProvider></body>
    </html>
  );
}
