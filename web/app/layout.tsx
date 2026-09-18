import type { Metadata } from "next";
import { BIZ_UDMincho, Courier_Prime, Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const siteUrl = "https://www.rootlens.io";
const siteName = "RootLens";
const siteDescription = "RootLensは、日本の現場で働く人の手作業を一人称視点で記録し、現場の同意と承認を経たデータとして、フィジカルAI・ロボティクスの研究開発に届けます。";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-lp-body",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const bizUdMincho = BIZ_UDMincho({
  variable: "--font-typewriter-ja",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

const courierPrime = Courier_Prime({
  variable: "--font-typewriter-en",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "フィジカルAI・ロボティクス向け現場作業データ | RootLens",
    template: "%s | RootLens",
  },
  description: siteDescription,
  applicationName: siteName,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const localizedSiteDescription = locale === "ja"
    ? siteDescription
    : "RootLens records hands-on work from a first-person perspective in Japanese workplaces, then delivers the data for physical AI and robotics research after workplace consent and approval.";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: siteName,
        url: `${siteUrl}/`,
        email: "contact@rootlens.io",
        sameAs: ["https://x.com/rootlens_sol"],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: siteName,
        url: `${siteUrl}/`,
        description: localizedSiteDescription,
        inLanguage: locale,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  });

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.variable} ${bizUdMincho.variable} ${courierPrime.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
        {/* messages を渡さないと useTranslations() をクライアントで使う画面が全部
            キーを素で出す (=/sample の 4 パネルビューアで起きた実障害)。
            getMessages() は現在 locale の messages/*.json 全体を返す。 全部渡しても
            SSR 直後の payload に混ざるだけで、 next-intl が namespace ごとに tree-shake する。 */}
        <NextIntlClientProvider locale={locale} messages={await getMessages()}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
