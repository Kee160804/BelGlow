import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://belglow.store";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/dashboard/", "/account/", "/checkout/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
