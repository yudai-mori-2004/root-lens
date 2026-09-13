import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Noto_Sans_JP } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "RootLens",
    template: "%s | RootLens",
  },
  description: "First-person footage of real work, collected with consent and delivered as embodied-AI training data.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.variable}`}>
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
