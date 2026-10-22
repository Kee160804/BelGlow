import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://belglow.com";
  return ["", "/shop", "/categories", "/about", "/contact", "/track-order", "/seller-application", "/policies"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/shop" ? "daily" as const : "monthly" as const,
    priority: path === "" ? 1 : path === "/shop" ? 0.9 : 0.6,
  }));
}
