import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/internal/agreements": ["./assets/fonts/**"],
    "/api/operator/sites": ["./assets/fonts/**"],
    "/api/operator/invites/[token]/accept": ["./assets/fonts/**"],
  },
};

export default withNextIntl(nextConfig);
