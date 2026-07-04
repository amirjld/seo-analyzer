import type { Metadata } from "next";
import { Exo_2 } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankLens SEO Analyzer",
  description:
    "Analyze on-page SEO signals and get prioritized recommendations.",
    icons : {
      icon : "/ranklens-logo.svg"
    }
};

const font = Exo_2({
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <body className={font.className}>{children}</body>
    </html>
  );
}
