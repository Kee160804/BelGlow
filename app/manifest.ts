import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BelGlow Marketplace",
    short_name: "BelGlow",
    description: "Shop beauty and self-care products from independent Belizean sellers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffaf8",
    theme_color: "#ef4b74",
    orientation: "any",
    categories: ["shopping", "beauty", "lifestyle"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop", short_name: "Shop", description: "Browse BelGlow products", url: "/shop", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Track order", short_name: "Track", description: "Track a BelGlow order", url: "/track-order", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "My account", short_name: "Account", description: "Open your BelGlow account", url: "/account", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
    ],
  };
}
