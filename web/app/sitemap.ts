import type { MetadataRoute } from "next";

const siteUrl = "https://www.rootlens.io";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/buy`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/contribute`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/data-policy`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/sample`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/safety`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
