import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Fleet Analytics",
  description: "Fleet analytics and automation status",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className={`${geist.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
