import type { Metadata } from "next";

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
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
